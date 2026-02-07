'use client';

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  sessionId: string;
  wsUrl: string;
  onSessionEnd?: (exitCode: number | null) => void;
  onConnectionChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;
}

export interface TerminalHandle {
  getBufferContent: () => string;
  getSearchAddon: () => SearchAddon | null;
  sendInput: (data: string) => void;
}

const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal(
  { sessionId, wsUrl, onSessionEnd, onConnectionChange },
  ref
) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    getBufferContent() {
      if (!xtermRef.current) return '';
      const buffer = xtermRef.current.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) lines.push(line.translateToString());
      }
      return lines.join('\n');
    },
    getSearchAddon() {
      return searchAddonRef.current;
    },
    sendInput(data: string) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    },
  }));

  useEffect(() => {
    if (!termRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "var(--font-jetbrains), 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
      theme: {
        background: '#050505',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
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

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.open(termRef.current);

    setTimeout(() => fitAddon.fit(), 50);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Connect WebSocket
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      onConnectionChange?.('connected');
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output' || msg.type === 'scrollback') {
          term.write(msg.data);
        } else if (msg.type === 'exit') {
          term.write('\r\n\x1b[1;33m--- Session ended ---\x1b[0m\r\n');
          onSessionEnd?.(msg.exitCode);
        }
      } catch {
        term.write(event.data);
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      onConnectionChange?.('disconnected');
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
      onConnectionChange?.('disconnected');
    };

    // Forward terminal input to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      term.dispose();
    };
  }, [sessionId, wsUrl]);

  return (
    <div className="flex flex-col h-full bg-obsidian">
      {connectionStatus === 'disconnected' && (
        <div className="bg-rose-500/10 text-rose-300 px-4 py-1.5 text-xs text-center border-b border-rose-500/20">
          Connection lost. Refresh to reconnect.
        </div>
      )}
      {connectionStatus === 'connecting' && (
        <div className="bg-amber-500/10 text-amber-300 px-4 py-1.5 text-xs text-center border-b border-amber-500/20">
          Connecting...
        </div>
      )}
      <div ref={termRef} className="flex-1" style={{ minHeight: 0 }} />
    </div>
  );
});

export default Terminal;
