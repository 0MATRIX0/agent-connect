'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Play, MoreVertical, Trash2, Terminal, Zap, FolderPlus, RotateCcw, ChevronDown, History, Pencil } from 'lucide-react';
import GlassCard from './components/ui/GlassCard';
import StatusDot from './components/ui/StatusDot';
import { useToast } from './components/ui/Toast';

interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

interface Session {
  id: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  status: 'running' | 'stopped';
  pid: number;
  startedAt: string;
  stoppedAt: string | null;
  exitCode?: number | null;
  signal?: string | null;
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

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  if (diff < dayMs) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 7 * dayMs) {
    const days = Math.floor(diff / dayMs);
    return `${days}d ago`;
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function Dashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [historySessions, setHistorySessions] = useState<Session[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [sessionOutputs, setSessionOutputs] = useState<Record<string, string[]>>({});
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [restoringSession, setRestoringSession] = useState<string | null>(null);

  const HISTORY_PAGE_SIZE = 10;

  useEffect(() => {
    fetchProjects();
    fetchSessions();
    fetchHistory(0);
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

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      }
    } catch {
      toast('Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  }

  async function fetchSessions() {
    try {
      const res = await fetch('/api/sessions?status=running');
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data) ? data : []);
      }
    } catch {
      toast('Failed to load sessions');
    } finally {
      setLoadingSessions(false);
    }
  }

  async function fetchHistory(offset: number) {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/sessions?status=stopped&limit=${HISTORY_PAGE_SIZE}&offset=${offset}`);
      if (res.ok) {
        const data: Session[] = await res.json();
        if (offset === 0) {
          setHistorySessions(data);
        } else {
          setHistorySessions(prev => [...prev, ...data]);
        }
        setHasMoreHistory(data.length === HISTORY_PAGE_SIZE);
        setHistoryOffset(offset + data.length);
      }
    } catch {
      toast('Failed to load session history');
    } finally {
      setLoadingHistory(false);
    }
  }

  async function launchSession(project: Project) {
    setLaunching(project.id);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/terminal/${data.id}`);
      }
    } catch {
      toast('Failed to launch session');
    } finally {
      setLaunching(null);
    }
  }

  async function restoreSession(sessionId: string) {
    setRestoringSession(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/restore`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.newSession) {
        router.push(`/terminal/${data.newSession.id}?restored_from=${sessionId}`);
      } else {
        toast(data.error || 'Failed to restore session');
      }
    } catch {
      toast('Failed to restore session');
    } finally {
      setRestoringSession(null);
    }
  }

  async function deleteProject(id: string) {
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch {
      toast('Failed to delete project');
    }
    setMenuOpen(null);
  }

  const runningSessions = sessions.filter(s => s.status === 'running');

  return (
    <main className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Dashboard</h1>
        <p className="text-gray-500 text-sm">Manage your projects and monitor active sessions</p>
      </div>

      {/* Status indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <GlassCard className="p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Projects</p>
          <p className="text-2xl font-bold text-white">{projects.length}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <StatusDot status="running" size="sm" />
            <p className="text-xs text-gray-500 uppercase tracking-wider">Active Sessions</p>
          </div>
          <p className="text-2xl font-bold text-white">{runningSessions.length}</p>
        </GlassCard>
        <GlassCard className="p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Sessions</p>
          <p className="text-2xl font-bold text-white">{runningSessions.length + historySessions.length}</p>
        </GlassCard>
      </div>

      {/* Active Sessions */}
      {runningSessions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <StatusDot status="running" size="sm" />
            Active Sessions
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {runningSessions.map(session => (
              <GlassCard
                key={session.id}
                hover
                onClick={() => router.push(`/terminal/${session.id}`)}
                className="p-4 min-w-[280px] max-w-[340px] flex-shrink-0"
              >
                <div className="flex items-center gap-2 mb-2">
                  <StatusDot status="running" size="sm" />
                  <span className="font-medium text-white text-sm truncate">{session.projectName}</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  Running for {formatDuration(session.startedAt, null)}
                </p>
                {/* Mini log tail */}
                {sessionOutputs[session.id] && sessionOutputs[session.id].length > 0 && (
                  <div className="bg-black/30 rounded-lg p-2 font-mono text-[10px] text-gray-500 leading-relaxed max-h-16 overflow-hidden">
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

      {/* Projects Grid */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Projects</h2>
          <button
            onClick={() => router.push('/projects')}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Add Project
          </button>
        </div>

        {loadingProjects ? (
          <p className="text-gray-500 text-sm">Loading projects...</p>
        ) : projects.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
              <Zap className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-1">No projects yet</p>
            <p className="text-gray-600 text-sm mb-4">Add a project to launch Claude Code sessions</p>
            <button
              onClick={() => router.push('/projects')}
              className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
            >
              Add Your First Project
            </button>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map(project => (
              <GlassCard
                key={project.id}
                hover
                className="p-5 group relative"
              >
                {/* Three-dot menu */}
                <div className="absolute top-3 right-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === project.id ? null : project.id);
                    }}
                    aria-label="Project menu"
                    aria-expanded={menuOpen === project.id}
                    className="p-1 rounded text-gray-600 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-ring"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {menuOpen === project.id && (
                    <div className="absolute right-0 top-8 w-36 bg-void border border-white/10 rounded-lg shadow-xl z-10 overflow-hidden animate-scale-in" role="menu">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(null);
                          router.push('/projects');
                        }}
                        role="menuitem"
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProject(project.id);
                        }}
                        role="menuitem"
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-rose-400 hover:bg-white/5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                <div
                  onClick={() => launchSession(project)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launchSession(project); } }}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer"
                >
                  <h3 className="font-semibold text-white mb-1 pr-6">{project.name}</h3>
                  <p className="text-xs text-gray-500 font-mono truncate mb-3">{project.path}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-600">
                      Added {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                    <div className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                      ${launching === project.id
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-white/5 text-gray-400 group-hover:bg-emerald-500/10 group-hover:text-emerald-400'
                      }
                    `}>
                      {launching === project.id ? (
                        <span className="animate-pulse">Launching...</span>
                      ) : (
                        <>
                          <Play className="w-3 h-3" />
                          Launch
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Session History */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <History className="w-4 h-4 text-gray-500" />
          Session History
        </h2>

        {historySessions.length === 0 && !loadingHistory ? (
          <GlassCard className="p-6 text-center">
            <p className="text-gray-500 text-sm">No session history yet. Sessions will appear here after they stop.</p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {historySessions.map(session => (
              <GlassCard
                key={session.id}
                hover
                className="p-4 flex items-center justify-between"
              >
                <div
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  onClick={() => router.push(`/terminal/${session.id}`)}
                >
                  <StatusDot status="stopped" size="sm" />
                  <div className="min-w-0">
                    <span className="text-sm text-white font-medium truncate block">{session.projectName}</span>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{formatDate(session.startedAt)}</span>
                      <span className="text-gray-700">·</span>
                      <span>{formatDuration(session.startedAt, session.stoppedAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      restoreSession(session.id);
                    }}
                    disabled={restoringSession === session.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-gray-400 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className={`w-3 h-3 ${restoringSession === session.id ? 'animate-spin' : ''}`} />
                    {restoringSession === session.id ? 'Restoring...' : 'Restore'}
                  </button>
                  <button
                    onClick={() => router.push(`/terminal/${session.id}`)}
                    className="text-xs text-gray-600 hover:text-gray-400 transition-colors px-2 py-1.5"
                  >
                    View
                  </button>
                </div>
              </GlassCard>
            ))}

            {/* Load More */}
            {hasMoreHistory && (
              <button
                onClick={() => fetchHistory(historyOffset)}
                disabled={loadingHistory}
                className="w-full py-3 text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-2"
              >
                {loadingHistory ? (
                  <span className="animate-pulse">Loading...</span>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Load More
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
