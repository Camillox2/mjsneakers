import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================
// Cabeçalhos de segurança (CSP) gerados no build.
//
// - index.html ganha um <meta http-equiv="Content-Security-Policy"> com a
//   origem certa da API (VITE_API_URL), incluindo ws/wss para o socket do chat.
//   Meta não aceita frame-ancestors: esse vai nos cabeçalhos da hospedagem.
// - dist/_headers (Cloudflare Pages ou Netlify) sai do public/_headers com a
//   CSP completa no lugar de __PZ_CSP__ (com frame-ancestors 'none').
// - vercel.json (fixo, lido antes do build) leva a mesma CSP com a API em
//   "https: wss:"; o meta do index.html estreita para a origem exata, porque
//   o navegador aplica as duas políticas ao mesmo tempo.
//
// Só o necessário: a própria loja, a API, Google Fonts, Mercado Pago (SDK v2 e
// Card Payment Brick), Cloudflare Turnstile e ViaCEP. Estilo precisa de
// 'unsafe-inline' (style inline do React e do framer-motion); script não.
// ============================================================

const MERCADO_PAGO = [
  'https://*.mercadopago.com',
  'https://*.mercadopago.com.br',
  'https://*.mercadolibre.com',
  'https://*.mercadolivre.com',
  'https://*.mercadolivre.com.br',
  'https://*.mlstatic.com',
]
const TURNSTILE = 'https://challenges.cloudflare.com'

// origens http(s) e ws(s) da API a partir do VITE_API_URL
function apiOrigins(apiUrl) {
  try {
    if (!apiUrl || !/^https?:\/\//i.test(apiUrl)) return [] // mesma origem da loja
    const u = new URL(apiUrl)
    const ws = `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`
    return [u.origin, ws]
  } catch {
    return []
  }
}

export function buildCsp({ api = [], header = false } = {}) {
  const http = api.filter((o) => o.startsWith('http'))
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", 'https://sdk.mercadopago.com', ...MERCADO_PAGO, TURNSTILE],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://*.mlstatic.com'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://*.mlstatic.com'],
    'img-src': ["'self'", 'data:', 'blob:', ...http, ...MERCADO_PAGO],
    'media-src': ["'self'", 'blob:', ...http],
    'connect-src': ["'self'", ...api, 'https://viacep.com.br', ...MERCADO_PAGO, TURNSTILE],
    'frame-src': [...MERCADO_PAGO, TURNSTILE],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  }
  if (header) {
    directives['frame-ancestors'] = ["'none'"]
    directives['upgrade-insecure-requests'] = []
  }
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${[...new Set(v)].join(' ')}` : k))
    .join('; ')
}

function securityHeaders(apiUrl) {
  const api = apiOrigins(apiUrl)
  let outDir = 'dist'
  return {
    name: 'pz-security-headers',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp({ api }) },
          injectTo: 'head-prepend',
        },
      ]
    },
    closeBundle() {
      const file = path.join(outDir, '_headers')
      if (!fs.existsSync(file)) return
      const text = fs.readFileSync(file, 'utf8')
      fs.writeFileSync(file, text.replace(/Content-Security-Policy: __PZ_CSP__/, `Content-Security-Policy: ${buildCsp({ api, header: true })}`))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), securityHeaders(env.VITE_API_URL)],
    // versão do build, para o relatório de erros (lib/errorReporter.js)
    define: {
      __PZ_RELEASE__: JSON.stringify(env.VITE_RELEASE || new Date().toISOString().slice(0, 16)),
    },
    server: {
      port: 5173,
      open: true
    }
  }
})
