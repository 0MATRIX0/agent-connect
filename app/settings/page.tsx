'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, Send, Plus, X, Terminal as TerminalIcon } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import CopyBlock from '../components/ui/CopyBlock';
import StatusDot from '../components/ui/StatusDot';

type SubscriptionStatus = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

interface Macro {
  id: string;
  label: string;
  command: string;
}

const DEFAULT_MACROS: Macro[] = [
  { id: 'default-1', label: 'Dev', command: 'npm run dev' },
  { id: 'default-2', label: 'Status', command: 'git status' },
  { id: 'default-3', label: 'Clear', command: 'clear' },
  { id: 'default-4', label: 'Docker Up', command: 'docker-compose up' },
];

const notificationTypes = [
  { type: 'completed', color: 'text-emerald-500', desc: 'Task finished successfully' },
  { type: 'planning_complete', color: 'text-blue-400', desc: 'Planning finished, ready for review' },
  { type: 'approval_needed', color: 'text-orange-500', desc: 'Need approval before proceeding' },
  { type: 'input_needed', color: 'text-amber-500', desc: 'Agent needs information or clarification' },
  { type: 'command_execution', color: 'text-purple-400', desc: 'A command finished executing' },
  { type: 'error', color: 'text-rose-500', desc: 'Something went wrong' },
];

export default function SettingsPage() {
  const [status, setStatus] = useState<SubscriptionStatus>('loading');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [message, setMessage] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [vapidPublicKey, setVapidPublicKey] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);

  // Macros
  const [macros, setMacros] = useState<Macro[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [showAddMacro, setShowAddMacro] = useState(false);

  // Load config
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch('/api/config');
        const config = await res.json();
        setVapidPublicKey(config.vapidPublicKey || '');
        setApiBaseUrl(config.apiUrl || '');
        setConfigLoaded(true);
      } catch {
        setConfigLoaded(true);
      }
    }
    loadConfig();
  }, []);

  // Set API URL and check subscription
  useEffect(() => {
    if (!configLoaded) return;
    const baseUrl = apiBaseUrl || window.location.origin;
    setApiUrl(`${baseUrl}/api/notify`);
    checkSubscription();
  }, [configLoaded, apiBaseUrl]);

  // Load macros from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('terminal-macros');
      if (stored) {
        setMacros(JSON.parse(stored));
      } else {
        setMacros(DEFAULT_MACROS);
        localStorage.setItem('terminal-macros', JSON.stringify(DEFAULT_MACROS));
      }
    } catch {
      setMacros(DEFAULT_MACROS);
    }
  }, []);

  function saveMacros(updated: Macro[]) {
    setMacros(updated);
    localStorage.setItem('terminal-macros', JSON.stringify(updated));
  }

  function addMacro() {
    if (!newLabel.trim() || !newCommand.trim()) return;
    const macro: Macro = {
      id: `custom-${Date.now()}`,
      label: newLabel.trim(),
      command: newCommand.trim(),
    };
    saveMacros([...macros, macro]);
    setNewLabel('');
    setNewCommand('');
    setShowAddMacro(false);
  }

  function deleteMacro(id: string) {
    saveMacros(macros.filter(m => m.id !== id));
  }

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
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        setSubscription(existing);
        setStatus('subscribed');
      } else {
        setStatus('unsubscribed');
      }
    } catch {
      setStatus('unsubscribed');
    }
  }

  async function subscribe() {
    try {
      setMessage('Enabling notifications...');
      const existingRegs = await navigator.serviceWorker.getRegistrations();
      for (const reg of existingRegs) await reg.unregister();
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));

      const registration = await navigator.serviceWorker.register('/push-sw.js', { updateViaCache: 'none' });
      await waitForActivation(registration);

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        setMessage('Notification permission denied');
        return;
      }

      if (!vapidPublicKey) throw new Error('VAPID public key is missing');

      const newSub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const baseUrl = apiBaseUrl || '';
      const response = await fetch(`${baseUrl}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSub.toJSON()),
      });

      if (response.ok) {
        setSubscription(newSub);
        setStatus('subscribed');
        setMessage('Notifications enabled!');
      } else {
        throw new Error('Failed to save subscription');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setMessage(`Error: ${msg}`);
    }
  }

  async function unsubscribe() {
    try {
      setMessage('Disabling notifications...');
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
        setMessage('Notifications disabled');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setMessage(`Error: ${msg}`);
    }
  }

  async function sendTest() {
    try {
      setMessage('Sending test...');
      const baseUrl = apiBaseUrl || '';
      const res = await fetch(`${baseUrl}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Agent Connect Test', body: 'This is a test notification!', type: 'completed' }),
      });
      const data = await res.json();
      setMessage(res.ok ? `Test sent! ${data.message}` : `Error: ${data.error}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setMessage(`Error: ${msg}`);
    }
  }

  return (
    <main className="px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-white">Settings</h1>

      {/* Notification Settings */}
      <GlassCard className="p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-400" />
          Notifications
        </h2>

        <div className="flex items-center gap-3 mb-4">
          <StatusDot
            status={status === 'subscribed' ? 'running' : status === 'denied' ? 'error' : status === 'unsupported' ? 'connecting' : 'stopped'}
            size="md"
          />
          <span className="text-sm text-gray-300">
            {status === 'loading' && 'Checking status...'}
            {status === 'unsupported' && 'Push notifications not supported in this browser'}
            {status === 'denied' && 'Notifications blocked by browser'}
            {status === 'subscribed' && 'Push notifications enabled'}
            {status === 'unsubscribed' && 'Push notifications disabled'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {status === 'unsubscribed' && (
            <button
              onClick={subscribe}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <Bell className="w-4 h-4" />
              Enable Notifications
            </button>
          )}
          {status === 'subscribed' && (
            <>
              <button
                onClick={unsubscribe}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <BellOff className="w-4 h-4" />
                Disable
              </button>
              <button
                onClick={sendTest}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
              >
                <Send className="w-4 h-4" />
                Send Test
              </button>
            </>
          )}
          {status === 'denied' && (
            <p className="text-xs text-gray-500">Enable notifications in your browser settings and refresh.</p>
          )}
        </div>

        {message && (
          <p className="mt-3 text-sm text-gray-300 bg-white/5 rounded-lg px-3 py-2">{message}</p>
        )}
      </GlassCard>

      {/* API Info */}
      <GlassCard className="p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">API Info</h2>
        <div className="space-y-4">
          <CopyBlock value={apiUrl} label="API Endpoint" variant="code" />
          {vapidPublicKey && (
            <CopyBlock value={vapidPublicKey} label="VAPID Public Key" variant="key" />
          )}
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-300 transition-colors">
            Example usage
          </summary>
          <pre className="mt-2 bg-black/30 rounded-lg p-3 text-xs text-gray-400 font-mono overflow-x-auto">
{`# Using the CLI (recommended)
agent-connect notify "Task completed!" --type completed

# Using curl
curl -X POST ${apiUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Claude Code", "body": "Task completed!", "type": "completed"}'`}
          </pre>
        </details>
      </GlassCard>

      {/* Notification Types */}
      <GlassCard className="p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Notification Types</h2>
        <div className="space-y-2.5">
          {notificationTypes.map(({ type, color, desc }) => (
            <div key={type} className="flex items-center gap-3 text-sm">
              <span className={`${color} text-lg leading-none`}>&#9679;</span>
              <code className="bg-white/5 px-2 py-0.5 rounded text-xs font-mono text-gray-300">{type}</code>
              <span className="text-gray-500">{desc}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Terminal Macros */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <TerminalIcon className="w-5 h-5 text-gray-400" />
            Terminal Macros
          </h2>
          <button
            onClick={() => setShowAddMacro(!showAddMacro)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Quick command chips shown in the mobile terminal keypad.
        </p>

        {showAddMacro && (
          <div className="mb-4 p-3 bg-white/5 rounded-lg space-y-2">
            <input
              type="text"
              placeholder="Label (e.g. Build)"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              className="glass-input w-full text-sm"
            />
            <input
              type="text"
              placeholder="Command (e.g. npm run build)"
              value={newCommand}
              onChange={e => setNewCommand(e.target.value)}
              className="glass-input w-full text-sm font-mono"
            />
            <div className="flex gap-2">
              <button
                onClick={addMacro}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => { setShowAddMacro(false); setNewLabel(''); setNewCommand(''); }}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {macros.map(macro => (
            <div
              key={macro.id}
              className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm"
            >
              <span className="text-gray-300">{macro.label}</span>
              <span className="text-gray-600 font-mono text-xs hidden sm:inline">({macro.command})</span>
              <button
                onClick={() => deleteMacro(macro.id)}
                className="opacity-0 group-hover:opacity-100 ml-1 text-gray-500 hover:text-rose-400 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {macros.length === 0 && (
          <p className="text-xs text-gray-600">No macros configured. Add one above.</p>
        )}
      </GlassCard>
    </main>
  );
}

// Helpers
function waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (registration.active) { resolve(); return; }
    let settled = false;
    const done = (err?: Error) => { if (settled) return; settled = true; err ? reject(err) : resolve(); };
    const trackWorker = (sw: ServiceWorker) => {
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated' || registration.active) done();
        else if (sw.state === 'redundant') {
          registration.active ? done() : done(new Error('Service worker install failed'));
        }
      });
    };
    const sw = registration.installing || registration.waiting;
    if (sw) trackWorker(sw);
    registration.addEventListener('updatefound', () => {
      if (registration.installing) trackWorker(registration.installing);
    });
  });
}

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
