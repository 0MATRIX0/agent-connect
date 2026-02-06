// Custom Service Worker code for Agent Notifier PWA
// This file is merged with next-pwa generated service worker

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  const promise = (async () => {
    try {
      console.log('Push received:', event);

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

      // Choose tag color/icon based on type
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
      // Show fallback notification so the error is visible on device
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
  console.log('Notification clicked:', event);

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Focus or open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event);
});
