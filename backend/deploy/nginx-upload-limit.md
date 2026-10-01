# Limite de upload (nginx) — cadastro de produto com foto

## Sintoma
- Painel aceita fotos até 10 MB, multer no Node também.
- nginx na VPS rejeita corpos > ~1 MB com `413 Request Entity Too Large`.
- Via proxy Vercel (`pizantt.com/api/...`) uploads maiores podem virar `502 ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR`.
- O cadastro para no `POST /api/upload/single` (antes do `POST /api/products`).

## Correção na VPS (definitiva)
No server block de `api.pizantt.com` (e no upstream se houver):

```nginx
client_max_body_size 12m;
```

Depois:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Conferir:

```bash
# deve retornar 200 (com cookie admin + CSRF), não 413
curl -sS -o /dev/null -w '%{http_code}\n' -F 'image=@foto-2mb.jpg;type=image/jpeg' -F 'category=products' \
  -H "X-CSRF-Token: ..." -b 'pz_adm=...; pz_csrf=...' \
  https://api.pizantt.com/api/upload/single
```

## Mitigação no frontend (já no repo)
`uploadImage` em `frontend/src/pages/Admin/lib/api.js` reduz a imagem no navegador para ~900 KB antes do POST, para o cadastro funcionar mesmo com nginx em 1m. Ainda assim suba o limite no nginx para banners grandes e futuros uploads.

## Frontend (atualização)
`prepareUploadBlob` agora **falha com mensagem clara** se não conseguir ficar sob ~900 KB
(em vez de enviar o arquivo original e cair no 413/502). Darlan: hard-refresh (Ctrl+Shift+R)
depois do deploy Vercel para pegar o SW `pizantt-v6`.
