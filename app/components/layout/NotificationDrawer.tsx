'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import Drawer from '../ui/Drawer';

interface StoredNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  timestamp: string;
}

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}

const typeColors: Record<string, string> = {
  completed: 'bg-emerald-500',
  planning_complete: 'bg-blue-400',
  approval_needed: 'bg-orange-500',
  input_needed: 'bg-amber-500',
  command_execution: 'bg-purple-400',
  error: 'bg-rose-500',
};

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
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

export default function NotificationDrawer({ open, onClose, onCountChange }: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : [];
        setNotifications(items);
        onCountChange?.(items.length);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Poll more frequently when drawer is open
  useEffect(() => {
    if (!open) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, [open, fetchNotifications]);

  async function deleteNotification(id: string) {
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotifications(prev => {
          const updated = prev.filter(n => n.id !== id);
          onCountChange?.(updated.length);
          return updated;
        });
      }
    } catch {
      // ignore
    }
  }

  async function clearAll() {
    try {
      const res = await fetch('/api/notifications', { method: 'DELETE' });
      if (res.ok) {
        setNotifications([]);
        onCountChange?.(0);
      }
    } catch {
      // ignore
    }
  }

  return (
    <Drawer open={open} onClose={onClose} side="right" title="Notifications">
      <div className="flex flex-col h-full">
        {/* Clear all */}
        {notifications.length > 0 && (
          <div className="px-5 py-3 border-b border-white/5">
            <button
              onClick={clearAll}
              className="text-xs text-gray-500 hover:text-rose-400 transition-colors"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-gray-500 text-sm text-center py-8">Loading...</p>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-sm">No notifications yet</p>
              <p className="text-gray-600 text-xs mt-1">Activity from your agents will appear here</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[5px] top-2 bottom-2 w-px bg-white/5" />

              <div className="space-y-4">
                {notifications.map((n) => (
                  <div key={n.id} className="relative flex gap-4 group">
                    {/* Timeline dot */}
                    <div className="relative z-10 flex-shrink-0 mt-1.5">
                      <span className={`block w-[11px] h-[11px] rounded-full border-2 border-void ${typeColors[n.type] || 'bg-gray-500'}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-sm text-white truncate">{n.title}</span>
                        <span className="text-[10px] text-gray-500 flex-shrink-0">{relativeTime(n.timestamp)}</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5 break-words">{n.body}</p>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => deleteNotification(n.id)}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-600 hover:text-rose-400 mt-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
