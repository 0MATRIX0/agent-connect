'use client';

import { useState, useEffect } from 'react';

type SubscriptionStatus = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

export default function Home() {
  const [status, setStatus] = useState<SubscriptionStatus>('loading');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [message, setMessage] = useState<string>('');
  const [apiUrl, setApiUrl] = useState<string>('');
  const [vapidPublicKey, setVapidPublicKey] = useState<string>('');
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  const [configLoaded, setConfigLoaded] = useState(false);

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
  }, []);

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
      // Check if a service worker is already registered
      const registrations = await navigator.serviceWorker.getRegistrations();

      if (registrations.length === 0) {
        // No service worker registered yet - user hasn't subscribed before
        setStatus('unsubscribed');
        return;
      }

      // Service worker exists, wait for it to be ready and check subscription
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
      // Step 0: Clean up stale service workers and caches
      setMessage('Preparing service worker...');
      const existingRegs = await navigator.serviceWorker.getRegistrations();
      for (const reg of existingRegs) {
        await reg.unregister();
      }
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));

      // Step 1: Register service worker fresh (bypass HTTP cache)
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

      // Step 2: Request notification permission
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

      // Step 3: Validate VAPID key and create push subscription
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

      // Step 4: Save subscription to server
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
        // Unsubscribe from push manager
        await subscription.unsubscribe();

        // Remove from server
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
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Test notification error:', error);
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            Example curl command
          </summary>
          <pre className="bg-gray-900 rounded p-3 mt-2 text-xs overflow-x-auto">
{`curl -X POST ${apiUrl} \\
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
            <span className="text-yellow-500">●</span>
            <div>
              <code className="bg-gray-900 px-2 py-1 rounded">input_needed</code>
              <span className="text-gray-400 ml-2">- Agent needs your attention</span>
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
// Tracks the installing/waiting worker AND listens for updatefound in case the
// browser replaces the worker mid-install (e.g. with skipWaiting enabled).
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

    // Catch new installations triggered by the browser
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
