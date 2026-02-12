const { execFileSync } = require('child_process');

const EXEC_TIMEOUT = 5000; // 5s timeout for tmux commands

function isTmuxAvailable() {
  try {
    execFileSync('tmux', ['-V'], { timeout: EXEC_TIMEOUT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getTmuxSessionName(sessionId) {
  return `ac-${sessionId.slice(0, 12)}`;
}

function createTmuxSession(name, { cwd, cols = 120, rows = 30, env = {} } = {}) {
  const args = ['new-session', '-d', '-s', name, '-x', String(cols), '-y', String(rows)];

  // Pass environment variables via -e flags
  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`);
  }

  execFileSync('tmux', args, {
    timeout: EXEC_TIMEOUT,
    stdio: 'pipe',
    cwd: cwd || undefined,
  });
}

function killTmuxSession(name) {
  try {
    execFileSync('tmux', ['kill-session', '-t', name], {
      timeout: EXEC_TIMEOUT,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function tmuxSessionExists(name) {
  try {
    execFileSync('tmux', ['has-session', '-t', name], {
      timeout: EXEC_TIMEOUT,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function listAgentTmuxSessions() {
  try {
    const output = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], {
      timeout: EXEC_TIMEOUT,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return output.trim().split('\n').filter(name => name.startsWith('ac-'));
  } catch {
    // No tmux server running or no sessions
    return [];
  }
}

function capturePaneContent(name) {
  try {
    const output = execFileSync('tmux', ['capture-pane', '-t', name, '-p', '-S', '-', '-E', '-'], {
      timeout: EXEC_TIMEOUT,
      stdio: 'pipe',
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024, // 16MB
    });
    return output;
  } catch {
    return '';
  }
}

function resizeTmuxWindow(name, cols, rows) {
  try {
    execFileSync('tmux', ['resize-window', '-t', name, '-x', String(cols), '-y', String(rows)], {
      timeout: EXEC_TIMEOUT,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function setEnvironment(name, key, value) {
  try {
    execFileSync('tmux', ['set-environment', '-t', name, key, value], {
      timeout: EXEC_TIMEOUT,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  isTmuxAvailable,
  getTmuxSessionName,
  createTmuxSession,
  killTmuxSession,
  tmuxSessionExists,
  listAgentTmuxSessions,
  capturePaneContent,
  resizeTmuxWindow,
  setEnvironment,
};
