'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Session {
  id: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  status: 'running' | 'stopped';
  pid: number;
  startedAt: string;
  stoppedAt: string | null;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchSessions() {
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }

  async function handleStop(id: string) {
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      fetchSessions();
    } catch {
      setError('Failed to stop session');
    }
  }

  function formatDuration(startedAt: string, stoppedAt: string | null) {
    const start = new Date(startedAt).getTime();
    const end = stoppedAt ? new Date(stoppedAt).getTime() : Date.now();
    const seconds = Math.floor((end - start) / 1000);

    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Sessions</h1>

      {error && (
        <p className="mb-4 text-sm text-red-400 bg-red-900/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-gray-400">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
          <p className="text-lg mb-2">No active sessions</p>
          <p className="text-sm">
            Go to{' '}
            <Link href="/projects" className="text-blue-400 hover:text-blue-300 underline">
              Projects
            </Link>{' '}
            to launch a Claude Code session.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      session.status === 'running' ? 'bg-green-500' : 'bg-gray-500'
                    }`}
                  />
                  <h3 className="font-semibold text-white truncate">{session.projectName}</h3>
                  <span className="text-xs text-gray-500">PID {session.pid}</span>
                </div>
                <p className="text-sm text-gray-400 font-mono truncate mt-1">{session.projectPath}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {session.status === 'running' ? 'Running' : 'Stopped'} for{' '}
                  {formatDuration(session.startedAt, session.stoppedAt)}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {session.status === 'running' && (
                  <>
                    <Link
                      href={`/terminal/${session.id}`}
                      className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Open Terminal
                    </Link>
                    <button
                      onClick={() => handleStop(session.id)}
                      className="bg-gray-700 hover:bg-red-600 px-3 py-2 rounded-lg text-sm transition-colors"
                    >
                      Stop
                    </button>
                  </>
                )}
                {session.status === 'stopped' && (
                  <Link
                    href={`/terminal/${session.id}`}
                    className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    View Output
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
