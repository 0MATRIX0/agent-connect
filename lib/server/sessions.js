const pty = require('node-pty');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const MAX_SCROLLBACK = 5000;
const FLUSH_INTERVAL_MS = 30000; // 30 seconds

// In-memory session store: Map<sessionId, sessionObject>
const sessions = new Map();

// Track flush intervals per session
const flushIntervals = new Map();

function initSessions() {
  db.initDb();
}

function purgeOldSessions(days) {
  return db.deleteOldSessions(days);
}

function createSession(projectId, projectName, projectPath) {
  const id = uuidv4();

  const ptyProcess = pty.spawn('claude', [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: projectPath,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
    },
  });

  const session = {
    id,
    projectId,
    projectName,
    projectPath,
    status: 'running',
    pid: ptyProcess.pid,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    exitCode: null,
    signal: null,
    pty: ptyProcess,
    scrollback: [],
    clients: new Set(),
  };

  // Persist session metadata to DB
  db.saveSession(session);
  db.saveScrollback(id, '');

  // Buffer PTY output and broadcast to attached clients
  ptyProcess.onData((data) => {
    // Add to scrollback
    session.scrollback.push(data);
    if (session.scrollback.length > MAX_SCROLLBACK) {
      session.scrollback.splice(0, session.scrollback.length - MAX_SCROLLBACK);
    }

    // Broadcast to all attached WebSocket clients
    const MAX_BUFFER = 1024 * 1024; // 1MB backpressure limit
    for (const ws of session.clients) {
      if (ws.readyState === 1 && ws.bufferedAmount < MAX_BUFFER) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    }
  });

  // Periodic scrollback flush to DB
  const flushInterval = setInterval(() => {
    if (session.scrollback.length > 0) {
      db.saveScrollback(id, session.scrollback.join(''));
    }
  }, FLUSH_INTERVAL_MS);
  flushIntervals.set(id, flushInterval);

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode, signal }) => {
    session.status = 'stopped';
    session.stoppedAt = new Date().toISOString();
    session.exitCode = exitCode;
    session.signal = signal;

    // Final flush: save scrollback to DB
    if (session.scrollback.length > 0) {
      db.saveScrollback(id, session.scrollback.join(''));
    }

    // Update session status in DB
    db.saveSession(session);

    // Clear flush interval
    const interval = flushIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      flushIntervals.delete(id);
    }

    // Notify all attached clients
    for (const ws of session.clients) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'exit',
          exitCode,
          signal,
        }));
      }
    }
  });

  sessions.set(id, session);
  return getSessionMeta(session);
}

function killSession(id) {
  const session = sessions.get(id);
  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status === 'running') {
    try {
      session.pty.kill('SIGTERM');
    } catch (e) {
      // Process may have already exited
    }
    session.status = 'stopped';
    session.stoppedAt = new Date().toISOString();

    // Save final scrollback and update status in DB
    if (session.scrollback.length > 0) {
      db.saveScrollback(id, session.scrollback.join(''));
    }
    db.saveSession(session);

    // Clear flush interval
    const interval = flushIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      flushIntervals.delete(id);
    }
  }

  return getSessionMeta(session);
}

function getSession(id) {
  // Check in-memory first
  const session = sessions.get(id);
  if (session) return getSessionMeta(session);

  // Fallback to DB for historical sessions
  const dbSession = db.getDbSession(id);
  return dbSession ? { ...dbSession, scrollbackData: undefined } : null;
}

function getRawSession(id) {
  return sessions.get(id) || null;
}

function getAllSessions({ projectId, status, limit, offset } = {}) {
  // If requesting specific filters (status/pagination), query DB directly
  if (status || limit || offset) {
    const dbSessions = db.getDbSessions({ projectId, status, limit: limit || 50, offset: offset || 0 });

    // For live sessions, override DB data with in-memory data
    return dbSessions.map(s => {
      const live = sessions.get(s.id);
      return live ? getSessionMeta(live) : s;
    });
  }

  // Default: merge in-memory live sessions with DB historical sessions
  const dbSessions = db.getDbSessions({ projectId, limit: 100 });
  const result = new Map();

  // DB sessions first
  for (const s of dbSessions) {
    result.set(s.id, s);
  }

  // In-memory sessions override (they have the latest status)
  for (const session of sessions.values()) {
    if (!projectId || session.projectId === projectId) {
      result.set(session.id, getSessionMeta(session));
    }
  }

  // Sort by startedAt descending
  return Array.from(result.values()).sort((a, b) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

function getSessionScrollback(id) {
  // Check in-memory first
  const session = sessions.get(id);
  if (session) {
    return session.scrollback.join('');
  }

  // Fallback to DB
  const dbSession = db.getDbSession(id);
  return dbSession?.scrollbackData || '';
}

function attachClient(sessionId, ws) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  session.clients.add(ws);

  // Replay scrollback buffer
  if (session.scrollback.length > 0) {
    ws.send(JSON.stringify({
      type: 'scrollback',
      data: session.scrollback.join(''),
    }));
  }

  // If session is already stopped, notify
  if (session.status === 'stopped') {
    ws.send(JSON.stringify({
      type: 'exit',
      exitCode: null,
      signal: null,
    }));
  }

  return session;
}

function detachClient(sessionId, ws) {
  const session = sessions.get(sessionId);
  if (session) {
    session.clients.delete(ws);
  }
}

function resizeSession(sessionId, cols, rows) {
  const session = sessions.get(sessionId);
  if (session && session.status === 'running') {
    session.pty.resize(cols, rows);
  }
}

function writeToSession(sessionId, data) {
  const session = sessions.get(sessionId);
  if (session && session.status === 'running') {
    session.pty.write(data);
  }
}

function cleanupAllSessions() {
  for (const [id, session] of sessions.entries()) {
    // Flush scrollback to DB before cleanup
    if (session.scrollback.length > 0) {
      try {
        db.saveScrollback(id, session.scrollback.join(''));
      } catch {
        // DB may already be closed during shutdown
      }
    }

    if (session.status === 'running') {
      session.status = 'stopped';
      session.stoppedAt = new Date().toISOString();
      try {
        db.saveSession(session);
      } catch {
        // DB may already be closed
      }
      try {
        session.pty.kill('SIGTERM');
      } catch (e) {
        // ignore
      }
    }

    // Clear flush interval
    const interval = flushIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      flushIntervals.delete(id);
    }
  }
  sessions.clear();
}

// Strip internal fields (pty, clients, scrollback) for API responses
function getSessionMeta(session) {
  return {
    id: session.id,
    projectId: session.projectId,
    projectName: session.projectName,
    projectPath: session.projectPath,
    status: session.status,
    pid: session.pid,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    exitCode: session.exitCode ?? null,
    signal: session.signal || null,
  };
}

module.exports = {
  initSessions,
  purgeOldSessions,
  createSession,
  killSession,
  getSession,
  getRawSession,
  getAllSessions,
  getSessionScrollback,
  attachClient,
  detachClient,
  resizeSession,
  writeToSession,
  cleanupAllSessions,
};
