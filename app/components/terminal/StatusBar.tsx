'use client';

import { useState, useEffect } from 'react';
import StatusDot from '../ui/StatusDot';

interface StatusBarProps {
  sessionId: string;
  startedAt: string;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

interface Stats {
  pid: number;
  rss: number;
  cpu: number;
  uptime: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(startedAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export default function StatusBar({ sessionId, startedAt, connectionStatus }: StatusBarProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [duration, setDuration] = useState(formatDuration(startedAt));

  // Poll stats
  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/stats`);
        if (res.ok) {
          setStats(await res.json());
        }
      } catch {
        // ignore
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Update duration live
  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(formatDuration(startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const dotStatus = connectionStatus === 'connected' ? 'running' : connectionStatus === 'connecting' ? 'connecting' : 'error';

  return (
    <div className="flex items-center justify-between px-4 h-7 bg-void/80 backdrop-blur-xl border-t border-white/5 text-[11px] text-gray-500 font-mono flex-shrink-0">
      <div className="flex items-center gap-4">
        {stats && (
          <>
            <span>PID {stats.pid}</span>
            <span>RSS {formatBytes(stats.rss)}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span>{duration}</span>
        <div className="flex items-center gap-1.5">
          <StatusDot status={dotStatus} size="sm" />
          <span className="hidden sm:inline">
            {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting' : 'Disconnected'}
          </span>
        </div>
      </div>
    </div>
  );
}
