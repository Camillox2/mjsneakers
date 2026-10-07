# Busca por palavras (loja + painel) — precisa de deploy na VPS

## Sintoma
- Busca da loja (`GET /api/products?search=`) só achava a frase exata no nome/descrição/tags:
  "nike dunk azul" ou "adidas campus" (marca está em outra tabela) não retornavam nada.
- Busca do painel (`GET /api/products/admin/list?search=`) tinha o mesmo problema e não achava pelo `#id`.

## O que mudou
- `backend/src/utils/validate.js`: novo `searchWords()` — quebra a busca em até 6 palavras,
  ignora palavras genéricas ("tênis", "sneaker", "de", "com"...), escapa `%`/`_`.
- `backend/src/controllers/productController.js`:
  - `getAll`: cada palavra precisa aparecer em nome, descrição, tags, **marca** ou **categoria** (AND entre palavras).
    O `COUNT(*)` agora faz o mesmo `LEFT JOIN` em `brands`/`categories`.
  - `adminList`: número (com ou sem `#`) busca pelo id; texto usa a mesma regra por palavras (+ slug).
- Somente leitura (SELECT). Nenhuma migração.

O frontend já funciona com o backend antigo (cai na frase exata); o deploy só melhora os resultados.

## Deploy
```bash
cd <repo na VPS> && git pull
# reiniciar o Node (pm2 restart <app> / systemctl restart <serviço>)
```

## Conferir
```bash
curl -s 'https://api.pizantt.com/api/products?search=adidas%20campus&limit=3' | head -c 400
curl -s 'https://api.pizantt.com/api/products?search=t%C3%AAnis%20nike&limit=3' | head -c 400
```
Os dois devem trazer produtos.
