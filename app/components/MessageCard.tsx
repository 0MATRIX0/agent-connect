'use client';

import { useState } from 'react';

interface Message {
  id: string;
  type: 'notification' | 'question';
  status: 'pending' | 'responded' | 'expired';
  title: string;
  body: string;
  notificationType: string;
  options?: string[];
  allowCustom?: boolean;
  response?: {
    value: string;
    respondedAt: string;
    source: string;
  };
  createdAt: string;
  expiresAt?: string;
}

interface MessageCardProps {
  message: Message;
  apiBaseUrl: string;
  highlighted?: boolean;
  onResponded?: (message: Message) => void;
}

const TYPE_COLORS: Record<string, string> = {
  completed: 'bg-green-500',
  task_done: 'bg-green-500',
  planning_complete: 'bg-blue-400',
  approval_needed: 'bg-orange-500',
  input_needed: 'bg-yellow-500',
  command_execution: 'bg-purple-400',
  error: 'bg-red-500',
};

const BORDER_COLORS: Record<string, string> = {
  completed: 'border-green-500',
  task_done: 'border-green-500',
  planning_complete: 'border-blue-400',
  approval_needed: 'border-orange-500',
  input_needed: 'border-yellow-500',
  command_execution: 'border-purple-400',
  error: 'border-red-500',
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function MessageCard({ message, apiBaseUrl, highlighted, onResponded }: MessageCardProps) {
  const [customInput, setCustomInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isExpired = message.expiresAt && new Date(message.expiresAt) < new Date() && message.status === 'pending';
  const isPending = message.type === 'question' && message.status === 'pending' && !isExpired;
  const borderColor = isPending ? BORDER_COLORS[message.notificationType] || 'border-gray-600' : 'border-transparent';

  async function submitResponse(value: string) {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/messages/${message.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, source: 'app' }),
      });
      if (res.status === 409) {
        setError('Already responded');
      } else if (!res.ok) {
        setError('Failed to submit response');
      } else {
        const updated = await res.json();
        onResponded?.(updated);
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`bg-gray-800 rounded-lg p-4 border-l-4 ${borderColor} ${highlighted ? 'ring-2 ring-blue-500' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_COLORS[message.notificationType] || 'bg-gray-500'}`} />
          <span className="text-xs text-gray-400 uppercase tracking-wide">{message.notificationType.replace('_', ' ')}</span>
          {message.type === 'question' && (
            <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">Question</span>
          )}
        </div>
        <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo(message.createdAt)}</span>
      </div>

      <p className="text-gray-200 text-sm mb-3">{message.body}</p>

      {/* Pending question: show options + custom input */}
      {isPending && (
        <div className="space-y-2">
          {message.options && message.options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {message.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => submitResponse(opt)}
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          {message.allowCustom !== false && (
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && customInput.trim()) submitResponse(customInput.trim()); }}
                placeholder="Type a custom response..."
                disabled={submitting}
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => { if (customInput.trim()) submitResponse(customInput.trim()); }}
                disabled={submitting || !customInput.trim()}
                className="bg-gray-600 hover:bg-gray-500 disabled:opacity-50 px-3 py-1.5 rounded text-sm font-medium transition-colors"
              >
                Send
              </button>
            </div>
          )}
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      )}

      {/* Responded: show response */}
      {message.status === 'responded' && message.response && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-green-400">&#10003;</span>
          <span className="text-gray-300">{message.response.value}</span>
          <span className="text-gray-500 text-xs">via {message.response.source} &middot; {timeAgo(message.response.respondedAt)}</span>
        </div>
      )}

      {/* Expired */}
      {isExpired && (
        <span className="text-xs bg-gray-600 text-gray-300 px-2 py-0.5 rounded">Expired</span>
      )}
    </div>
  );
}
