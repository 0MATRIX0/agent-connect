'use client';

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Terminal, Plus } from 'lucide-react';
import { useSessionMonitor } from '../hooks/useSessionMonitor';
import SessionDock from '../components/sessions/SessionDock';
import TerminalPane, { EmptyTerminalPane } from '../components/sessions/TerminalPane';
import CreateSessionModal from '../components/sessions/CreateSessionModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import GlassCard from '../components/ui/GlassCard';

function SessionsContent() {
  const { sessions, loading } = useSessionMonitor();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [wsToken, setWsToken] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [stopTarget, setStopTarget] = useState<{ id: string; name: string } | null>(null);
  const [stopping, setStopping] = useState(false);

  const searchParams = useSearchParams();
  const newSessionId = searchParams.get('new');

  // Handle ?new= query param
  useEffect(() => {
    if (newSessionId) {
      setActiveSessionId(newSessionId);
      window.history.replaceState({}, '', '/sessions');
    }
  }, [newSessionId]);

  // Fetch WS token
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(c => { if (c.apiToken) setWsToken(c.apiToken); })
      .catch(() => {});
  }, []);

  // Auto-select first running session when none selected
  useEffect(() => {
    if (activeSessionId) {
      const exists = sessions.some(s => s.id === activeSessionId);
      if (!exists && sessions.length > 0) {
        const firstRunning = sessions.find(s => s.status === 'running');
        setActiveSessionId(firstRunning?.id || sessions[0].id);
      }
      return;
    }

    if (sessions.length > 0) {
      const firstRunning = sessions.find(s => s.status === 'running');
      setActiveSessionId(firstRunning?.id || sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  const activeSession = useMemo(
    () => sessions.find(s => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  function getWsUrl(sessionId: string) {
    if (typeof window === 'undefined') return '';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = `${proto}//${window.location.host}/ws/sessions/${sessionId}`;
    return wsToken ? `${base}?token=${wsToken}` : base;
  }

  function handleSessionCreated(sessionId: string) {
    setActiveSessionId(sessionId);
  }

  const handleAddSessionToProject = useCallback(async (projectId: string) => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setActiveSessionId(data.id);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleStopSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    setStopTarget({ id: sessionId, name: session?.projectName || 'this session' });
  }, [sessions]);

  const confirmStop = useCallback(async () => {
    if (!stopTarget) return;
    setStopping(true);
    try {
      await fetch(`/api/sessions/${stopTarget.id}`, { method: 'DELETE' });
    } catch {
      // ignore
    } finally {
      setStopping(false);
      setStopTarget(null);
    }
  }, [stopTarget]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-5rem)] md:h-screen">
        <p className="text-gray-500 text-sm">Loading sessions...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <>
        <div className="flex items-center justify-center h-[calc(100vh-5rem)] md:h-screen px-4">
          <GlassCard className="p-8 text-center max-w-sm">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
              <Terminal className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-1">No sessions yet</p>
            <p className="text-gray-600 text-sm mb-4">
              Create a session to launch Claude Code on a project.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Session
            </button>
          </GlassCard>
        </div>
        <CreateSessionModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSessionCreated={handleSessionCreated}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col md:flex-row h-[calc(100dvh-5rem)] md:h-screen">
        <SessionDock
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={setActiveSessionId}
          onCreateSession={() => setShowCreateModal(true)}
          onAddSessionToProject={handleAddSessionToProject}
          onStopSession={handleStopSession}
        />

        <div className="flex-1 min-w-0 min-h-0">
          {activeSession ? (
            <TerminalPane
              key={activeSessionId}
              session={activeSession}
              wsUrl={getWsUrl(activeSession.id)}
              wsToken={wsToken}
            />
          ) : (
            <EmptyTerminalPane />
          )}
        </div>
      </div>

      <CreateSessionModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSessionCreated={handleSessionCreated}
      />

      <ConfirmDialog
        open={!!stopTarget}
        title="Stop Session"
        description={`This will terminate the session for "${stopTarget?.name}". Any unsaved work in the terminal will be lost.`}
        confirmLabel="Stop Session"
        cancelLabel="Keep Running"
        variant="danger"
        loading={stopping}
        onConfirm={confirmStop}
        onCancel={() => setStopTarget(null)}
      />
    </>
  );
}

export default function SessionsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[calc(100vh-5rem)] md:h-screen">
        <p className="text-gray-500 text-sm">Loading sessions...</p>
      </div>
    }>
      <SessionsContent />
    </Suspense>
  );
}
