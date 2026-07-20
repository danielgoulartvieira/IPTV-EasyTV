const CACHE_NAME = 'easywebtv-cache-v1';

// Recursos estáticos que serão guardados imediatamente em cache (App Shell)
const STATIC_ASSETS = [
  'index.html',
  'css/main.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/video.js/7.20.3/video-js.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/video.js/7.20.3/video.min.js'
];

// Evento de Instalação - Salva o App Shell estrutural
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pré-cacheando a estrutura do app');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Evento de Ativação - Limpa caches antigos se houver atualização de versão
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Evento de Busca (Fetch) - Estratégia de cache inteligente
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Se for uma requisição para APIs, proxies ou streams m3u8, usamos Network-First
  // Isso garante que as listas de canais e episódios estejam sempre atualizadas diretamente da rede
  if (requestUrl.search.includes('ac=') || requestUrl.href.includes('.m3u8') || requestUrl.href.includes('cors.')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Se a rede falhar completamente nas requisições normais, tenta buscar um fallback se houver no cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // Para os assets estáticos (CSS, Fontes, JS do VideoJS), tenta Cache-First com fallback na rede
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // Se não estiver no cache, busca na rede e guarda uma cópia dinamicamente
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // Não cachear streams de vídeo reais para não estourar a memória do navegador
          if (!event.request.url.includes('.ts') && !event.request.url.includes('.mp4')) {
            cache.put(event.request, responseToCache);
          }
        });

        return networkResponse;
      });
    })
  );
});