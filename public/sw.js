// ==============================================================================
// SERVICE WORKER CANÔNICO — MEUS IMÓVEIS (WEB PUSH PWA)
// Compatível com iOS Safari PWA (iOS 16.4+), Android e Desktop
// ==============================================================================

const CACHE_NAME = 'meus-imoveis-v1';

// Ativação imediata sem esperar fechamento de abas
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── 1. RECEBIMENTO DE PUSH NOTIFICATION ───────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {
        title: 'Meus Imóveis',
        body: event.data.text(),
      };
    }
  }

  const title = data.title || 'Meus Imóveis';
  const options = {
    body: data.body || '',
    icon: data.icon || '/pwa-192.png',
    badge: data.badge || '/favicon-32.png',
    tag: data.tag || 'general-notification',
    data: {
      url: data.url || '/dashboard',
      timestamp: Date.now(),
      ...data.extraData,
    },
    renotify: true,
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── 2. CLIQUE NA NOTIFICAÇÃO (DEEP LINKING RESILIENTE) ────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Procura uma aba já aberta do app
      for (const client of clientList) {
        if ('focus' in client) {
          // Se o cliente puder navegar, direciona para a URL do alerta
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }

      // Se não houver janela aberta (ex: PWA fechado no iOS/Desktop), abre nova
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
