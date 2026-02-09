'use client';

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
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

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_DELAY = 1000;
const MAX_DELAY = 16000;
const HEARTBEAT_INTERVAL = 25000;

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
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [showReconnectButton, setShowReconnectButton] = useState(false);

  const sessionEndedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptRef = useRef(0);
  const cleanupRef = useRef(false);

  // Stable refs for callback props to avoid recreating connectWebSocket on every parent render
  const onSessionEndRef = useRef(onSessionEnd);
  const onConnectionChangeRef = useRef(onConnectionChange);
  onSessionEndRef.current = onSessionEnd;
  onConnectionChangeRef.current = onConnectionChange;

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

  const startHeartbeat = useCallback((ws: WebSocket) => {
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const connectWebSocket = useCallback((term: XTerm, fitAddon: FitAddon, isReconnect: boolean) => {
    if (cleanupRef.current) return;

    setConnectionStatus('connecting');
    onConnectionChangeRef.current?.('connecting');

    let wasOpened = false;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      wasOpened = true;
      setConnectionStatus('connected');
      onConnectionChangeRef.current?.('connected');
      attemptRef.current = 0;
      setReconnectAttempt(0);
      setShowReconnectButton(false);

      // Send resize dimensions
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }

      if (isReconnect) {
        term.write('\r\n\x1b[1;32m--- Reconnected ---\x1b[0m\r\n');
      }

      startHeartbeat(ws);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output' || msg.type === 'scrollback') {
          term.write(msg.data);
        } else if (msg.type === 'exit') {
          sessionEndedRef.current = true;
          term.write('\r\n\x1b[1;33m--- Session ended ---\x1b[0m\r\n');
          onSessionEndRef.current?.(msg.exitCode);
        }
        // pong messages are silently consumed
      } catch {
        term.write(event.data);
      }
    };

    ws.onclose = () => {
      stopHeartbeat();
      setConnectionStatus('disconnected');
      onConnectionChangeRef.current?.('disconnected');

      // Don't reconnect if session ended normally or component is unmounting
      if (sessionEndedRef.current || cleanupRef.current) return;

      // If the connection was rejected before it opened (auth failure, no proxy, etc.),
      // stop immediately — retrying won't help
      if (!wasOpened) {
        setShowReconnectButton(true);
        term.write('\r\n\x1b[1;31m--- Connection refused. Check that the server is running. ---\x1b[0m\r\n');
        return;
      }

      // Attempt reconnection with exponential backoff
      attemptRef.current++;
      const attempt = attemptRef.current;
      setReconnectAttempt(attempt);

      if (attempt > MAX_RECONNECT_ATTEMPTS) {
        setShowReconnectButton(true);
        term.write('\r\n\x1b[1;31m--- Connection lost. Click "Reconnect" to try again. ---\x1b[0m\r\n');
        return;
      }

      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY);
      const jitter = Math.random() * 500;

      reconnectTimerRef.current = setTimeout(() => {
        connectWebSocket(term, fitAddon, true);
      }, delay + jitter);
    };

    ws.onerror = () => {
      // onclose will fire after this, handling reconnection
    };

    // Forward terminal input to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });
  }, [wsUrl, startHeartbeat, stopHeartbeat]);

  const handleManualReconnect = useCallback(() => {
    attemptRef.current = 0;
    setReconnectAttempt(0);
    setShowReconnectButton(false);
    if (xtermRef.current && fitAddonRef.current) {
      connectWebSocket(xtermRef.current, fitAddonRef.current, true);
    }
  }, [connectWebSocket]);

  useEffect(() => {
    if (!termRef.current) return;
    cleanupRef.current = false;
    sessionEndedRef.current = false;

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

    // Initial WebSocket connection
    connectWebSocket(term, fitAddon, false);

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cleanupRef.current = true;
      window.removeEventListener('resize', handleResize);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      stopHeartbeat();
      wsRef.current?.close();
      term.dispose();
    };
  }, [sessionId, wsUrl, connectWebSocket, stopHeartbeat]);

  return (
    <div className="flex flex-col h-full bg-obsidian">
      {connectionStatus === 'disconnected' && !sessionEndedRef.current && (
        <div className="bg-rose-500/10 text-rose-300 px-4 py-1.5 text-xs text-center border-b border-rose-500/20 flex items-center justify-center gap-3">
          {showReconnectButton ? (
            <>
              <span>Connection lost.</span>
              <button
                onClick={handleManualReconnect}
                className="px-3 py-1 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors font-medium"
              >
                Reconnect
              </button>
            </>
          ) : (
            <span>Reconnecting... (attempt {reconnectAttempt}/{MAX_RECONNECT_ATTEMPTS})</span>
          )}
        </div>
      )}
      {connectionStatus === 'connecting' && reconnectAttempt === 0 && (
        <div className="bg-amber-500/10 text-amber-300 px-4 py-1.5 text-xs text-center border-b border-amber-500/20">
          Connecting...
        </div>
      )}
      <div ref={termRef} className="flex-1" style={{ minHeight: 0 }} />
    </div>
  );
});

export default Terminal;
