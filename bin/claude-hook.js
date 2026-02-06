const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadConfig } = require('./config');

const MARKER = '## IMPORTANT: Notification';

function getClaudeConfigDir() {
    return path.join(os.homedir(), '.claude');
}

function getClaudeMdPath() {
    return path.join(getClaudeConfigDir(), 'CLAUDE.md');
}

function buildNotificationBlock(hostname, apiPort) {
    return `${MARKER}
After finishing responding to my request or running a command, or if you need my input or if you need permission to run a command, run this command to notify me:
\`\`\`bash
curl -s -X POST https://${hostname}:${apiPort}/api/notify -H "Content-Type: application/json" -d '{"title":"Claude Code","body":"Task completed","type":"completed"}'
\`\`\`
`;
}

function installClaudeHook() {
    const config = loadConfig();
    if (!config || !config.hostname) {
        return { status: 'error', message: 'Agent Connect not configured. Run: agent-connect setup' };
    }

    const { hostname, apiPort } = config;
    const claudeDir = getClaudeConfigDir();
    const claudeMdPath = getClaudeMdPath();
    const block = buildNotificationBlock(hostname, apiPort);

    // Ensure ~/.claude directory exists
    if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
    }

    // Check if CLAUDE.md exists
    if (fs.existsSync(claudeMdPath)) {
        const existing = fs.readFileSync(claudeMdPath, 'utf-8');

        // Already installed — idempotent
        if (existing.includes(MARKER)) {
            return { status: 'skip', message: 'Notification hook already installed in CLAUDE.md' };
        }

        // Prepend the block to existing content
        fs.writeFileSync(claudeMdPath, block + '\n' + existing);
    } else {
        // Create new file
        fs.writeFileSync(claudeMdPath, block);
    }

    return { status: 'success', message: `Notification hook installed in ${claudeMdPath}` };
}

module.exports = { installClaudeHook, MARKER };
