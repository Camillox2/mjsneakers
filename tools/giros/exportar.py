"""Transforma os mestres recortados (cortar.py) nos quadros que o site usa.

Uso:
    python exportar.py PASTA_MESTRES PASTA_SAIDA --id violeta [--despill vermelho]

O que faz, em ordem:
1. Acha o quadro que fecha a volta (o mais parecido com o primeiro na segunda
   metade) e descarta o que passa de uma volta.
2. Retemporiza: videos gerados por IA aceleram no meio e freiam nas pontas.
   Mede o movimento entre quadros e redistribui, para o giro ter velocidade
   constante na rolagem.
3. Estabiliza: tira a deriva de posicao e de zoom do video (a altura do tenis
   quase nao muda com o angulo, entao ela serve de regua de escala).
4. Remove o reflexo da cor do fundo que ficou no proprio tenis (--despill).
5. Exporta WebP com transparencia em dois tamanhos (d = computador,
   m = celular), o poster, e o manifest.json com a sombra por quadro e a
   silhueta vetorial (contorno + linhas de croqui) do quadro de perfil.
"""
import argparse
import glob
import hashlib
import json
import os

import cv2
import numpy as np
from PIL import Image

PREVIEW = 160


def premultiply(rgba):
    f = rgba.astype(np.float32)
    f[..., :3] *= f[..., 3:4] / 255.0
    return f


def unpremultiply(f):
    a = f[..., 3:4]
    rgb = np.where(a > 0.5, f[..., :3] * 255.0 / np.maximum(a, 1e-3), 0)
    return np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 255)]).round().astype(np.uint8)


def small(f):
    return cv2.resize(f, (PREVIEW, PREVIEW), interpolation=cv2.INTER_AREA)


def loop_end(previews):
    ref = previews[0]
    half = len(previews) // 2
    dist = [float(np.abs(p - ref).mean()) for p in previews[half:]]
    return half + int(np.argmin(dist))


def gray_for_flow(rgba):
    f = rgba.astype(np.float32)
    al = f[..., 3:4] / 255.0
    comp = f[..., :3] * al + 128.0 * (1.0 - al)
    return cv2.cvtColor(comp.astype(np.uint8), cv2.COLOR_RGB2GRAY)


def flow_between(a, b, ts):
    """Quadros intermediarios por fluxo optico: onde o video girou rapido
    demais entre dois quadros, calcula para onde cada pixel foi e gera as
    posicoes do meio (em vez de so misturar duas poses distantes)."""
    fab = cv2.calcOpticalFlowFarneback(gray_for_flow(a), gray_for_flow(b), None, 0.5, 4, 21, 4, 7, 1.5, 0)
    h, w = a.shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    pa, pb = premultiply(a), premultiply(b)
    out = []
    for t in ts:
        wa = cv2.remap(pa, gx - t * fab[..., 0], gy - t * fab[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        wb = cv2.remap(pb, gx + (1 - t) * fab[..., 0], gy + (1 - t) * fab[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        out.append(unpremultiply(np.clip((1 - t) * wa + t * wb, 0, None)))
    return out


def densify(frames, previews, limit=4):
    """Insere quadros intermediarios nos passos grandes (> 1.8x a mediana).
    Cuidado: os passos grandes sao justamente onde o tenis vira rapido (de
    frente para a camera), e ali o fluxo optico erra e o quadro inventado sai
    borrado, com fantasma. Por isso so roda com --intermediarios."""
    n = len(frames)
    steps = np.array([float(np.abs(previews[(i + 1) % n] - previews[i]).mean()) for i in range(n)])
    med = float(np.median(steps))
    out = []
    added = 0
    for i in range(n):
        out.append(frames[i])
        if steps[i] > med * 1.8:
            m = int(min(limit, round(steps[i] / med) - 1))
            if m > 0:
                ts = [(k + 1) / (m + 1) for k in range(m)]
                out.extend(flow_between(frames[i], frames[(i + 1) % n], ts))
                added += m
    return out, added


def motion_curve(previews):
    """Posicao de cada quadro na volta (0 a 1), pelo movimento acumulado.
    Videos gerados por IA nao giram em velocidade constante; em vez de
    escolher quadros (o que repete quadro onde o video corre e pula depois),
    o site recebe todos e usa esta curva para andar em angulo constante,
    misturando os dois quadros vizinhos."""
    n = len(previews)
    steps = np.array([float(np.abs(previews[(i + 1) % n] - previews[i]).mean()) for i in range(n)])
    steps = np.maximum(steps, np.median(steps) * 0.15)
    pos = np.concatenate([[0.0], np.cumsum(steps[:-1])])
    return pos / steps.sum()


def retime(previews, count):
    n = len(previews)
    steps = np.array([float(np.abs(previews[(i + 1) % n] - previews[i]).mean()) for i in range(n)])
    steps = np.maximum(steps, np.median(steps) * 0.15)  # quadro parado nao pode "sumir"
    pos = np.concatenate([[0.0], np.cumsum(steps[:-1])])
    total = steps.sum()
    targets = np.arange(count) * total / count
    return [int(np.argmin(np.abs(pos - t))) for t in targets]


def circular_smooth(values, window):
    values = np.asarray(values, dtype=np.float64)
    window = max(3, window | 1)
    pad = window // 2
    ext = np.concatenate([values[-pad:], values, values[:pad]])
    kernel = np.hanning(window + 2)[1:-1]
    kernel /= kernel.sum()
    return np.convolve(ext, kernel, mode="valid")


def bbox(alpha):
    ys, xs = np.nonzero(alpha > 40)
    return xs.min(), ys.min(), xs.max(), ys.max()


def despill_towards(rgba, fundo, forca=0.7):
    """Tira do tenis o tom que a luz do fundo jogou nele (branco que ficou
    azulado num fundo azul, por exemplo). Remove so a componente de cor na
    direcao da cor do fundo: cores opostas (tenis vermelho em fundo verde)
    nao sao tocadas."""
    f = rgba[..., :3].astype(np.float32)
    bg = np.asarray(fundo, np.float32)
    bg_chroma = bg - bg.mean()
    norm = float(np.linalg.norm(bg_chroma))
    if norm < 1:
        return rgba
    unit = bg_chroma / norm
    chroma = f - f.mean(axis=2, keepdims=True)
    proj = np.clip((chroma * unit).sum(axis=2, keepdims=True), 0, None)
    # quanto mais neutro o pixel (branco, cinza), mais limpeza; cor forte e da peca
    sat = np.linalg.norm(chroma, axis=2, keepdims=True)
    weight = np.clip(1.0 - sat / 90.0, 0.25, 1.0)
    f = f - forca * weight * proj * unit
    out = rgba.copy()
    out[..., :3] = np.clip(f, 0, 255).round().astype(np.uint8)
    return out


def despill(rgba, mode):
    if mode == "nenhum":
        return rgba
    f = rgba.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    if mode == "vermelho":
        over = np.maximum(r - np.maximum(g, b), 0)
        f[..., 0] = r - over * 0.75
    elif mode == "amarelo":
        over = np.maximum(np.minimum(r, g) - b, 0)
        f[..., 0] = r - over * 0.7
        f[..., 1] = g - over * 0.7
    out = rgba.copy()
    out[..., :3] = np.clip(f[..., :3], 0, 255).round().astype(np.uint8)
    return out


def path_from_points(points, closed):
    """Catmull-Rom -> Bezier cubica: contorno liso a partir de um poligono."""
    pts = [tuple(map(float, p)) for p in points]
    n = len(pts)
    if n < 3:
        return ""
    d = [f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"]
    last = n if closed else n - 1
    for i in range(last):
        p0 = pts[(i - 1) % n] if closed or i > 0 else pts[i]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed or i + 2 < n else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}")
    if closed:
        d.append("Z")
    return "".join(d)


def sketch(rgba):
    """Contorno + linhas internas (costuras, sola, cadarco) do quadro de perfil."""
    alpha = rgba[..., 3]
    solid = (alpha > 127).astype(np.uint8)
    soft = (cv2.GaussianBlur(alpha, (0, 0), 2.2) > 127).astype(np.uint8)
    contours, _ = cv2.findContours(soft, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    outer = max(contours, key=cv2.contourArea)
    outer = cv2.approxPolyDP(outer, 2.0, True)[:, 0, :]
    outline = path_from_points(outer, closed=True)

    gray = cv2.cvtColor(rgba[..., :3], cv2.COLOR_RGB2GRAY)
    gray = cv2.bilateralFilter(gray, 7, 40, 7)
    edges = cv2.Canny(gray, 40, 110)
    inner = cv2.erode(solid, np.ones((9, 9), np.uint8))
    edges[inner == 0] = 0
    edges = cv2.dilate(edges, np.ones((2, 2), np.uint8))
    lines, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    scale = max(rgba.shape[:2])
    keep = []
    for c in lines:
        length = cv2.arcLength(c, False)
        if length < scale * 0.09:
            continue
        # contorno de uma linha dilatada vai e volta: fica so a metade
        pts = c[: max(3, len(c) // 2), 0, :].astype(np.float32)
        if len(pts) > 7:
            kernel = np.ones(5, np.float32) / 5
            pts = np.stack([np.convolve(pts[:, k], kernel, mode="valid") for k in (0, 1)], axis=1)
        chord = float(np.linalg.norm(pts[-1] - pts[0]))
        half = cv2.arcLength(pts.reshape(-1, 1, 2), False)
        if chord < half * 0.3 and half < scale * 0.25:
            continue  # ziguezague curto (cadarco, textura): suja o croqui
        pts = cv2.approxPolyDP(pts.reshape(-1, 1, 2), 2.0, False)[:, 0, :]
        if len(pts) >= 3:
            keep.append((length, path_from_points(pts, closed=False)))
    keep.sort(key=lambda item: -item[0])
    return outline, [d for _, d in keep[:28]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mestres")
    ap.add_argument("saida")
    ap.add_argument("--id", required=True)
    ap.add_argument("--despill", choices=["nenhum", "vermelho", "amarelo"], default="nenhum")
    ap.add_argument("--fundo", help="cor do fundo do video em R,G,B: tira do tenis o reflexo dessa cor (substitui --despill)")
    ap.add_argument("--forca", type=float, default=0.8, help="forca da limpeza do --fundo (fundo claro e saturado reflete mais: ~1.2)")
    ap.add_argument("--quadros-d", type=int, default=200, help="teto de quadros no computador (usa todos da volta ate esse limite)")
    ap.add_argument("--quadros-m", type=int, default=90, help="teto de quadros no celular")
    ap.add_argument("--largura-d", type=int, default=860)
    ap.add_argument("--largura-m", type=int, default=520)
    ap.add_argument("--aspecto", type=float, default=4 / 3, help="largura/altura do quadro final (igual para todos os giros)")
    ap.add_argument("--fim-volta", type=int, default=0, help="forca o quadro que fecha a volta (indice na lista de mestres)")
    ap.add_argument("--costura", type=int, default=12, help="quadros do inicio misturados com os que vem depois da volta (emenda sem pulo)")
    ap.add_argument("--costura-max", type=float, default=6.0, help="acima desta diferenca (em passos) entre as voltas do video, corte seco em vez de costura")
    ap.add_argument("--intermediarios", action="store_true", help="gera quadros por fluxo optico nos passos grandes (podem sair com fantasma)")
    args = ap.parse_args()

    fundo = [int(x) for x in args.fundo.split(",")] if args.fundo else None
    files = sorted(glob.glob(os.path.join(args.mestres, "*.png")))
    nums = [int(os.path.splitext(os.path.basename(f))[0]) for f in files]
    frames = [np.asarray(Image.open(f).convert("RGBA")) for f in files]
    pre = [premultiply(f) for f in frames]
    previews = [small(p) for p in pre]

    end = args.fim_volta or loop_end(previews)
    # quadros que o video mostra depois de fechar a volta: servem para costurar
    # o fim no comeco sem pulo. Tem que ser quadro a quadro do video: mestres
    # cortados com --passo 2 pulam quadros, e a costura andaria no dobro da
    # velocidade do comeco (poses diferentes = tenis duplicado)
    limit = min(args.costura, max(0, len(pre) - end), end // 4)
    seam = 0
    while seam < limit and nums[end + seam] == nums[end] + seam and nums[seam] == nums[0] + seam:
        seam += 1
    extra_pre = pre[end : end + seam]
    frames, pre, previews = frames[:end], pre[:end], previews[:end]
    print(f"{args.id}: {len(files)} mestres, volta fecha no {end}, costura {seam}")

    boxes = np.array([bbox(f[..., 3]) for f in frames], dtype=np.float64)
    heights = boxes[:, 3] - boxes[:, 1]
    cx = (boxes[:, 0] + boxes[:, 2]) / 2
    cy = (boxes[:, 1] + boxes[:, 3]) / 2
    window = max(5, len(frames) // 4)
    h_s, cx_s, cy_s = (circular_smooth(v, window) for v in (heights, cx, cy))
    ref_h, ref_x, ref_y = float(np.median(heights)), float(cx.mean()), float(cy.mean())

    size = frames[0].shape[1], frames[0].shape[0]
    stable = []
    for i, p in enumerate(pre):
        s = ref_h / h_s[i]
        m = np.array([[s, 0, ref_x - s * cx_s[i]], [0, s, ref_y - s * cy_s[i]]], dtype=np.float32)
        warped = cv2.warpAffine(p, m, size, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        frame = unpremultiply(np.clip(warped, 0, None))
        frame = despill_towards(frame, fundo, args.forca) if fundo else despill(frame, args.despill)
        stable.append(frame)

    # costura: o quadro j do comeco vira a passagem da continuacao do video
    # (quadro end+j, que emenda perfeito no ultimo) para o proprio quadro j,
    # ao longo dos `seam` primeiros quadros. A passagem e por fluxo optico
    # (a forma anda de uma pose para a outra); misturar as duas poses por
    # transparencia deixava o tenis duplicado nesses quadros.
    conts = []
    for j, p in enumerate(extra_pre):
        sc = ref_h / h_s[j]
        m = np.array([[sc, 0, ref_x - sc * cx_s[j]], [0, sc, ref_y - sc * cy_s[j]]], dtype=np.float32)
        warped = unpremultiply(np.clip(cv2.warpAffine(p, m, size, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0), 0, None))
        conts.append(despill_towards(warped, fundo, args.forca) if fundo else despill(warped, args.despill))
    # So vale costurar se a segunda volta do video for o mesmo tenis na mesma
    # pose. Quando a camera mexe entre uma volta e outra (zoom, angulo), o
    # fluxo nao acha a correspondencia e o morph vira borrao (tenis com
    # fantasma): nesse caso fica o corte seco, sem quadro inventado.
    if conts:
        prev_s = [small(premultiply(f)) for f in stable]
        step = float(np.median([np.abs(prev_s[i + 1] - prev_s[i]).mean() for i in range(len(prev_s) - 1)]))
        gap = float(np.median([np.abs(small(premultiply(c)) - prev_s[j]).mean() for j, c in enumerate(conts)])) / max(step, 1e-6)
        if gap > args.costura_max:
            print(f"{args.id}: costura desligada (a segunda volta do video difere {gap:.1f} passos da primeira)")
            conts = []
        else:
            print(f"{args.id}: costura de {len(conts)} quadros (diferenca {gap:.1f} passos)")
    for j, cont in enumerate(conts):
        stable[j] = flow_between(cont, stable[j], [j / max(seam, 1)])[0]

    # Enquadramento comum a todos os giros: uniao das caixas + respiro, ajustada
    # para a proporcao fixa (--aspecto), com o tenis centralizado. Assim orbitas,
    # sombra e chamadas usam o mesmo sistema de coordenadas em qualquer tenis.
    union = np.array([bbox(f[..., 3]) for f in stable], dtype=np.float64)
    ux0, uy0 = union[:, 0].min(), union[:, 1].min()
    ux1, uy1 = union[:, 2].max(), union[:, 3].max()
    margin = max(ux1 - ux0, uy1 - uy0) * 0.09
    box_w, box_h = ux1 - ux0 + 2 * margin, uy1 - uy0 + 2 * margin
    if box_w / box_h < args.aspecto:
        box_w = box_h * args.aspecto
    else:
        box_h = box_w / args.aspecto
    crop_w, crop_h = int(round(box_w / 2) * 2), int(round(box_h / 2) * 2)
    x0 = int(round((ux0 + ux1) / 2 - crop_w / 2))
    y0 = int(round((uy0 + uy1) / 2 - crop_h / 2))
    framed = []
    for f in stable:
        canvas = np.zeros((crop_h, crop_w, 4), np.uint8)
        sx0, sy0 = max(0, x0), max(0, y0)
        sx1, sy1 = min(size[0], x0 + crop_w), min(size[1], y0 + crop_h)
        canvas[sy0 - y0 : sy1 - y0, sx0 - x0 : sx1 - x0] = f[sy0:sy1, sx0:sx1]
        framed.append(canvas)
    stable = framed
    stable_previews = [small(premultiply(f)) for f in stable]
    if args.intermediarios:
        stable, added = densify(stable, stable_previews)
        if added:
            stable_previews = [small(premultiply(f)) for f in stable]
        print(f"{args.id}: {added} quadros intermediarios por fluxo optico")
    curve = motion_curve(stable_previews)
    print(f"{args.id}: enquadramento {crop_w}x{crop_h}")

    os.makedirs(args.saida, exist_ok=True)
    manifest = {"id": args.id, "aspect": round(crop_w / crop_h, 4), "sizes": {}}
    for key, count, width in (("d", args.quadros_d, args.largura_d), ("m", args.quadros_m, args.largura_m)):
        pool = list(range(len(stable)))
        count = min(count, len(pool))
        width = int(min(width, crop_w))
        height = int(round(width * crop_h / crop_w / 2) * 2)
        # todos os quadros da volta, na ordem; acima do teto, um a cada tantos
        # (por indice, sem repetir). A curva de tempo faz o resto no site.
        picks = [pool[int(i)] for i in np.round(np.linspace(0, len(pool), count, endpoint=False)).astype(int)]
        folder = os.path.join(args.saida, key)
        os.makedirs(folder, exist_ok=True)
        for old in glob.glob(os.path.join(folder, "*.webp")):
            os.remove(old)
        total = 0
        for n, idx in enumerate(picks):
            im = Image.fromarray(stable[idx], "RGBA").resize((width, height), Image.LANCZOS)
            path = os.path.join(folder, f"{n:03d}.webp")
            im.save(path, "WEBP", quality=80 if key == "d" else 74, alpha_quality=85, method=4)
            total += os.path.getsize(path)
        manifest["sizes"][key] = {"w": width, "h": height, "n": count, "curve": [round(float(curve[i]), 5) for i in picks]}
        if key == "d":
            shadow_w, shadow_y = [], []
            for idx in picks:
                bx0, by0, bx1, by1 = bbox(stable[idx][..., 3])
                shadow_w.append(round((bx1 - bx0) / crop_w, 3))
                shadow_y.append(round(by1 / crop_h, 3))
            manifest["shadow"] = {"w": shadow_w, "y": shadow_y}
            widest = int(np.argmax(shadow_w))
            profile = np.asarray(Image.open(os.path.join(folder, f"{widest:03d}.webp")).convert("RGBA"))
            outline, lines = sketch(profile)
            manifest["profile"] = {"frame": widest, "progress": round(float(curve[picks[widest]]), 4), "outline": outline, "lines": lines}
            Image.open(os.path.join(folder, "000.webp")).save(os.path.join(args.saida, "poster.webp"), "WEBP", quality=82, method=4)
        print(f"{args.id}/{key}: {count} quadros {width}x{height}, {total / 1024:.0f} KB")

    # rev muda quando qualquer quadro muda: o site pede os quadros com ?v=rev,
    # entao um giro regenerado nunca e servido do cache antigo do navegador
    digest = hashlib.sha1()
    for path in sorted(glob.glob(os.path.join(args.saida, "*", "*.webp"))):
        with open(path, "rb") as fh:
            digest.update(fh.read())
    manifest["rev"] = digest.hexdigest()[:10]

    with open(os.path.join(args.saida, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, separators=(",", ":"))


if __name__ == "__main__":
    main()
