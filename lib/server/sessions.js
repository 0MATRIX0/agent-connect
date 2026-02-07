const pty = require('node-pty');
const { v4: uuidv4 } = require('uuid');

const MAX_SCROLLBACK = 5000;

// In-memory session store: Map<sessionId, sessionObject>
const sessions = new Map();

function createSession(projectId, projectName, projectPath) {
  const id = uuidv4();
  const shell = process.env.SHELL || '/bin/bash';

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
    pty: ptyProcess,
    scrollback: [],
    clients: new Set(),
  };

  // Buffer PTY output and broadcast to attached clients
  ptyProcess.onData((data) => {
    // Add to scrollback
    session.scrollback.push(data);
    if (session.scrollback.length > MAX_SCROLLBACK) {
      session.scrollback.splice(0, session.scrollback.length - MAX_SCROLLBACK);
    }

    // Broadcast to all attached WebSocket clients
    for (const ws of session.clients) {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    }
  });

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode, signal }) => {
    session.status = 'stopped';
    session.stoppedAt = new Date().toISOString();

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
  }

  return getSessionMeta(session);
}

function getSession(id) {
  const session = sessions.get(id);
  return session ? getSessionMeta(session) : null;
}

function getRawSession(id) {
  return sessions.get(id) || null;
}

function getAllSessions(projectId) {
  const result = [];
  for (const session of sessions.values()) {
    if (!projectId || session.projectId === projectId) {
      result.push(getSessionMeta(session));
    }
  }
  return result;
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
    if (session.status === 'running') {
      try {
        session.pty.kill('SIGTERM');
      } catch (e) {
        // ignore
      }
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
  };
}

module.exports = {
  createSession,
  killSession,
  getSession,
  getRawSession,
  getAllSessions,
  attachClient,
  detachClient,
  resizeSession,
  writeToSession,
  cleanupAllSessions,
};
