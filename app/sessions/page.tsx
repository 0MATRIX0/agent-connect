'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Terminal, ExternalLink, Square, Plus } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import StatusDot from '../components/ui/StatusDot';
import IconButton from '../components/ui/IconButton';

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
  const [sessionOutputs, setSessionOutputs] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch mini log tails for running sessions
  useEffect(() => {
    const running = sessions.filter(s => s.status === 'running');
    if (running.length === 0) return;

    async function fetchOutputs() {
      const results: Record<string, string[]> = {};
      await Promise.all(
        running.map(async (s) => {
          try {
            const res = await fetch(`/api/sessions/${s.id}/output?lines=3`);
            if (res.ok) {
              const data = await res.json();
              results[s.id] = data.lines || [];
            }
          } catch {
            // ignore
          }
        })
      );
      setSessionOutputs(prev => ({ ...prev, ...results }));
    }

    fetchOutputs();
    const interval = setInterval(fetchOutputs, 8000);
    return () => clearInterval(interval);
  }, [sessions]);

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

  const runningSessions = sessions.filter(s => s.status === 'running');
  const stoppedSessions = sessions.filter(s => s.status === 'stopped');

  return (
    <main className="px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Sessions</h1>
        <Link
          href="/projects"
          className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New
        </Link>
      </div>

      {error && (
        <div className="mb-4 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
            <Terminal className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-gray-400 mb-1">No active sessions</p>
          <p className="text-gray-600 text-sm">
            Go to{' '}
            <Link href="/projects" className="text-emerald-400 hover:text-emerald-300 transition-colors">
              Projects
            </Link>{' '}
            to launch a Claude Code session.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-6">
          {/* Running Sessions */}
          {runningSessions.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <StatusDot status="running" size="sm" />
                Running ({runningSessions.length})
              </h2>
              <div className="space-y-3">
                {runningSessions.map((session) => (
                  <GlassCard key={session.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusDot status="running" size="sm" />
                          <h3 className="font-semibold text-white truncate">{session.projectName}</h3>
                          <span className="text-xs text-gray-600 font-mono">PID {session.pid}</span>
                        </div>
                        <p className="text-sm text-gray-500 font-mono truncate">{session.projectPath}</p>
                        <p className="text-xs text-gray-600 mt-1">
                          Running for {formatDuration(session.startedAt, null)}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Link
                          href={`/terminal/${session.id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-white/5 text-white hover:bg-white/10"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open
                        </Link>
                        <IconButton
                          icon={Square}
                          label="Stop session"
                          variant="danger"
                          onClick={() => handleStop(session.id)}
                        />
                      </div>
                    </div>

                    {/* Mini log tail */}
                    {sessionOutputs[session.id] && sessionOutputs[session.id].length > 0 && (
                      <div className="mt-3 bg-black/30 rounded-lg p-2.5 font-mono text-[11px] text-gray-500 leading-relaxed max-h-20 overflow-hidden">
                        {sessionOutputs[session.id].map((line, i) => (
                          <div key={i} className="truncate">{line}</div>
                        ))}
                      </div>
                    )}
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {/* Stopped Sessions */}
          {stoppedSessions.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
                Stopped ({stoppedSessions.length})
              </h2>
              <div className="space-y-2">
                {stoppedSessions.map((session) => (
                  <GlassCard key={session.id} hover className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <StatusDot status="stopped" size="sm" />
                        <h3 className="font-medium text-gray-300 truncate">{session.projectName}</h3>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Ran for {formatDuration(session.startedAt, session.stoppedAt)}
                      </p>
                    </div>
                    <Link
                      href={`/terminal/${session.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 flex-shrink-0"
                    >
                      View Output
                    </Link>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
