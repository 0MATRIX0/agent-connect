'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Square, ClipboardCopy, Search, ArrowLeft } from 'lucide-react';
import FloatingToolbar from '../../components/ui/FloatingToolbar';
import IconButton from '../../components/ui/IconButton';
import TerminalSearch from '../../components/terminal/TerminalSearch';
import StatusBar from '../../components/terminal/StatusBar';
import VirtualKeypad from '../../components/terminal/VirtualKeypad';
import { useVisualViewport } from '../../hooks/useVisualViewport';
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
  const sessionId = params.id as string;
  const terminalRef = useRef<TerminalHandle>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchAddon, setSearchAddon] = useState<SearchAddon | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const { viewportHeight } = useVisualViewport();

  useEffect(() => {
    fetchSession();
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, [sessionId]);

  // Keyboard shortcut for search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        // Grab search addon from terminal ref
        if (terminalRef.current) {
          setSearchAddon(terminalRef.current.getSearchAddon());
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  function handleCopyLogs() {
    if (terminalRef.current) {
      const content = terminalRef.current.getBufferContent();
      navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }

  function handleSearchClick() {
    if (terminalRef.current) {
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
    return `${proto}//${window.location.host}/ws/sessions/${sessionId}`;
  }

  if (loading) {
    return (
      <main className="flex items-center justify-center h-screen bg-obsidian">
        <p className="text-gray-500 text-sm">Loading session...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex flex-col items-center justify-center h-screen bg-obsidian gap-4">
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
      className="flex flex-col bg-obsidian relative"
      style={{ height: viewportHeight, transition: 'height 0.1s ease-out' }}
    >
      {/* Floating toolbar */}
      <FloatingToolbar position="top-right" autoHide autoHideDelay={3000}>
        <IconButton
          icon={ArrowLeft}
          label="Back to sessions"
          onClick={() => router.push('/sessions')}
          size="sm"
        />
        {!ended && (
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
      </div>

      {/* Virtual keypad for mobile */}
      {isTouchDevice && !ended && (
        <VirtualKeypad onInput={handleInput} visible={true} />
      )}

      {/* Status bar */}
      {session && (
        <StatusBar
          sessionId={sessionId}
          startedAt={session.startedAt}
          connectionStatus={connectionStatus}
        />
      )}
    </div>
  );
}
