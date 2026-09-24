"""Recorta o tenis de cada quadro de um video de giro (mestres RGBA em PNG).

Uso:
    python cortar.py VIDEO.mp4 PASTA_MESTRES [--inicio 0] [--fim -1] [--passo 1]

Para cada quadro: rembg (isnet) gera a mascara, os buracos internos da mascara
sao fechados (o modelo as vezes "fura" um painel liso do cabedal) e a borda e
descontaminada com o fundo estimado, para nao sobrar halo da cor do estudio.
Quadros ja recortados sao pulados, entao da para interromper e retomar.
"""
import argparse
import os
import time

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove


def fill_holes(alpha):
    solid = (alpha > 127).astype(np.uint8) * 255
    h, w = solid.shape
    flood = solid.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if flood[seed[1], seed[0]] == 0:
            cv2.floodFill(flood, mask, seed, 128)
    out = alpha.copy()
    out[flood == 0] = 255  # nao alcancado a partir da borda: buraco dentro do tenis
    return out


def estimate_bg(rgb, alpha):
    # O fundo de estudio e suave, entao estimar em 1/4 da resolucao basta.
    h, w = alpha.shape
    small = cv2.resize(rgb, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    keep = cv2.resize((alpha < 8).astype(np.float32), (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    keep = cv2.erode((keep > 0.99).astype(np.float32), np.ones((5, 5), np.uint8))
    num = cv2.GaussianBlur(small * keep[..., None], (0, 0), 6)
    den = cv2.GaussianBlur(keep, (0, 0), 6)[..., None]
    num2 = cv2.GaussianBlur(small * keep[..., None], (0, 0), 24)
    den2 = cv2.GaussianBlur(keep, (0, 0), 24)[..., None]
    bg = np.where(den > 0.05, num / np.maximum(den, 1e-4), num2 / np.maximum(den2, 1e-4))
    return cv2.resize(bg, (w, h), interpolation=cv2.INTER_LINEAR)


def decontaminate(rgb, alpha, bg):
    a = alpha.astype(np.float32)[..., None] / 255.0
    edge = (a > 0.02) & (a < 0.985)
    fg = np.clip((rgb - (1 - a) * bg) / np.maximum(a, 0.02), 0, 255)
    return np.where(edge, fg, rgb)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("saida")
    ap.add_argument("--inicio", type=int, default=0)
    ap.add_argument("--fim", type=int, default=-1, help="ultimo quadro (inclusivo); -1 = ate o fim")
    ap.add_argument("--passo", type=int, default=1)
    ap.add_argument("--gpu", action="store_true", help="usa a placa de video (onnxruntime-directml); ~7x mais rapido")
    args = ap.parse_args()

    os.makedirs(args.saida, exist_ok=True)
    cap = cv2.VideoCapture(args.video)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fim = total - 1 if args.fim < 0 else min(args.fim, total - 1)
    providers = ["DmlExecutionProvider", "CPUExecutionProvider"] if args.gpu else ["CPUExecutionProvider"]
    session = new_session("isnet-general-use", providers=providers)

    index = -1
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        index += 1
        if index < args.inicio or index > fim or (index - args.inicio) % args.passo:
            continue
        dst = os.path.join(args.saida, f"{index:03d}.png")
        if os.path.exists(dst):
            continue
        t = time.time()
        src = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        mask = remove(src, session=session, post_process_mask=True, only_mask=True)
        alpha = fill_holes(np.asarray(mask, dtype=np.uint8))
        rgb = np.asarray(src, dtype=np.float32)
        rgb = decontaminate(rgb, alpha, estimate_bg(rgb, alpha))
        Image.fromarray(np.dstack([rgb.round().astype(np.uint8), alpha]), "RGBA").save(dst)
        print(f"{index:03d}/{fim:03d} {time.time() - t:.1f}s", flush=True)


if __name__ == "__main__":
    main()
