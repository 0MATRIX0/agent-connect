'use client';

import { useState, useEffect, useCallback } from 'react';

type SubscriptionStatus = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

interface StoredNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  icon: string;
  data: Record<string, unknown>;
  timestamp: string;
}

const typeColors: Record<string, string> = {
  completed: 'bg-green-500',
  planning_complete: 'bg-blue-400',
  approval_needed: 'bg-orange-500',
  input_needed: 'bg-yellow-500',
  command_execution: 'bg-purple-400',
  error: 'bg-red-500',
};

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function Home() {
  const [status, setStatus] = useState<SubscriptionStatus>('loading');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [message, setMessage] = useState<string>('');
  const [apiUrl, setApiUrl] = useState<string>('');
  const [vapidPublicKey, setVapidPublicKey] = useState<string>('');
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [notificationHistory, setNotificationHistory] = useState<StoredNotification[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotificationHistory(Array.isArray(data) ? data : []);
      }
    } catch {
      // API may be unreachable
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch('/api/config');
        const config = await res.json();
        setVapidPublicKey(config.vapidPublicKey || '');
        setApiBaseUrl(config.apiUrl || '');
        setConfigLoaded(true);
      } catch (err) {
        console.error('Failed to load config:', err);
        setConfigLoaded(true);
      }
    }
    loadConfig();
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!configLoaded) return;
    const baseUrl = apiBaseUrl || window.location.origin;
    setApiUrl(`${baseUrl}/api/notify`);
    checkSubscription();
  }, [configLoaded, apiBaseUrl]);

  async function checkSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();

      if (registrations.length === 0) {
        setStatus('unsubscribed');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();

      if (existingSubscription) {
        setSubscription(existingSubscription);
        setStatus('subscribed');
      } else {
        setStatus('unsubscribed');
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      setStatus('unsubscribed');
    }
  }

  async function subscribe() {
    try {
      setMessage('Preparing service worker...');
      const existingRegs = await navigator.serviceWorker.getRegistrations();
      for (const reg of existingRegs) {
        await reg.unregister();
      }
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));

      setMessage('Registering service worker...');
      const registration = await withTimeout(
        navigator.serviceWorker.register('/push-sw.js', { updateViaCache: 'none' }),
        10000,
        'Service worker registration timed out'
      );

      setMessage('Waiting for service worker to activate...');
      await withTimeout(
        waitForActivation(registration),
        30000,
        'Service worker failed to activate (timed out)'
      );

      setMessage('Requesting notification permission...');
      const permission = await withTimeout(
        Notification.requestPermission(),
        30000,
        'Permission request timed out'
      );
      if (permission !== 'granted') {
        setStatus('denied');
        setMessage('Notification permission denied');
        return;
      }

      if (!vapidPublicKey || vapidPublicKey.trim().length === 0) {
        throw new Error('VAPID public key is missing — check server config');
      }

      setMessage('Creating push subscription...');
      const newSubscription = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }),
        15000,
        'Push subscription timed out — VAPID key may be invalid'
      );

      setMessage('Saving subscription to server...');
      const baseUrl = apiBaseUrl || '';
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSubscription.toJSON()),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(fetchTimeout);
      }

      if (response.ok) {
        setSubscription(newSubscription);
        setStatus('subscribed');
        setMessage('Successfully subscribed to notifications!');
      } else {
        throw new Error('Failed to save subscription on server');
      }
    } catch (error) {
      console.error('Subscribe error:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setMessage(`Error: ${msg.replace('The operation was aborted', 'Server request timed out')}`);
    }
  }

  async function unsubscribe() {
    try {
      setMessage('Unsubscribing...');

      if (subscription) {
        await subscription.unsubscribe();

        const baseUrl = apiBaseUrl || '';
        await fetch(`${baseUrl}/api/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        setSubscription(null);
        setStatus('unsubscribed');
        setMessage('Successfully unsubscribed from notifications');
      }
    } catch (error) {
      console.error('Unsubscribe error:', error);
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function sendTestNotification() {
    try {
      setMessage('Sending test notification...');

      const baseUrl = apiBaseUrl || '';
      const response = await fetch(`${baseUrl}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Agent Connect Test',
          body: 'This is a test notification!',
          type: 'completed',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`Test sent! ${data.message}`);
        fetchNotifications();
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Test notification error:', error);
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function deleteNotification(id: string) {
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotificationHistory(prev => prev.filter(n => n.id !== id));
      }
    } catch {
      // ignore
    }
  }

  async function clearAllNotifications() {
    try {
      const res = await fetch('/api/notifications', { method: 'DELETE' });
      if (res.ok) {
        setNotificationHistory([]);
      }
    } catch {
      // ignore
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setMessage(`${label} copied to clipboard!`);
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-2">Agent Connect</h1>
      <p className="text-gray-400 mb-8">
        Push notifications for AI coding agents like Claude Code
      </p>

      {/* Status Card */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Notification Status</h2>

        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-3 h-3 rounded-full ${
              status === 'subscribed'
                ? 'bg-green-500'
                : status === 'denied'
                ? 'bg-red-500'
                : status === 'unsupported'
                ? 'bg-yellow-500'
                : 'bg-gray-500'
            }`}
          />
          <span className="text-lg">
            {status === 'loading' && 'Checking status...'}
            {status === 'unsupported' && 'Push notifications not supported'}
            {status === 'denied' && 'Notifications blocked'}
            {status === 'subscribed' && 'Notifications enabled'}
            {status === 'unsubscribed' && 'Notifications disabled'}
          </span>
        </div>

        <div className="flex gap-3">
          {status === 'unsubscribed' && (
            <button
              onClick={subscribe}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Enable Notifications
            </button>
          )}

          {status === 'subscribed' && (
            <>
              <button
                onClick={unsubscribe}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Disable Notifications
              </button>
              <button
                onClick={sendTestNotification}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Send Test Notification
              </button>
            </>
          )}

          {status === 'denied' && (
            <p className="text-sm text-gray-400">
              Please enable notifications in your browser settings and refresh the page.
            </p>
          )}
        </div>

        {message && (
          <p className="mt-4 text-sm text-gray-300 bg-gray-700 rounded px-3 py-2">
            {message}
          </p>
        )}
      </div>

      {/* Notification History */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Notification History</h2>
          {notificationHistory.length > 0 && (
            <button
              onClick={clearAllNotifications}
              className="text-sm text-gray-400 hover:text-red-400 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {historyLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : notificationHistory.length === 0 ? (
          <p className="text-gray-500 text-sm">No notifications yet</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {notificationHistory.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-3 bg-gray-900 rounded-lg px-4 py-3 group"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                    typeColors[n.type] || 'bg-gray-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-sm truncate">{n.title}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {relativeTime(n.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mt-0.5 break-words">{n.body}</p>
                </div>
                <button
                  onClick={() => deleteNotification(n.id)}
                  className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                  title="Delete"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* API Info Card */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">API Endpoint</h2>
        <p className="text-gray-400 text-sm mb-3">
          Use this endpoint to send notifications from your AI agent:
        </p>

        <div className="bg-gray-900 rounded p-3 font-mono text-sm mb-3 flex items-center justify-between">
          <code className="text-green-400 break-all">{apiUrl}</code>
          <button
            onClick={() => copyToClipboard(apiUrl, 'API URL')}
            className="ml-3 text-gray-400 hover:text-white flex-shrink-0"
            title="Copy"
          >
            📋
          </button>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-gray-400 hover:text-white">
            Example usage
          </summary>
          <pre className="bg-gray-900 rounded p-3 mt-2 text-xs overflow-x-auto">
{`# Using the CLI (recommended)
agent-connect notify "Task completed!" --type completed

# Using curl
curl -X POST ${apiUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Claude Code", "body": "Task completed!", "type": "completed"}'`}
          </pre>
        </details>
      </div>

      {/* VAPID Key Card */}
      {vapidPublicKey && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">VAPID Public Key</h2>
          <div className="bg-gray-900 rounded p-3 font-mono text-xs break-all flex items-start justify-between">
            <code className="text-yellow-400">{vapidPublicKey}</code>
            <button
              onClick={() => copyToClipboard(vapidPublicKey, 'VAPID key')}
              className="ml-3 text-gray-400 hover:text-white flex-shrink-0"
              title="Copy"
            >
              📋
            </button>
          </div>
        </div>
      )}

      {/* Notification Types */}
      <div className="bg-gray-800 rounded-lg p-6 mt-6">
        <h2 className="text-xl font-semibold mb-4">Notification Types</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <span className="text-green-500">●</span>
            <div>
              <code className="bg-gray-900 px-2 py-1 rounded">completed</code>
              <span className="text-gray-400 ml-2">- Task finished successfully</span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-blue-400">●</span>
            <div>
              <code className="bg-gray-900 px-2 py-1 rounded">planning_complete</code>
              <span className="text-gray-400 ml-2">- Planning finished, ready for review</span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-orange-500">●</span>
            <div>
              <code className="bg-gray-900 px-2 py-1 rounded">approval_needed</code>
              <span className="text-gray-400 ml-2">- Need approval before proceeding</span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-yellow-500">●</span>
            <div>
              <code className="bg-gray-900 px-2 py-1 rounded">input_needed</code>
              <span className="text-gray-400 ml-2">- Agent needs information or clarification</span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-purple-400">●</span>
            <div>
              <code className="bg-gray-900 px-2 py-1 rounded">command_execution</code>
              <span className="text-gray-400 ml-2">- A command finished executing</span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-red-500">●</span>
            <div>
              <code className="bg-gray-900 px-2 py-1 rounded">error</code>
              <span className="text-gray-400 ml-2">- Something went wrong</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// Helper: wait for a service worker registration to reach the 'activated' state.
function waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (registration.active) {
      resolve();
      return;
    }

    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve();
    };

    const trackWorker = (sw: ServiceWorker) => {
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated' || registration.active) {
          done();
        } else if (sw.state === 'redundant') {
          if (registration.active) {
            done();
          } else {
            done(new Error('Service worker install failed (went redundant)'));
          }
        }
      });
    };

    const sw = registration.installing || registration.waiting;
    if (sw) {
      trackWorker(sw);
    }

    registration.addEventListener('updatefound', () => {
      if (registration.installing) {
        trackWorker(registration.installing);
      }
    });
  });
}

// Helper: reject if a promise doesn't resolve within `ms` milliseconds
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}
