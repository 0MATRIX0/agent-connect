'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Square, ClipboardCopy, Search, Terminal as TerminalIcon } from 'lucide-react';
import FloatingToolbar from '../ui/FloatingToolbar';
import IconButton from '../ui/IconButton';
import TerminalSearch from '../terminal/TerminalSearch';
import StatusBar from '../terminal/StatusBar';
import VirtualKeypad from '../terminal/VirtualKeypad';
import StatusDot from '../ui/StatusDot';
import type { TerminalHandle } from '../Terminal';
import type { SearchAddon } from '@xterm/addon-search';
import type { Session } from '../../hooks/useSessionMonitor';

const Terminal = dynamic(() => import('../Terminal'), { ssr: false });

interface TerminalPaneProps {
  session: Session;
  wsUrl: string;
}

export default function TerminalPane({ session, wsUrl }: TerminalPaneProps) {
  const terminalRef = useRef<TerminalHandle>(null);
  const [ended, setEnded] = useState(session.status === 'stopped');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchAddon, setSearchAddon] = useState<SearchAddon | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    session.status === 'stopped' ? 'disconnected' : 'connecting'
  );
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    setEnded(session.status === 'stopped');
  }, [session.status]);

  // Keyboard shortcut for search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        if (terminalRef.current) {
          setSearchAddon(terminalRef.current.getSearchAddon());
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function handleStop() {
    try {
      await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      setEnded(true);
    } catch {
      // ignore
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

  const dotStatus = session.status === 'stopped' ? 'stopped'
    : connectionStatus === 'connected' ? 'running'
    : connectionStatus === 'connecting' ? 'connecting' : 'error';

  return (
    <div className="flex flex-col h-full bg-obsidian relative">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 h-10 bg-void/80 backdrop-blur-xl border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <StatusDot status={dotStatus} size="sm" />
          <span className="text-sm font-medium text-white truncate">{session.projectName}</span>
          <span className="text-[10px] text-gray-600 font-mono truncate hidden sm:inline">{session.projectPath}</span>
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
          {!ended && (
            <IconButton
              icon={Square}
              label="Stop session"
              variant="danger"
              onClick={handleStop}
              size="sm"
            />
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
        {session.status === 'stopped' ? (
          <div className="flex flex-col items-center justify-center h-full bg-obsidian text-center px-4 gap-3">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
              <TerminalIcon className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-gray-400 text-sm">Session ended</p>
            <a
              href={`/terminal/${session.id}`}
              className="text-emerald-400 hover:text-emerald-300 text-xs transition-colors underline"
            >
              View full output
            </a>
          </div>
        ) : (
          <Terminal
            ref={terminalRef}
            key={session.id}
            sessionId={session.id}
            wsUrl={wsUrl}
            onSessionEnd={() => setEnded(true)}
            onConnectionChange={setConnectionStatus}
          />
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
