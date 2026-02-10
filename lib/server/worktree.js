const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const WORKTREE_DIR = path.join(os.homedir(), '.agent-connect', 'worktrees');

/**
 * Check if a directory is inside a git repository.
 */
function isGitRepo(dirPath) {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: dirPath,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root of the git repository for a given path.
 */
function getRepoRoot(dirPath) {
  return execSync('git rev-parse --show-toplevel', {
    cwd: dirPath,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();
}

/**
 * Create a git worktree for a session.
 *
 * @param {string} repoPath - Path to the git repository (or subdirectory of it)
 * @param {string} sessionId - Session UUID
 * @param {string} [branch] - Optional branch name (e.g. "feature/add-auth"). Auto-generated if omitted.
 * @param {string} [projectName] - Project name used for auto-generated branch names
 * @returns {{ worktreePath: string, branch: string, repoRoot: string }}
 */
function createWorktree(repoPath, sessionId, branch, projectName) {
  const repoRoot = getRepoRoot(repoPath);
  const shortId = sessionId.slice(0, 8);
  const worktreePath = path.join(WORKTREE_DIR, sessionId);

  // Generate branch name if not provided
  if (!branch) {
    const slug = (projectName || path.basename(repoRoot))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    branch = `worktree/${slug}-${shortId}`;
  }

  // Ensure parent directory exists
  if (!fs.existsSync(WORKTREE_DIR)) {
    fs.mkdirSync(WORKTREE_DIR, { recursive: true });
  }

  execSync(`git worktree add ${JSON.stringify(worktreePath)} -b ${JSON.stringify(branch)}`, {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  return { worktreePath, branch, repoRoot };
}

/**
 * Remove a git worktree and delete its branch.
 *
 * @param {string} repoPath - Path to the main repository
 * @param {string} worktreePath - Path to the worktree directory
 * @param {string} branch - Branch name to delete
 */
function removeWorktree(repoPath, worktreePath, branch) {
  const repoRoot = getRepoRoot(repoPath);

  try {
    execSync(`git worktree remove ${JSON.stringify(worktreePath)} --force`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  } catch {
    // Worktree directory may already be gone; prune stale entries
    try {
      execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      // ignore
    }
    // Clean up directory if it still exists
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
  }

  // Delete the branch
  if (branch) {
    try {
      execSync(`git branch -D ${JSON.stringify(branch)}`, {
        cwd: repoRoot,
        stdio: 'pipe',
      });
    } catch {
      // Branch may already be deleted or never created
    }
  }
}

/**
 * List all worktrees for a repository.
 *
 * @param {string} repoPath - Path to the git repository
 * @returns {Array<{ path: string, branch: string, head: string }>}
 */
function listWorktrees(repoPath) {
  const repoRoot = getRepoRoot(repoPath);
  const output = execSync('git worktree list --porcelain', {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  const worktrees = [];
  let current = {};

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current);
      current = { path: line.slice(9) };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5);
    } else if (line.startsWith('branch ')) {
      // e.g. "branch refs/heads/feature/foo" → "feature/foo"
      current.branch = line.slice(7).replace('refs/heads/', '');
    } else if (line === '') {
      if (current.path) worktrees.push(current);
      current = {};
    }
  }
  if (current.path) worktrees.push(current);

  return worktrees;
}

/**
 * Check if a worktree path still exists on disk.
 */
function worktreeExists(worktreePath) {
  return fs.existsSync(worktreePath);
}

module.exports = {
  isGitRepo,
  getRepoRoot,
  createWorktree,
  removeWorktree,
  listWorktrees,
  worktreeExists,
  WORKTREE_DIR,
};
