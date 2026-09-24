"""Rastreia os pontos das linhas de chamada ao longo do giro.

Uso:
    python chamadas.py PASTA_DO_GIRO chamadas.json [--previa previa.jpg]

chamadas.json e uma lista de objetos:
    {"label": "Cadarco de corda", "at": [0.06, 0.2], "anchor": [0.5, 0.3]}

`at` e o trecho da volta (0 a 1) em que a chamada aparece e `anchor` e o ponto
no tenis (fracao do quadro) no MEIO desse trecho. O script segue esse ponto
quadro a quadro (fluxo optico Lucas-Kanade) para frente e para tras e imprime
`track`: 7 posicoes igualmente espacadas no trecho, para o site mover a
ponta da linha junto com a peca enquanto o tenis gira.
"""
import argparse
import bisect
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

SAMPLES = 7


def frame_at(curve, count, r):
    """Indice (fracionario) do quadro na posicao r da volta, pela curva de
    tempo do manifesto (sem curva: quadros igualmente espacados)."""
    r = r % 1.0
    if not curve:
        return r * count
    i = max(0, bisect.bisect_right(curve, r) - 1)
    nxt = curve[i + 1] if i + 1 < len(curve) else 1.0
    return i + (r - curve[i]) / max(nxt - curve[i], 1e-6)


def load(folder, count, i):
    im = Image.open(os.path.join(folder, "d", f"{i % count:03d}.webp")).convert("RGBA")
    bg = Image.new("RGBA", im.size, (128, 128, 128, 255))
    bg.alpha_composite(im)
    return cv2.cvtColor(np.asarray(bg.convert("RGB")), cv2.COLOR_RGB2GRAY), np.asarray(im)[..., 3]


def track(folder, count, w, h, at, anchor, curve=None):
    r0, r1 = at
    mid = (r0 + r1) / 2
    f_mid = round(frame_at(curve, count, mid))
    f0 = round(frame_at(curve, count, r0))
    f1 = round(frame_at(curve, count, r1))
    lk = dict(winSize=(31, 31), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
    positions = {f_mid: np.array([anchor[0] * w, anchor[1] * h], np.float32)}
    for direction, end in ((1, f1), (-1, f0)):
        prev_img, _ = load(folder, count, f_mid)
        point = positions[f_mid].reshape(1, 1, 2)
        f = f_mid
        while f != end:
            f += direction
            img, alpha = load(folder, count, f)
            nxt, status, _ = cv2.calcOpticalFlowPyrLK(prev_img, img, point, None, **lk)
            if status[0][0] == 1:
                x, y = nxt[0, 0]
                xi, yi = int(np.clip(x, 0, w - 1)), int(np.clip(y, 0, h - 1))
                if alpha[yi, xi] > 100:  # so aceita se o ponto continua em cima do tenis
                    point = nxt
            positions[f] = point.reshape(2).copy()
            prev_img = img
    frames = sorted(positions)
    out = []
    for k in range(SAMPLES):
        t = frame_at(curve, count, r0 + (r1 - r0) * k / (SAMPLES - 1))
        x = np.interp(t, frames, [positions[f][0] for f in frames])
        y = np.interp(t, frames, [positions[f][1] for f in frames])
        out.append([round(float(x) / w, 3), round(float(y) / h, 3)])
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # o console do Windows nao e UTF-8 por padrao
    ap = argparse.ArgumentParser()
    ap.add_argument("giro")
    ap.add_argument("chamadas")
    ap.add_argument("--previa")
    args = ap.parse_args()

    manifest = json.load(open(os.path.join(args.giro, "manifest.json"), encoding="utf-8"))
    d = manifest["sizes"]["d"]
    count, w, h = d["n"], d["w"], d["h"]
    curve = d.get("curve")
    specs = json.load(open(args.chamadas, encoding="utf-8"))
    result = []
    tiles = []
    for spec in specs:
        pts = track(args.giro, count, w, h, spec["at"], spec["anchor"], curve)
        result.append({"label": spec["label"], "at": spec["at"], "track": pts})
        if args.previa:
            for k in (0, SAMPLES // 2, SAMPLES - 1):
                r = spec["at"][0] + (spec["at"][1] - spec["at"][0]) * k / (SAMPLES - 1)
                im = Image.open(os.path.join(args.giro, "d", f"{round(frame_at(curve, count, r)) % count:03d}.webp")).convert("RGBA")
                bg = Image.new("RGBA", im.size, (40, 40, 60, 255))
                bg.alpha_composite(im)
                arr = np.asarray(bg.convert("RGB")).copy()
                x, y = int(pts[k][0] * w), int(pts[k][1] * h)
                cv2.circle(arr, (x, y), 12, (255, 60, 60), 3)
                cv2.putText(arr, f"{spec['label']} r={r:.2f}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
                tiles.append(cv2.resize(arr, (w // 2, h // 2)))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.previa and tiles:
        rows = [np.hstack(tiles[i : i + 3]) for i in range(0, len(tiles), 3)]
        Image.fromarray(np.vstack(rows)).save(args.previa, quality=82)


if __name__ == "__main__":
    main()
