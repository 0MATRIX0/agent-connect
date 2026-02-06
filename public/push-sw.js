// Minimal push-only service worker for Agent Connect
// No workbox, no precaching — just push notification handling

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  const promise = (async () => {
    try {
      let data = {
        title: 'Agent Connect',
        body: 'New notification',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        type: 'completed',
      };

      if (event.data) {
        try {
          data = { ...data, ...event.data.json() };
        } catch (e) {
          data.body = event.data.text();
        }
      }

      const typeConfig = {
        completed: { tag: 'completed', vibrate: [100, 50, 100] },
        input_needed: { tag: 'input_needed', vibrate: [200, 100, 200, 100, 200] },
        error: { tag: 'error', vibrate: [500, 200, 500] },
      };

      const config = typeConfig[data.type] || typeConfig.completed;

      const options = {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        tag: config.tag,
        vibrate: config.vibrate,
        data: {
          url: '/',
          type: data.type,
          ...data.data,
        },
        requireInteraction: data.type === 'input_needed',
      };

      await self.registration.showNotification(data.title, options);
    } catch (err) {
      console.error('Push handler error:', err);
      await self.registration.showNotification('Push Error', {
        body: err.message || String(err),
        tag: 'push-error',
      });
    }
  })();

  event.waitUntil(promise);
});

// Notification click event - handle user interaction
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  // no-op, can be used for analytics
});
