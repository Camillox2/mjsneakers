// Pizantt Drop SW: HTML sempre da rede (deploy aparece na hora), assets do
// build (com hash) em cache-first, quadros dos giros num cache próprio.
// v4: apaga o cache velho. Com o login por cookie, a API só entra no cache
// numa lista de rotas públicas (ver PUBLIC_API abaixo).
const CACHE_NAME = 'pizantt-v4';

// Rotas da API que podem ir para o cache (dado público, igual para todos).
// Todo o resto (conta, pedido, pagamento, login, segurança) é só rede: com
// o cookie de sessão, a resposta pode ser de uma pessoa e não pode ficar
// guardada no aparelho.
const PUBLIC_API = ['/products', '/brands', '/categories', '/banners', '/tickers', '/settings', '/legal', '/appearance', '/reviews/product'];
const GIROS_CACHE = 'pizantt-giros-v1';

self.addEventListener('install', () => {
  // Sem precache de '/' nem index.html: HTML é sempre network-first.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const keep = [CACHE_NAME, GIROS_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = (cacheName, request, res) => {
  if (res && res.status === 200) {
    const clone = res.clone();
    caches.open(cacheName).then((cache) => cache.put(request, clone));
  }
  return res;
};

const networkFirst = (request, cacheName) =>
  fetch(request).then((res) => put(cacheName, request, res)).catch(() => caches.match(request));

const cacheFirst = (request, cacheName) =>
  caches.match(request).then((cached) => cached || fetch(request).then((res) => put(cacheName, request, res)));

// Responde do cache na hora e atualiza em segundo plano: arquivo trocado com
// o mesmo nome (logo, ícone, foto de amostra) aparece na visita seguinte.
const staleWhileRevalidate = (event, cacheName) => {
  const { request } = event;
  const fresh = fetch(request).then((res) => put(cacheName, request, res));
  event.waitUntil(fresh.catch(() => {}));
  return caches.match(request).then((cached) => cached || fresh);
};

// Manifesto novo de um giro: apaga do cache os quadros de outras versões.
const pruneGiro = async (manifestUrl, res) => {
  try {
    const { rev } = await res.clone().json();
    if (!rev) return;
    const folder = manifestUrl.pathname.replace(/manifest\.json$/, '');
    const cache = await caches.open(GIROS_CACHE);
    const keys = await cache.keys();
    await Promise.all(
      keys
        .map((req) => new URL(req.url))
        .filter((u) => u.pathname.startsWith(folder) && u.searchParams.has('v') && u.searchParams.get('v') !== rev)
        .map((u) => cache.delete(u.href))
    );
  } catch {
    /* manifesto sem rev ou inválido: nada a limpar */
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Mercado Pago (SDK e Brick do cartão) e ViaCEP: o navegador fala direto
  // com eles, sem passar pelo cache. Um SDK velho em cache quebraria o
  // pagamento.
  if (/(^|\.)(mercadopago\.com|mercadopago\.com\.br|mercadolibre\.com|mercadolivre\.com|mercadolivre\.com\.br|mlstatic\.com|viacep\.com\.br|challenges\.cloudflare\.com)$/.test(url.hostname)) {
    return;
  }

  // Pagamento e pedido (rastreio, situação do Pix): sempre rede e nunca em
  // cache. A URL pode levar o access_token do pedido, e a resposta tem dado
  // pessoal.
  if (url.pathname.includes('/api/payments') || url.pathname.includes('/api/orders') || url.searchParams.has('access_token')) {
    event.respondWith(fetch(request));
    return;
  }

  // Estoque e frete: sempre rede. Disponibilidade e preço de envio precisam estar frescos.
  if (url.pathname.startsWith('/api/stock') || url.pathname.startsWith('/api/shipping')) {
    event.respondWith(fetch(request));
    return;
  }

  // Painel admin: só rede, sem cópia offline.
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Requisição autenticada (admin, pedidos do cliente): nunca vai para o cache.
  // Dado pessoal gravado no Cache Storage sobreviveria ao logout.
  if (request.headers.has('Authorization')) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname.startsWith('/giros/')) {
    if (url.pathname.endsWith('/manifest.json')) {
      event.respondWith(
        fetch(request)
          .then((res) => {
            if (res.ok) event.waitUntil(pruneGiro(url, res));
            return put(GIROS_CACHE, request, res);
          })
          .catch(() => caches.match(request))
      );
    } else if (url.searchParams.has('v')) {
      // quadro versionado (?v=rev do manifesto): imutável
      event.respondWith(cacheFirst(request, GIROS_CACHE));
    } else {
      event.respondWith(staleWhileRevalidate(event, GIROS_CACHE));
    }
    return;
  }

  // API pública (produtos, marcas, banners): rede primeiro, cache se estiver
  // offline. O que não está na lista pública nem passa pelo service worker.
  if (url.pathname.includes('/api/')) {
    const route = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
    if (!PUBLIC_API.some((p) => route === p || route.startsWith(`${p}/`) || route.startsWith(`${p}?`))) return;
    event.respondWith(networkFirst(request, CACHE_NAME));
    return;
  }

  // Navegação / HTML: sempre rede primeiro, nunca prende o site numa versão velha.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request, CACHE_NAME).then((res) => res || caches.match('/')));
    return;
  }

  // Build do Vite: nome com hash, conteúdo nunca muda.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // Resto (logo, ícones, amostras, fontes): cache na hora, atualiza por trás.
  event.respondWith(staleWhileRevalidate(event, CACHE_NAME));
});
