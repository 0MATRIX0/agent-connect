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
        type: 'completed',
      };

      if (event.data) {
        try {
          data = { ...data, ...event.data.json() };
        } catch (e) {
          data.body = event.data.text();
        }
      }

      // Use unique tag so each notification shows as a new banner on iOS
      // (iOS silently replaces notifications with the same tag)
      const tag = `${data.type || 'completed'}-${Date.now()}`;

      const options = {
        body: data.body,
        icon: data.icon,
        tag: tag,
        renotify: true,
        data: {
          url: '/',
          type: data.type,
          ...data.data,
        },
      };

      // vibrate and requireInteraction are not supported on iOS
      // Only add them on platforms that support them
      if ('vibrate' in navigator) {
        const vibratePatterns = {
          completed: [100, 50, 100],
          input_needed: [200, 100, 200, 100, 200],
          error: [500, 200, 500],
        };
        options.vibrate = vibratePatterns[data.type] || vibratePatterns.completed;
        if (data.type === 'input_needed') {
          options.requireInteraction = true;
        }
      }

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
