'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import MessageCard from './MessageCard';

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

interface MessageInboxProps {
  apiBaseUrl: string;
}

type FilterTab = 'all' | 'pending' | 'questions';

export default function MessageInbox({ apiBaseUrl }: MessageInboxProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightedRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (filter === 'pending') params.set('status', 'pending');
      if (filter === 'questions') params.set('type', 'question');

      const res = await fetch(`${apiBaseUrl}/api/messages?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch {
      // Silent fail on poll
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, filter]);

  // Initial fetch + polling
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Deep link from ?message=<id>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const messageId = params.get('message');
    if (messageId) {
      setHighlightedId(messageId);
      // Clear the param from URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete('message');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Scroll to highlighted message
  useEffect(() => {
    if (highlightedId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedId, messages]);

  function handleResponded(updated: Message) {
    setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
  }

  const tabs: { label: string; value: FilterTab }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Questions', value: 'questions' },
  ];

  const pendingCount = messages.filter(m => m.status === 'pending').length;

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Messages</h2>
        {pendingCount > 0 && (
          <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-900 rounded-lg p-1">
        {tabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => { setFilter(tab.value); setLoading(true); }}
            className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              filter === tab.value
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Message list */}
      {loading ? (
        <p className="text-gray-500 text-sm text-center py-4">Loading messages...</p>
      ) : messages.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">No messages yet</p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {messages.map(msg => (
            <div key={msg.id} ref={msg.id === highlightedId ? highlightedRef : undefined}>
              <MessageCard
                message={msg}
                apiBaseUrl={apiBaseUrl}
                highlighted={msg.id === highlightedId}
                onResponded={handleResponded}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
