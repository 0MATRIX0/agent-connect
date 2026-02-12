const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DATA_DIR = process.env.AGENT_CONNECT_DATA_DIR || path.join(os.homedir(), '.agent-connect', 'data');
const DB_PATH = path.join(DATA_DIR, 'sessions.db');

let db = null;

function initDb() {
  if (db) return db;

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read/write performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      project_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      pid INTEGER,
      started_at TEXT NOT NULL,
      stopped_at TEXT,
      exit_code INTEGER,
      signal TEXT
    );

    CREATE TABLE IF NOT EXISTS scrollback (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      data TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS transcript (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      data TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
  `);

  // Migration: add type column if it doesn't exist
  const columns = db.pragma('table_info(sessions)');
  const hasType = columns.some(col => col.name === 'type');
  if (!hasType) {
    db.exec(`ALTER TABLE sessions ADD COLUMN type TEXT NOT NULL DEFAULT 'terminal'`);
    console.log('[db] Migrated: added type column to sessions table');
  }

  // Migration: add frozen_at column if it doesn't exist
  const hasFrozenAt = columns.some(col => col.name === 'frozen_at');
  if (!hasFrozenAt) {
    db.exec(`ALTER TABLE sessions ADD COLUMN frozen_at TEXT`);
    console.log('[db] Migrated: added frozen_at column to sessions table');
  }

  // Migration: add worktree_path and branch columns if they don't exist
  const hasWorktreePath = columns.some(col => col.name === 'worktree_path');
  if (!hasWorktreePath) {
    db.exec(`ALTER TABLE sessions ADD COLUMN worktree_path TEXT`);
    console.log('[db] Migrated: added worktree_path column to sessions table');
  }
  const hasBranch = columns.some(col => col.name === 'branch');
  if (!hasBranch) {
    db.exec(`ALTER TABLE sessions ADD COLUMN branch TEXT`);
    console.log('[db] Migrated: added branch column to sessions table');
  }

  // Migration: add tmux_session_name column if it doesn't exist
  const hasTmuxSessionName = columns.some(col => col.name === 'tmux_session_name');
  if (!hasTmuxSessionName) {
    db.exec(`ALTER TABLE sessions ADD COLUMN tmux_session_name TEXT`);
    console.log('[db] Migrated: added tmux_session_name column to sessions table');
  }

  // Note: orphaned session recovery is handled in sessions.js (tmux-aware)

  console.log(`[db] SQLite database initialized at ${DB_PATH}`);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

function saveSession(session) {
  const d = getDb();
  d.prepare(`
    INSERT INTO sessions (id, project_id, project_name, project_path, status, pid, started_at, stopped_at, exit_code, signal, type, frozen_at, worktree_path, branch, tmux_session_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      pid = excluded.pid,
      stopped_at = excluded.stopped_at,
      exit_code = excluded.exit_code,
      signal = excluded.signal,
      frozen_at = excluded.frozen_at,
      worktree_path = excluded.worktree_path,
      branch = excluded.branch,
      tmux_session_name = excluded.tmux_session_name
  `).run(
    session.id,
    session.projectId,
    session.projectName,
    session.projectPath,
    session.status,
    session.pid || null,
    session.startedAt,
    session.stoppedAt || null,
    session.exitCode ?? null,
    session.signal || null,
    session.type || 'terminal',
    session.frozenAt || null,
    session.worktreePath || null,
    session.branch || null,
    session.tmuxSessionName || null
  );
}

function saveScrollback(sessionId, data) {
  const d = getDb();
  d.prepare(`
    INSERT INTO scrollback (session_id, data) VALUES (?, ?)
    ON CONFLICT(session_id) DO UPDATE SET data = excluded.data
  `).run(sessionId, data);
}

function getDbSession(id) {
  const d = getDb();
  const row = d.prepare(`
    SELECT s.*, sb.data as scrollback_data
    FROM sessions s
    LEFT JOIN scrollback sb ON sb.session_id = s.id
    WHERE s.id = ?
  `).get(id);

  if (!row) return null;
  return formatRow(row);
}

function getDbSessions({ projectId, status, limit = 50, offset = 0 } = {}) {
  const d = getDb();
  let sql = 'SELECT * FROM sessions WHERE 1=1';
  const params = [];

  if (projectId) {
    sql += ' AND project_id = ?';
    params.push(projectId);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY started_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = d.prepare(sql).all(...params);
  return rows.map(formatRow);
}

function deleteOldSessions(days) {
  const d = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  const result = d.prepare(`
    DELETE FROM sessions WHERE started_at < ? AND status = 'stopped'
  `).run(cutoffStr);

  if (result.changes > 0) {
    console.log(`[db] Purged ${result.changes} session(s) older than ${days} days`);
  }
  return result.changes;
}

function saveTranscript(sessionId, data) {
  const d = getDb();
  d.prepare(`
    INSERT INTO transcript (session_id, data) VALUES (?, ?)
    ON CONFLICT(session_id) DO UPDATE SET data = excluded.data
  `).run(sessionId, data);
}

function getTranscript(sessionId) {
  const d = getDb();
  const row = d.prepare('SELECT data FROM transcript WHERE session_id = ?').get(sessionId);
  return row ? row.data : null;
}

function formatRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    projectPath: row.project_path,
    status: row.status,
    pid: row.pid,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    exitCode: row.exit_code,
    signal: row.signal,
    type: row.type || 'terminal',
    frozenAt: row.frozen_at || null,
    worktreePath: row.worktree_path || null,
    branch: row.branch || null,
    tmuxSessionName: row.tmux_session_name || null,
    scrollbackData: row.scrollback_data || undefined,
  };
}

module.exports = {
  initDb,
  getDb,
  saveSession,
  saveScrollback,
  saveTranscript,
  getTranscript,
  getDbSession,
  getDbSessions,
  deleteOldSessions,
};
