import { useState, useEffect, useRef, useCallback } from 'react';

export interface Session {
  id: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  worktreePath?: string | null;
  branch?: string | null;
  status: 'running' | 'stopped' | 'frozen';
  activityStatus?: string | null;
  pid: number;
  startedAt: string;
  stoppedAt: string | null;
  frozenAt?: string | null;
  type?: 'terminal' | 'conversation';
}

export type ActivityState = 'active' | 'idle' | 'waiting' | 'completed' | 'frozen';

export interface SessionWithActivity extends Session {
  activity: ActivityState;
  activityLabel: string;
  lastLog: string;
  duration: string;
}

const PERMISSION_PATTERNS = [
  /\? Allow/i,
  /\? Y\/n/i,
  /permission/i,
  /approve/i,
  /\(y\/n\)/i,
  /press enter/i,
  /\[Y\/n\]/i,
];

// Map hook-provided activityStatus strings to ActivityState categories
function mapActivityStatus(activityStatus: string | null): ActivityState | null {
  if (!activityStatus) return null;
  const lower = activityStatus.toLowerCase();

  if (lower.includes('task done') || lower.startsWith('done') || lower.includes('waiting for input') || lower.includes('idle')) return 'idle';
  if (lower.includes('needs permission') || lower.includes('asking question')) return 'waiting';
  if (lower.includes('ended') || lower.includes('completed')) return 'completed';
  if (
    lower.includes('running') || lower.includes('writing') ||
    lower.includes('editing') || lower.includes('reading') ||
    lower.includes('searching') || lower.includes('finding') ||
    lower.includes('fetching') || lower.includes('working') ||
    lower.includes('subagent') || lower.includes('notebook')
  ) return 'active';

  // Session lifecycle statuses
  if (lower.includes('started') || lower.includes('resumed') || lower.includes('cleared') || lower.includes('compacted')) return 'active';

  return null;
}

function formatDuration(startedAt: string, stoppedAt: string | null, frozenAt?: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = frozenAt ? new Date(frozenAt).getTime() : stoppedAt ? new Date(stoppedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function detectActivity(
  session: Session,
  currentOutput: string,
  previousOutput: string | null,
  unchangedCount: number
): { activity: ActivityState; unchanged: number } {
  if (session.status === 'frozen') {
    return { activity: 'frozen', unchanged: 0 };
  }
  if (session.status === 'stopped') {
    return { activity: 'completed', unchanged: 0 };
  }

  // Primary: use hook-provided activityStatus if available
  const hookActivity = mapActivityStatus(session.activityStatus ?? null);
  if (hookActivity) {
    return { activity: hookActivity, unchanged: 0 };
  }

  // Fallback: output-based detection for non-hook sessions
  if (currentOutput && PERMISSION_PATTERNS.some(p => p.test(currentOutput))) {
    return { activity: 'waiting', unchanged: 0 };
  }

  if (previousOutput === null || currentOutput !== previousOutput) {
    return { activity: 'active', unchanged: 0 };
  }

  const newCount = unchangedCount + 1;
  if (newCount >= 2) {
    return { activity: 'idle', unchanged: newCount };
  }

  return { activity: 'active', unchanged: newCount };
}

export function useSessionMonitor() {
  const [sessions, setSessions] = useState<SessionWithActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const previousOutputs = useRef<Record<string, string>>({});
  const unchangedCounts = useRef<Record<string, number>>({});
  const rawSessionsRef = useRef<Session[]>([]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) return;
      const data = await res.json();
      rawSessionsRef.current = Array.isArray(data) ? data : [];
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOutputs = useCallback(async () => {
    const raw = rawSessionsRef.current;
    if (raw.length === 0) {
      setSessions([]);
      return;
    }

    const running = raw.filter(s => s.status === 'running');

    // Fetch output tails for running sessions (still useful for lastLog display)
    const outputMap: Record<string, string> = {};
    if (running.length > 0) {
      await Promise.all(
        running.map(async (s) => {
          try {
            const res = await fetch(`/api/sessions/${s.id}/output?lines=3`);
            if (res.ok) {
              const data = await res.json();
              const lines: string[] = data.lines || [];
              outputMap[s.id] = lines.join('\n');
            }
          } catch {
            // ignore
          }
        })
      );
    }

    // Compute activity states
    const enriched: SessionWithActivity[] = raw.map(s => {
      const currentOutput = outputMap[s.id] || '';
      const prevOutput = previousOutputs.current[s.id] ?? null;
      const prevUnchanged = unchangedCounts.current[s.id] || 0;

      const { activity, unchanged } = detectActivity(s, currentOutput, prevOutput, prevUnchanged);

      // Update refs
      if (s.status === 'running') {
        previousOutputs.current[s.id] = currentOutput;
        unchangedCounts.current[s.id] = unchanged;
      }

      // Get last meaningful line for display
      const lines = currentOutput.split('\n').filter(l => l.trim());
      let lastLog = lines[lines.length - 1] || '';

      if (s.type === 'conversation') {
        lastLog = lastLog || 'Claude conversation';
      }

      // Use hook-provided activityStatus as the label if available, otherwise fall back to generic labels
      let activityLabel = '';
      if (s.status === 'frozen') {
        activityLabel = 'Frozen';
      } else if (s.status === 'running' && s.activityStatus) {
        activityLabel = s.activityStatus;
      }

      return {
        ...s,
        activity,
        activityLabel,
        lastLog,
        duration: formatDuration(s.startedAt, s.stoppedAt, s.frozenAt),
      };
    });

    setSessions(enriched);
  }, []);

  // Poll sessions every 5s
  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Poll outputs every 6s (staggered from session polling)
  useEffect(() => {
    // Initial fetch after first session load
    const initialDelay = setTimeout(() => {
      fetchOutputs();
    }, 1000);

    const interval = setInterval(fetchOutputs, 6000);
    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  }, [fetchOutputs]);

  // Also update enriched sessions when raw sessions change
  useEffect(() => {
    if (rawSessionsRef.current.length > 0) {
      fetchOutputs();
    }
  }, [loading, fetchOutputs]);

  // Update durations every second
  useEffect(() => {
    const interval = setInterval(() => {
      setSessions(prev =>
        prev.map(s => ({
          ...s,
          duration: formatDuration(s.startedAt, s.stoppedAt, s.frozenAt),
        }))
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return { sessions, loading };
}
