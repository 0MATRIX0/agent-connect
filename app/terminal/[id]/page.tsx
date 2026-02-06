'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const Terminal = dynamic(() => import('../../components/Terminal'), { ssr: false });

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

export default function TerminalPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  async function fetchSession() {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) {
        setError('Session not found');
        return;
      }
      const data = await res.json();
      setSession(data);
      if (data.status === 'stopped') {
        setEnded(true);
      }
    } catch {
      setError('Failed to load session');
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      setEnded(true);
      fetchSession();
    } catch {
      setError('Failed to stop session');
    }
  }

  function getWsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Route through the Next.js server which proxies to the API server
    return `${proto}//${window.location.host}/ws/sessions/${sessionId}`;
  }

  function formatDuration(startedAt: string) {
    const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  if (loading) {
    return (
      <main className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <p className="text-gray-400">Loading session...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] gap-4">
        <p className="text-red-400">{error}</p>
        <Link href="/sessions" className="text-blue-400 hover:text-blue-300 underline">
          Back to Sessions
        </Link>
      </main>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Session header bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              ended ? 'bg-gray-500' : 'bg-green-500'
            }`}
          />
          <span className="font-semibold text-white truncate">{session?.projectName}</span>
          <span className="text-xs text-gray-500 font-mono truncate hidden sm:inline">
            {session?.projectPath}
          </span>
          {session && (
            <span className="text-xs text-gray-500">
              {formatDuration(session.startedAt)}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link
            href="/sessions"
            className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-sm transition-colors"
          >
            All Sessions
          </Link>
          {!ended && (
            <button
              onClick={handleStop}
              className="bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              Stop Session
            </button>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div className="flex-1" style={{ minHeight: 0 }}>
        <Terminal
          sessionId={sessionId}
          wsUrl={getWsUrl()}
          onSessionEnd={() => {
            setEnded(true);
            fetchSession();
          }}
        />
      </div>
    </div>
  );
}
