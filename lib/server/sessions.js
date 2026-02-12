const pty = require('node-pty');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const worktree = require('./worktree');

const MAX_SCROLLBACK = 5000;
const FLUSH_INTERVAL_MS = 30000; // 30 seconds

// In-memory session store: Map<sessionId, sessionObject>
const sessions = new Map();

// Track flush intervals per session
const flushIntervals = new Map();

function initSessions() {
  db.initDb();
  loadFrozenSessions();
}

function purgeOldSessions(days) {
  return db.deleteOldSessions(days);
}

function createSession(projectId, projectName, projectPath, { branch: requestedBranch, useWorktree, worktreePath: existingWorktreePath } = {}) {
  const id = uuidv4();

  // Load API token for hook scripts
  let hookToken = process.env.API_TOKEN || '';
  if (!hookToken) {
    try {
      const os = require('os');
      const configPath = require('path').join(os.homedir(), '.agent-connect', 'config.json');
      const config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
      if (config.apiToken) hookToken = config.apiToken;
    } catch {}
  }

  // Worktree handling: opt-in only
  let worktreePath = null;
  let sessionBranch = null;
  let cwd = projectPath;

  if (existingWorktreePath && worktree.worktreeExists(existingWorktreePath)) {
    // Use an existing worktree
    worktreePath = existingWorktreePath;
    cwd = existingWorktreePath;
    try {
      const worktrees = worktree.listWorktrees(projectPath);
      const match = worktrees.find(w => w.path === existingWorktreePath);
      if (match) sessionBranch = match.branch || null;
    } catch {}
    console.log(`[sessions] Using existing worktree for session ${id.slice(0, 8)}: path=${existingWorktreePath}`);
  } else if (useWorktree && worktree.isGitRepo(projectPath)) {
    // Create a new worktree
    try {
      const result = worktree.createWorktree(projectPath, id, requestedBranch, projectName);
      worktreePath = result.worktreePath;
      sessionBranch = result.branch;
      cwd = worktreePath;
      console.log(`[sessions] Created worktree for session ${id.slice(0, 8)}: branch=${sessionBranch}`);
    } catch (err) {
      console.warn(`[sessions] Failed to create worktree for session ${id.slice(0, 8)}, using direct cwd:`, err.message);
    }
  }

  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  const { npm_config_prefix, ...cleanEnv } = process.env;
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd,
    env: {
      ...cleanEnv,
      TERM: 'xterm-256color',
      AGENT_CONNECT_SESSION_ID: id,
      AGENT_CONNECT_URL: `http://localhost:${process.env.API_PORT || 3109}`,
      AGENT_CONNECT_TOKEN: hookToken,
    },
  });

  const session = {
    id,
    projectId,
    projectName,
    projectPath,
    worktreePath,
    branch: sessionBranch,
    status: 'running',
    activityStatus: 'Active',
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

function freezeSession(id) {
  const session = sessions.get(id);
  if (!session) {
    throw new Error('Session not found');
  }
  if (session.status !== 'running') {
    throw new Error('Only running sessions can be frozen');
  }

  // Flush scrollback to DB before freezing
  if (session.scrollback.length > 0) {
    db.saveScrollback(id, session.scrollback.join(''));
  }

  // Kill PTY
  try {
    session.pty.kill('SIGTERM');
  } catch (e) {
    // Process may have already exited
  }

  session.status = 'frozen';
  session.frozenAt = new Date().toISOString();
  session.pty = null;
  session.pid = null;

  // Persist to DB
  db.saveSession(session);

  // Clear flush interval
  const interval = flushIntervals.get(id);
  if (interval) {
    clearInterval(interval);
    flushIntervals.delete(id);
  }

  // Notify WebSocket clients
  for (const ws of session.clients) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'frozen' }));
    }
  }

  return getSessionMeta(session);
}

function unfreezeSession(id) {
  // Try in-memory first, then load from DB (post-restart case)
  let session = sessions.get(id);
  if (!session) {
    const dbSession = db.getDbSession(id);
    if (!dbSession) {
      throw new Error('Session not found');
    }
    if (dbSession.status !== 'frozen') {
      throw new Error('Session is not frozen');
    }
    // Reconstruct in-memory session from DB
    session = {
      id: dbSession.id,
      projectId: dbSession.projectId,
      projectName: dbSession.projectName,
      projectPath: dbSession.projectPath,
      worktreePath: dbSession.worktreePath || null,
      branch: dbSession.branch || null,
      status: 'frozen',
      frozenAt: dbSession.frozenAt,
      activityStatus: null,
      pid: null,
      startedAt: dbSession.startedAt,
      stoppedAt: null,
      exitCode: null,
      signal: null,
      pty: null,
      scrollback: dbSession.scrollbackData ? [dbSession.scrollbackData] : [],
      clients: new Set(),
      type: dbSession.type || 'terminal',
    };
  }

  if (session.status !== 'frozen') {
    throw new Error('Session is not frozen');
  }

  // Load API token for hook scripts
  let hookToken = process.env.API_TOKEN || '';
  if (!hookToken) {
    try {
      const os = require('os');
      const configPath = require('path').join(os.homedir(), '.agent-connect', 'config.json');
      const config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
      if (config.apiToken) hookToken = config.apiToken;
    } catch {}
  }

  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  const cwd = session.worktreePath || session.projectPath;
  const { npm_config_prefix: _, ...cleanEnv } = process.env;
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd,
    env: {
      ...cleanEnv,
      TERM: 'xterm-256color',
      AGENT_CONNECT_SESSION_ID: id,
      AGENT_CONNECT_URL: `http://localhost:${process.env.API_PORT || 3109}`,
      AGENT_CONNECT_TOKEN: hookToken,
    },
  });

  session.status = 'running';
  session.frozenAt = null;
  session.pid = ptyProcess.pid;
  session.pty = ptyProcess;
  session.activityStatus = 'Active';

  // Wire up PTY onData handler
  ptyProcess.onData((data) => {
    session.scrollback.push(data);
    if (session.scrollback.length > MAX_SCROLLBACK) {
      session.scrollback.splice(0, session.scrollback.length - MAX_SCROLLBACK);
    }
    const MAX_BUFFER = 1024 * 1024;
    for (const ws of session.clients) {
      if (ws.readyState === 1 && ws.bufferedAmount < MAX_BUFFER) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    }
  });

  // Set up periodic flush
  const flushInterval = setInterval(() => {
    if (session.scrollback.length > 0) {
      db.saveScrollback(id, session.scrollback.join(''));
    }
  }, FLUSH_INTERVAL_MS);
  flushIntervals.set(id, flushInterval);

  // Wire up PTY onExit handler
  ptyProcess.onExit(({ exitCode, signal }) => {
    session.status = 'stopped';
    session.stoppedAt = new Date().toISOString();
    session.exitCode = exitCode;
    session.signal = signal;

    if (session.scrollback.length > 0) {
      db.saveScrollback(id, session.scrollback.join(''));
    }
    db.saveSession(session);

    const interval = flushIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      flushIntervals.delete(id);
    }

    for (const ws of session.clients) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'exit', exitCode, signal }));
      }
    }
  });

  // Persist updated state
  db.saveSession(session);
  sessions.set(id, session);

  // Notify attached clients that session is unfrozen
  for (const ws of session.clients) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'unfrozen' }));
    }
  }

  return getSessionMeta(session);
}

function loadFrozenSessions() {
  const frozenRows = db.getDbSessions({ status: 'frozen', limit: 1000 });
  for (const row of frozenRows) {
    if (sessions.has(row.id)) continue;
    const scrollbackData = db.getDbSession(row.id)?.scrollbackData || '';
    const session = {
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      projectPath: row.projectPath,
      worktreePath: row.worktreePath || null,
      branch: row.branch || null,
      status: 'frozen',
      frozenAt: row.frozenAt,
      activityStatus: null,
      pid: null,
      startedAt: row.startedAt,
      stoppedAt: null,
      exitCode: null,
      signal: null,
      pty: null,
      scrollback: scrollbackData ? [scrollbackData] : [],
      clients: new Set(),
      type: row.type || 'terminal',
    };
    sessions.set(row.id, session);
  }
  if (frozenRows.length > 0) {
    console.log(`[sessions] Loaded ${frozenRows.length} frozen session(s) from DB`);
  }
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

  // If session is frozen, notify
  if (session.status === 'frozen') {
    ws.send(JSON.stringify({ type: 'frozen' }));
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
    // Skip frozen sessions — they survive server restarts
    if (session.status === 'frozen') {
      // Just flush scrollback and clear interval
      if (session.scrollback.length > 0) {
        try {
          db.saveScrollback(id, session.scrollback.join(''));
        } catch {
          // DB may already be closed during shutdown
        }
      }
      const interval = flushIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        flushIntervals.delete(id);
      }
      continue;
    }

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

function saveConversation({ projectPath, transcript }) {
  const path = require('path');
  const crypto = require('crypto');

  const id = uuidv4();
  const now = new Date().toISOString();
  const projectName = path.basename(projectPath) || 'unknown';
  const projectId = crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 12);

  const session = {
    id,
    projectId,
    projectName,
    projectPath,
    status: 'stopped',
    pid: null,
    startedAt: now,
    stoppedAt: now,
    exitCode: null,
    signal: null,
    type: 'conversation',
  };

  db.saveSession(session);
  db.saveTranscript(id, transcript);

  return getSessionMeta(session);
}

function getTranscript(sessionId) {
  return db.getTranscript(sessionId);
}

function updateSessionStatus(id, activityStatus) {
  const session = sessions.get(id);
  if (!session) return null;
  session.activityStatus = activityStatus;

  // Broadcast status update to all attached WebSocket clients
  for (const ws of session.clients) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'status', activityStatus }));
    }
  }

  return getSessionMeta(session);
}

// Strip internal fields (pty, clients, scrollback) for API responses
function getSessionMeta(session) {
  return {
    id: session.id,
    projectId: session.projectId,
    projectName: session.projectName,
    projectPath: session.projectPath,
    worktreePath: session.worktreePath || null,
    branch: session.branch || null,
    status: session.status,
    activityStatus: session.activityStatus || null,
    pid: session.pid,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    exitCode: session.exitCode ?? null,
    signal: session.signal || null,
    type: session.type || 'terminal',
    frozenAt: session.frozenAt || null,
  };
}

// Check if any session has active WebSocket clients (user is on the app)
function hasActiveClients() {
  for (const session of sessions.values()) {
    if (session.clients.size > 0) return true;
  }
  return false;
}

function cleanupSessionWorktree(id) {
  const session = sessions.get(id);
  if (!session) {
    // Try DB
    const dbSession = db.getDbSession(id);
    if (!dbSession || !dbSession.worktreePath) {
      throw new Error('Session not found or has no worktree');
    }
    // Clean up from DB data
    try {
      worktree.removeWorktree(dbSession.projectPath, dbSession.worktreePath, dbSession.branch);
    } catch (err) {
      console.warn(`[sessions] Worktree removal warning for ${id.slice(0, 8)}:`, err.message);
    }
    // Update DB to clear worktree fields
    const updated = { ...dbSession, worktreePath: null, branch: null };
    db.saveSession(updated);
    return updated;
  }

  if (session.status === 'running') {
    throw new Error('Cannot clean up worktree for a running session');
  }
  if (!session.worktreePath) {
    throw new Error('Session has no worktree');
  }

  try {
    worktree.removeWorktree(session.projectPath, session.worktreePath, session.branch);
  } catch (err) {
    console.warn(`[sessions] Worktree removal warning for ${id.slice(0, 8)}:`, err.message);
  }

  session.worktreePath = null;
  session.branch = null;
  db.saveSession(session);

  return getSessionMeta(session);
}

function getSessionWorktreeInfo(id) {
  const session = sessions.get(id);
  const meta = session ? getSessionMeta(session) : db.getDbSession(id);
  if (!meta) return null;

  return {
    worktreePath: meta.worktreePath || null,
    branch: meta.branch || null,
    exists: meta.worktreePath ? worktree.worktreeExists(meta.worktreePath) : false,
  };
}

module.exports = {
  initSessions,
  purgeOldSessions,
  createSession,
  killSession,
  freezeSession,
  unfreezeSession,
  getSession,
  getRawSession,
  getAllSessions,
  getSessionScrollback,
  updateSessionStatus,
  saveConversation,
  getTranscript,
  attachClient,
  detachClient,
  resizeSession,
  writeToSession,
  cleanupAllSessions,
  cleanupSessionWorktree,
  getSessionWorktreeInfo,
  hasActiveClients,
};
