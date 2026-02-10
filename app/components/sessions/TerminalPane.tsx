'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Square, ClipboardCopy, Search, Terminal as TerminalIcon, RotateCcw,
  SplitSquareHorizontal, SplitSquareVertical, XCircle, Snowflake, Play,
  GitBranch, Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import IconButton from '../ui/IconButton';
import TerminalSearch from '../terminal/TerminalSearch';
import StatusBar from '../terminal/StatusBar';
import VirtualKeypad from '../terminal/VirtualKeypad';
import StatusDot from '../ui/StatusDot';
import SplitTerminalLayout from '../terminal/SplitTerminalLayout';
import { useToast } from '../ui/Toast';
import { getAllLeaves, findLeaf, replaceLeaf, removeLeaf, hasSession } from '../terminal/layoutUtils';
import type { PaneNode, SplitDirection, DropZone } from '../terminal/splitTypes';
import type { TerminalHandle } from '../Terminal';
import type { SearchAddon } from '@xterm/addon-search';
import type { Session } from '../../hooks/useSessionMonitor';
import ConversationPane from './ConversationPane';

const Terminal = dynamic(() => import('../Terminal'), { ssr: false });

interface TerminalPaneProps {
  session: Session;
  wsUrl: string;
  wsToken?: string;
}

export default function TerminalPane({ session, wsUrl, wsToken = '' }: TerminalPaneProps) {
  if (session.type === 'conversation') {
    return <ConversationPane session={session} />;
  }

  const router = useRouter();
  const { toast } = useToast();
  const terminalRef = useRef<TerminalHandle>(null);
  const historicalTermRef = useRef<HTMLDivElement>(null);
  const historicalXtermRef = useRef<any>(null);
  const historicalSearchRef = useRef<SearchAddon | null>(null);
  const paneRefs = useRef<Map<string, TerminalHandle>>(new Map());
  const [ended, setEnded] = useState(session.status === 'stopped' || session.status === 'frozen');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchAddon, setSearchAddon] = useState<SearchAddon | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    session.status === 'stopped' ? 'disconnected' : 'connecting'
  );
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [historicalScrollback, setHistoricalScrollback] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [cleaningWorktree, setCleaningWorktree] = useState(false);

  // Split layout state
  const [layout, setLayout] = useState<PaneNode>({
    type: 'leaf',
    sessionId: session.id,
    paneId: 'root',
  });
  const [activePaneId, setActivePaneId] = useState('root');
  // Sessions dragged in from the dock — don't kill these on pane close
  const importedSessions = useRef<Set<string>>(new Set());

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    setEnded(session.status === 'stopped' || session.status === 'frozen');
  }, [session.status]);

  // Fetch scrollback for stopped/frozen sessions
  useEffect(() => {
    if (session.status !== 'stopped' && session.status !== 'frozen') return;
    fetch(`/api/sessions/${session.id}/output?full=true`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setHistoricalScrollback(data?.scrollback || ''))
      .catch(() => setHistoricalScrollback(''));
  }, [session.id, session.status]);

  // Render historical scrollback in a read-only xterm
  useEffect(() => {
    if ((session.status !== 'stopped' && session.status !== 'frozen') || historicalScrollback === null || !historicalTermRef.current) return;

    let term: any;
    let fitAddon: any;
    let search: any;

    async function initHistoricalTerminal() {
      const { Terminal: XTerm } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { SearchAddon } = await import('@xterm/addon-search');

      term = new XTerm({
        cursorBlink: false,
        fontSize: 14,
        fontFamily: "var(--font-jetbrains), 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
        disableStdin: true,
        theme: {
          background: '#050505',
          foreground: '#c0caf5',
          cursor: '#050505',
          selectionBackground: '#33467c',
          black: '#0a0a0a',
          red: '#f7768e',
          green: '#9ece6a',
          yellow: '#e0af68',
          blue: '#7aa2f7',
          magenta: '#bb9af7',
          cyan: '#7dcfff',
          white: '#a9b1d6',
          brightBlack: '#414868',
          brightRed: '#f7768e',
          brightGreen: '#9ece6a',
          brightYellow: '#e0af68',
          brightBlue: '#7aa2f7',
          brightMagenta: '#bb9af7',
          brightCyan: '#7dcfff',
          brightWhite: '#c0caf5',
        },
      });

      fitAddon = new FitAddon();
      search = new SearchAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(search);
      term.open(historicalTermRef.current!);

      setTimeout(() => fitAddon.fit(), 50);

      historicalXtermRef.current = term;
      historicalSearchRef.current = search;

      if (historicalScrollback) {
        term.write(historicalScrollback);
      }

      const handleResize = () => fitAddon.fit();
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        term.dispose();
      };
    }

    const cleanupPromise = initHistoricalTerminal();

    return () => {
      cleanupPromise.then(cleanup => cleanup?.());
    };
  }, [session.status, historicalScrollback]);

  // Keyboard shortcut for search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        handleSearchClick();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session.status]);

  async function handleStop() {
    try {
      await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      setEnded(true);
    } catch {
      // ignore
    }
  }

  function handleCopyLogs() {
    let content = '';
    if ((session.status === 'stopped' || session.status === 'frozen') && historicalXtermRef.current) {
      const buffer = historicalXtermRef.current.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) lines.push(line.translateToString());
      }
      content = lines.join('\n');
    } else {
      const activeRef = paneRefs.current.get(activePaneId) || terminalRef.current;
      if (activeRef) {
        content = activeRef.getBufferContent();
      }
    }
    if (content) {
      navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/restore`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.newSession) {
        router.push(`/terminal/${data.newSession.id}?restored_from=${session.id}`);
      }
    } catch {
      // ignore
    } finally {
      setRestoring(false);
    }
  }

  async function handleFreeze() {
    try {
      const res = await fetch(`/api/sessions/${session.id}/freeze`, { method: 'POST' });
      if (res.ok) {
        setEnded(true);
      }
    } catch {
      // ignore
    }
  }

  async function handleUnfreeze() {
    try {
      const res = await fetch(`/api/sessions/${session.id}/unfreeze`, { method: 'POST' });
      if (res.ok) {
        setEnded(false);
      }
    } catch {
      // ignore
    }
  }

  async function handleCleanupWorktree() {
    setCleaningWorktree(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/worktree`, { method: 'DELETE' });
      if (res.ok) {
        toast('Worktree cleaned up');
      } else {
        const data = await res.json();
        toast(data.error || 'Failed to clean up worktree');
      }
    } catch {
      toast('Failed to clean up worktree');
    } finally {
      setCleaningWorktree(false);
    }
  }

  function handleSearchClick() {
    if (session.status === 'stopped' || session.status === 'frozen') {
      setSearchAddon(historicalSearchRef.current);
    } else {
      const activeRef = paneRefs.current.get(activePaneId) || terminalRef.current;
      if (activeRef) {
        setSearchAddon(activeRef.getSearchAddon());
      }
    }
    setSearchOpen(true);
  }

  const handleInput = useCallback((data: string) => {
    const activeRef = paneRefs.current.get(activePaneId) || terminalRef.current;
    if (activeRef) {
      activeRef.sendInput(data);
    }
  }, [activePaneId]);

  // --- Split layout handlers ---

  function getWsUrlForSession(sid: string) {
    if (typeof window === 'undefined') return '';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = `${proto}//${window.location.host}/ws/sessions/${sid}`;
    return wsToken ? `${base}?token=${wsToken}` : base;
  }

  async function handleSplit(paneId: string, direction: SplitDirection) {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: session.projectId }),
      });
      if (!res.ok) {
        toast('Failed to create split session');
        return;
      }
      const newSession = await res.json();
      const newPaneId = crypto.randomUUID();

      const currentLeaf = findLeaf(layout, paneId);
      if (!currentLeaf) return;

      const splitNode: PaneNode = {
        type: 'split',
        direction,
        ratio: 0.5,
        first: currentLeaf,
        second: { type: 'leaf', sessionId: newSession.id, paneId: newPaneId },
      };

      setLayout(replaceLeaf(layout, paneId, splitNode));
      setActivePaneId(newPaneId);
    } catch {
      toast('Failed to create split session');
    }
  }

  function handleSplitWithSession(targetPaneId: string, sessionId: string, zone: NonNullable<DropZone>) {
    if (hasSession(layout, sessionId)) {
      toast('Session is already open');
      return;
    }

    const currentLeaf = findLeaf(layout, targetPaneId);
    if (!currentLeaf) return;

    const newPaneId = crypto.randomUUID();
    const direction: SplitDirection = (zone === 'top' || zone === 'bottom') ? 'horizontal' : 'vertical';
    const newLeaf: PaneNode = { type: 'leaf', sessionId, paneId: newPaneId };

    // top/left = new pane is first, bottom/right = new pane is second
    const isFirst = zone === 'top' || zone === 'left';
    const splitNode: PaneNode = {
      type: 'split',
      direction,
      ratio: 0.5,
      first: isFirst ? newLeaf : currentLeaf,
      second: isFirst ? currentLeaf : newLeaf,
    };

    importedSessions.current.add(sessionId);
    setLayout(replaceLeaf(layout, targetPaneId, splitNode));
    setActivePaneId(newPaneId);
  }

  async function handleClosePane(paneId: string) {
    const leaves = getAllLeaves(layout);
    if (leaves.length <= 1) return;

    const leaf = findLeaf(layout, paneId);
    if (!leaf) return;

    const newLayout = removeLeaf(layout, paneId);
    if (!newLayout) return;

    setLayout(newLayout);

    if (activePaneId === paneId) {
      const remaining = getAllLeaves(newLayout);
      if (remaining.length > 0) {
        setActivePaneId(remaining[0].paneId);
      }
    }

    // Kill the session for the closed pane (don't kill the original or imported sessions)
    if (leaf.sessionId !== session.id && !importedSessions.current.has(leaf.sessionId)) {
      try {
        await fetch(`/api/sessions/${leaf.sessionId}`, { method: 'DELETE' });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  const handlePaneFocus = useCallback((paneId: string) => {
    setActivePaneId(paneId);
    setTimeout(() => {
      const handle = paneRefs.current.get(paneId);
      if (handle) handle.focus();
    }, 0);
  }, []);

  const isSplit = layout.type === 'split';

  const dotStatus = session.status === 'frozen' ? 'frozen'
    : session.status === 'stopped' ? 'stopped'
    : connectionStatus === 'connected' ? 'running'
    : connectionStatus === 'connecting' ? 'connecting' : 'error';

  return (
    <div className="flex flex-col h-full bg-obsidian relative">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 h-10 bg-void/80 backdrop-blur-xl border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <StatusDot status={dotStatus} size="sm" />
          <span className="text-sm font-medium text-white truncate">{session.projectName}</span>
          {session.branch ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 flex-shrink-0">
              <GitBranch className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-amber-400/80 font-mono truncate max-w-[140px]">{session.branch}</span>
            </span>
          ) : (
            <span className="text-[10px] text-gray-600 font-mono truncate hidden sm:inline">{session.projectPath}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            icon={Search}
            label="Search"
            onClick={handleSearchClick}
            size="sm"
          />
          <IconButton
            icon={ClipboardCopy}
            label={copySuccess ? 'Copied!' : 'Copy logs'}
            variant={copySuccess ? 'success' : 'default'}
            onClick={handleCopyLogs}
            size="sm"
          />
          {!ended && session.status !== 'stopped' && (
            <>
              <IconButton
                icon={SplitSquareVertical}
                label="Split down"
                onClick={() => handleSplit(activePaneId, 'horizontal')}
                size="sm"
              />
              <IconButton
                icon={SplitSquareHorizontal}
                label="Split right"
                onClick={() => handleSplit(activePaneId, 'vertical')}
                size="sm"
              />
              {isSplit && (
                <IconButton
                  icon={XCircle}
                  label="Close pane"
                  onClick={() => handleClosePane(activePaneId)}
                  size="sm"
                />
              )}
            </>
          )}
          {session.status === 'frozen' && (
            <>
              <IconButton
                icon={Play}
                label="Unfreeze"
                onClick={handleUnfreeze}
                size="sm"
              />
              <IconButton
                icon={RotateCcw}
                label={restoring ? 'Restoring...' : 'Restore'}
                onClick={handleRestore}
                size="sm"
              />
              {session.worktreePath && (
                <IconButton
                  icon={Trash2}
                  label={cleaningWorktree ? 'Cleaning...' : 'Clean worktree'}
                  onClick={handleCleanupWorktree}
                  size="sm"
                />
              )}
            </>
          )}
          {session.status === 'stopped' && (
            <>
              {session.worktreePath && (
                <IconButton
                  icon={Trash2}
                  label={cleaningWorktree ? 'Cleaning...' : 'Clean worktree'}
                  onClick={handleCleanupWorktree}
                  size="sm"
                />
              )}
              <IconButton
                icon={RotateCcw}
                label={restoring ? 'Restoring...' : 'Restore'}
                onClick={handleRestore}
                size="sm"
              />
            </>
          )}
          {!ended && session.status !== 'stopped' && session.status !== 'frozen' && (
            <>
              <IconButton
                icon={Snowflake}
                label="Freeze"
                onClick={handleFreeze}
                size="sm"
              />
              <IconButton
                icon={Square}
                label="Stop session"
                variant="danger"
                onClick={handleStop}
                size="sm"
              />
            </>
          )}
        </div>
      </div>

      {/* Search overlay */}
      <TerminalSearch
        searchAddon={searchAddon}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      {/* Terminal */}
      <div className="flex-1" style={{ minHeight: 0 }}>
        {(session.status === 'stopped' || session.status === 'frozen') ? (
          <div ref={historicalTermRef} className="h-full bg-obsidian" style={{ minHeight: 0 }} />
        ) : isSplit ? (
          <SplitTerminalLayout
            layout={layout}
            activePaneId={activePaneId}
            onPaneFocus={handlePaneFocus}
            onSplit={handleSplit}
            onClosePane={handleClosePane}
            onLayoutChange={setLayout}
            paneRefs={paneRefs}
            wsToken={wsToken}
            onSessionEnd={(paneId) => {
              setLayout(prev => {
                const leaves = getAllLeaves(prev);
                if (leaves.length <= 1) {
                  // Last pane — keep current ended behavior
                  setEnded(true);
                  return prev;
                }
                const newLayout = removeLeaf(prev, paneId);
                if (!newLayout) {
                  setEnded(true);
                  return prev;
                }
                // Clean up the pane ref
                paneRefs.current.delete(paneId);
                // Reassign active pane if needed
                if (activePaneId === paneId) {
                  const remaining = getAllLeaves(newLayout);
                  if (remaining.length > 0) {
                    setActivePaneId(remaining[0].paneId);
                  }
                }
                return newLayout;
              });
            }}
            onConnectionChange={(paneId, status) => {
              if (paneId === activePaneId) {
                setConnectionStatus(status as any);
              }
            }}
            onDropSession={handleSplitWithSession}
          />
        ) : (
          <SinglePaneDropTarget onDropSession={handleSplitWithSession}>
            <Terminal
              ref={(handle) => {
                (terminalRef as React.MutableRefObject<TerminalHandle | null>).current = handle;
                if (handle) paneRefs.current.set('root', handle);
              }}
              key={session.id}
              sessionId={session.id}
              wsUrl={wsUrl}
              onSessionEnd={() => setEnded(true)}
              onConnectionChange={setConnectionStatus}
            />
          </SinglePaneDropTarget>
        )}
      </div>

      {/* Virtual keypad for mobile */}
      {isTouchDevice && !ended && (
        <VirtualKeypad onInput={handleInput} visible={true} />
      )}

      {/* Status bar */}
      <StatusBar
        sessionId={session.id}
        startedAt={session.startedAt}
        connectionStatus={connectionStatus}
      />
    </div>
  );
}

const dropZoneStyles: Record<NonNullable<DropZone>, string> = {
  top: 'inset-x-0 top-0 h-1/2',
  bottom: 'inset-x-0 bottom-0 h-1/2',
  left: 'inset-y-0 left-0 w-1/2',
  right: 'inset-y-0 right-0 w-1/2',
};

function computeDropZone(e: React.DragEvent<HTMLDivElement>): NonNullable<DropZone> | null {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  const distances = { top: y, bottom: 1 - y, left: x, right: 1 - x };
  let closest: NonNullable<DropZone> = 'top';
  let minDist = Infinity;
  for (const [zone, dist] of Object.entries(distances)) {
    if (dist < minDist) {
      minDist = dist;
      closest = zone as NonNullable<DropZone>;
    }
  }
  return minDist <= 0.3 ? closest : null;
}

function SinglePaneDropTarget({
  children,
  onDropSession,
}: {
  children: React.ReactNode;
  onDropSession: (targetPaneId: string, sessionId: string, zone: NonNullable<DropZone>) => void;
}) {
  const [dropZone, setDropZone] = useState<DropZone>(null);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('application/session-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropZone(computeDropZone(e));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDropZone(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const sessionId = e.dataTransfer.getData('application/session-id');
    const zone = computeDropZone(e);
    setDropZone(null);
    if (sessionId && zone) {
      onDropSession('root', sessionId, zone);
    }
  }, [onDropSession]);

  return (
    <div
      className="h-full w-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {dropZone && (
        <div
          className={`absolute ${dropZoneStyles[dropZone]} bg-emerald-500/15 border-2 border-emerald-500/40 pointer-events-none rounded-sm z-10`}
        />
      )}
    </div>
  );
}

export function EmptyTerminalPane() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-obsidian text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
        <TerminalIcon className="w-8 h-8 text-gray-600" />
      </div>
      <p className="text-gray-400 text-sm font-medium mb-1">Select a session to connect</p>
      <p className="text-gray-600 text-xs">Choose a channel from the dock to open a live terminal</p>
    </div>
  );
}
