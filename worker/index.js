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
          url: data.messageId ? `/?message=${data.messageId}` : '/',
          type: data.type,
          messageId: data.messageId,
          ...data.data,
        },
      };

      // Add action buttons for questions (max 2 per Web Push API)
      if (data.messageType === 'question' && data.options && data.options.length > 0) {
        options.actions = data.options.slice(0, 2).map((opt, i) => ({
          action: `option_${i}`,
          title: opt,
        }));
        if (data.options.length > 2) {
          options.body = `${data.body}\n(more options in app)`;
        }
        options.requireInteraction = true;
      }

      // vibrate and requireInteraction are not supported on iOS
      // Only add them on platforms that support them
      if ('vibrate' in navigator) {
        const vibratePatterns = {
          completed: [100, 50, 100],
          task_done: [100, 50, 100],
          planning_complete: [100, 50, 100, 50, 100],
          approval_needed: [200, 100, 200, 100, 200],
          input_needed: [200, 100, 200, 100, 200],
          command_execution: [100, 50, 100],
          error: [500, 200, 500],
        };
        options.vibrate = vibratePatterns[data.type] || vibratePatterns.completed;
        if (data.type === 'input_needed' || data.type === 'approval_needed') {
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

  const notificationData = event.notification.data || {};
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Handle question action button clicks
  if (event.action && event.action.startsWith('option_') && notificationData.messageId) {
    const optionIndex = parseInt(event.action.split('_')[1], 10);
    // We need to reconstruct the option value from the notification actions
    const actions = event.notification.actions || [];
    const selectedAction = actions[optionIndex];
    if (selectedAction) {
      const respondUrl = `${self.location.origin.replace(/:\d+$/, ':3109')}/api/messages/${notificationData.messageId}/respond`;
      event.waitUntil(
        fetch(respondUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: selectedAction.title, source: 'notification' }),
        }).catch(err => console.error('Failed to send response:', err))
      );
      return;
    }
  }

  // Deep link to message if available
  const targetUrl = notificationData.url || '/';

  // Focus or open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event);
});
