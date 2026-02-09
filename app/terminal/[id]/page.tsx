'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Square, ClipboardCopy, Search, ArrowLeft, RotateCcw, X } from 'lucide-react';
import FloatingToolbar from '../../components/ui/FloatingToolbar';
import IconButton from '../../components/ui/IconButton';
import TerminalSearch from '../../components/terminal/TerminalSearch';
import StatusBar from '../../components/terminal/StatusBar';
import VirtualKeypad from '../../components/terminal/VirtualKeypad';
import { useVisualViewport } from '../../hooks/useVisualViewport';
import { useToast } from '../../components/ui/Toast';
import type { TerminalHandle } from '../../components/Terminal';
import type { SearchAddon } from '@xterm/addon-search';

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
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const sessionId = params.id as string;
  const restoredFrom = searchParams.get('restored_from');
  const terminalRef = useRef<TerminalHandle>(null);
  const historicalTermRef = useRef<HTMLDivElement>(null);
  const historicalXtermRef = useRef<any>(null);
  const historicalSearchRef = useRef<SearchAddon | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchAddon, setSearchAddon] = useState<SearchAddon | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [wsToken, setWsToken] = useState('');
  const [isHistorical, setIsHistorical] = useState(false);
  const [historicalScrollback, setHistoricalScrollback] = useState<string | null>(null);
  const [restoredBannerVisible, setRestoredBannerVisible] = useState(!!restoredFrom);
  const [restoring, setRestoring] = useState(false);
  const [wsReady, setWsReady] = useState(false);
  const { viewportHeight } = useVisualViewport();

  useEffect(() => {
    fetchSession();
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    // Fetch API token for WebSocket auth
    fetch('/api/config').then(r => r.json()).then(c => {
      if (c.apiToken) setWsToken(c.apiToken);
    }).catch(() => {}).finally(() => {
      setWsReady(true);
    });
  }, [sessionId]);

  // Keyboard shortcut for search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        if (isHistorical) {
          setSearchAddon(historicalSearchRef.current);
        } else if (terminalRef.current) {
          setSearchAddon(terminalRef.current.getSearchAddon());
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHistorical]);

  // Render historical scrollback in a read-only xterm
  useEffect(() => {
    if (!isHistorical || historicalScrollback === null || !historicalTermRef.current) return;

    let term: any;
    let fitAddon: any;
    let searchAddon: any;

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
      searchAddon = new SearchAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(searchAddon);
      term.open(historicalTermRef.current!);

      setTimeout(() => fitAddon.fit(), 50);

      historicalXtermRef.current = term;
      historicalSearchRef.current = searchAddon;

      // Write scrollback data
      if (historicalScrollback) {
        term.write(historicalScrollback);
      }
      term.write('\r\n\x1b[1;33m--- Session ended (historical) ---\x1b[0m\r\n');

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
  }, [isHistorical, historicalScrollback]);

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
        // Check if session has a live PTY (in-memory) by trying WS
        // If session is stopped and not in-memory, treat as historical
        setIsHistorical(true);
        // Fetch full scrollback from DB
        try {
          const outputRes = await fetch(`/api/sessions/${sessionId}/output?full=true`);
          if (outputRes.ok) {
            const outputData = await outputRes.json();
            setHistoricalScrollback(outputData.scrollback || '');
          } else {
            setHistoricalScrollback('');
          }
        } catch {
          setHistoricalScrollback('');
        }
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

  async function handleRestore() {
    setRestoring(true);
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
      setRestoring(false);
    }
  }

  function handleCopyLogs() {
    let content = '';
    if (isHistorical && historicalXtermRef.current) {
      const buffer = historicalXtermRef.current.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) lines.push(line.translateToString());
      }
      content = lines.join('\n');
    } else if (terminalRef.current) {
      content = terminalRef.current.getBufferContent();
    }
    navigator.clipboard.writeText(content);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  function handleSearchClick() {
    if (isHistorical) {
      setSearchAddon(historicalSearchRef.current);
    } else if (terminalRef.current) {
      setSearchAddon(terminalRef.current.getSearchAddon());
    }
    setSearchOpen(true);
  }

  const handleInput = useCallback((data: string) => {
    if (terminalRef.current) {
      terminalRef.current.sendInput(data);
    }
  }, []);

  function getWsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = `${proto}//${window.location.host}/ws/sessions/${sessionId}`;
    return wsToken ? `${base}?token=${wsToken}` : base;
  }

  if (loading) {
    return (
      <main className="flex items-center justify-center bg-obsidian pb-16 md:pb-0" style={{ height: viewportHeight }}>
        <p className="text-gray-500 text-sm">Loading session...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex flex-col items-center justify-center bg-obsidian gap-4 pb-16 md:pb-0" style={{ height: viewportHeight }}>
        <p className="text-rose-400 text-sm">{error}</p>
        <Link
          href="/sessions"
          className="text-emerald-400 hover:text-emerald-300 text-sm transition-colors"
        >
          Back to Sessions
        </Link>
      </main>
    );
  }

  return (
    <div
      className="flex flex-col bg-obsidian relative pb-16 md:pb-0"
      style={{ height: viewportHeight, transition: 'height 0.1s ease-out' }}
    >
      {/* Restored from banner */}
      {restoredBannerVisible && restoredFrom && (
        <div className="bg-emerald-500/10 text-emerald-300 px-4 py-2 text-xs text-center border-b border-emerald-500/20 flex items-center justify-center gap-3">
          <span>Restored from previous session</span>
          <button
            onClick={() => router.push(`/terminal/${restoredFrom}`)}
            className="underline hover:text-emerald-200 transition-colors"
          >
            View old output
          </button>
          <button
            onClick={() => setRestoredBannerVisible(false)}
            className="p-0.5 rounded hover:bg-emerald-500/20 transition-colors ml-1"
            aria-label="Dismiss"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Floating toolbar */}
      <FloatingToolbar position="top-right" autoHide autoHideDelay={3000}>
        <IconButton
          icon={ArrowLeft}
          label="Back to sessions"
          onClick={() => router.push('/sessions')}
          size="sm"
        />
        {isHistorical && (
          <IconButton
            icon={RotateCcw}
            label={restoring ? 'Restoring...' : 'Restore session'}
            onClick={handleRestore}
            size="sm"
          />
        )}
        {!ended && !isHistorical && (
          <IconButton
            icon={Square}
            label="Stop session"
            variant="danger"
            onClick={handleStop}
            size="sm"
          />
        )}
        <IconButton
          icon={ClipboardCopy}
          label={copySuccess ? 'Copied!' : 'Copy logs'}
          variant={copySuccess ? 'success' : 'default'}
          onClick={handleCopyLogs}
          size="sm"
        />
        <IconButton
          icon={Search}
          label="Search"
          onClick={handleSearchClick}
          size="sm"
        />
      </FloatingToolbar>

      {/* Search overlay */}
      <TerminalSearch
        searchAddon={searchAddon}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      {/* Terminal - full height */}
      <div className="flex-1" style={{ minHeight: 0 }}>
        {isHistorical ? (
          <div ref={historicalTermRef} className="h-full bg-obsidian" style={{ minHeight: 0 }} />
        ) : wsReady ? (
          <Terminal
            ref={terminalRef}
            sessionId={sessionId}
            wsUrl={getWsUrl()}
            onSessionEnd={() => {
              setEnded(true);
              fetchSession();
            }}
            onConnectionChange={setConnectionStatus}
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-obsidian">
            <p className="text-gray-500 text-sm">Connecting...</p>
          </div>
        )}
      </div>

      {/* Virtual keypad for mobile */}
      {isTouchDevice && !ended && !isHistorical && (
        <VirtualKeypad onInput={handleInput} visible={true} />
      )}

      {/* Status bar */}
      {session && (
        <StatusBar
          sessionId={sessionId}
          startedAt={session.startedAt}
          connectionStatus={isHistorical ? 'disconnected' : connectionStatus}
        />
      )}
    </div>
  );
}
