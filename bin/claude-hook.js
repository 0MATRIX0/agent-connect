const fs = require('fs');
const path = require('path');
const os = require('os');

const MARKER = '## IMPORTANT: Notification';
const END_MARKER = '<!-- END agent-connect notification block -->';

// Identify our hooks by this prefix in the command field
const HOOK_SCRIPT_DIR = path.join(__dirname, '..', 'scripts', 'hooks');
const HOOK_IDENTIFIER = HOOK_SCRIPT_DIR;

function getClaudeConfigDir() {
    return path.join(os.homedir(), '.claude');
}

function getClaudeMdPath() {
    return path.join(getClaudeConfigDir(), 'CLAUDE.md');
}

function getSettingsJsonPath() {
    return path.join(getClaudeConfigDir(), 'settings.json');
}

// Old stop hook command to clean up
const OLD_STOP_HOOK_COMMAND = 'agent-connect notify "Claude is waiting for input" --type input_needed';

/**
 * Remove the legacy notification instruction block from CLAUDE.md
 * (We no longer tell Claude to run `agent-connect notify` commands itself —
 *  hooks handle all notifications now.)
 */
function removeClaudeMdNotificationBlock() {
    const claudeMdPath = getClaudeMdPath();
    if (!fs.existsSync(claudeMdPath)) return;

    const existing = fs.readFileSync(claudeMdPath, 'utf-8');
    if (!existing.includes(MARKER)) return;

    const markerIdx = existing.indexOf(MARKER);
    const before = existing.substring(0, markerIdx);

    let after = '';
    const endMarkerIdx = existing.indexOf(END_MARKER, markerIdx);
    if (endMarkerIdx !== -1) {
        let cutEnd = endMarkerIdx + END_MARKER.length;
        // Skip trailing newlines
        while (existing[cutEnd] === '\n') cutEnd++;
        after = existing.substring(cutEnd);
    } else {
        // Legacy block — find next ## heading
        const rest = existing.substring(markerIdx + MARKER.length);
        const nextHeading = rest.search(/\n## /);
        if (nextHeading !== -1) {
            after = rest.substring(nextHeading);
        }
    }

    const cleaned = (before + after).replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(claudeMdPath, cleaned);
}

/**
 * Build the hook definitions that should be in ~/.claude/settings.json
 */
function buildHookDefinitions() {
    return {
        Stop: [
            {
                matcher: '',
                hooks: [{
                    type: 'command',
                    command: path.join(HOOK_SCRIPT_DIR, 'on-stop.sh')
                }]
            }
        ],
        Notification: [
            {
                matcher: 'idle_prompt',
                hooks: [{
                    type: 'command',
                    command: path.join(HOOK_SCRIPT_DIR, 'on-idle.sh')
                }]
            },
            {
                matcher: 'permission_prompt',
                hooks: [{
                    type: 'command',
                    command: path.join(HOOK_SCRIPT_DIR, 'on-permission.sh')
                }]
            }
        ],
        PreToolUse: [
            {
                matcher: '',
                hooks: [{
                    type: 'command',
                    command: path.join(HOOK_SCRIPT_DIR, 'on-tool-use.sh')
                }]
            }
        ],
        SessionStart: [
            {
                matcher: '',
                hooks: [{
                    type: 'command',
                    command: path.join(HOOK_SCRIPT_DIR, 'on-session-start.sh')
                }]
            }
        ],
        SessionEnd: [
            {
                matcher: '',
                hooks: [{
                    type: 'command',
                    command: path.join(HOOK_SCRIPT_DIR, 'on-session-end.sh')
                }]
            },
            {
                matcher: 'clear',
                hooks: [{
                    type: 'command',
                    command: path.join(HOOK_SCRIPT_DIR, 'on-clear.sh')
                }]
            }
        ],
        UserPromptSubmit: [
            {
                matcher: '',
                hooks: [{
                    type: 'command',
                    command: path.join(HOOK_SCRIPT_DIR, 'on-prompt-submit.sh')
                }]
            }
        ]
    };
}

/**
 * Install hooks into ~/.claude/settings.json
 * - Removes old agent-connect hooks (identified by script path or old command)
 * - Adds the new hook-based system
 * - Preserves any non-agent-connect hooks the user may have added
 */
function installSettingsHooks() {
    const settingsPath = getSettingsJsonPath();
    let settings = {};

    if (fs.existsSync(settingsPath)) {
        try {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        } catch {
            console.warn('Warning: ~/.claude/settings.json was invalid JSON, recreating it');
            settings = {};
        }
    }

    if (!settings.hooks) {
        settings.hooks = {};
    }

    const newHooks = buildHookDefinitions();

    // For each hook event type, remove old agent-connect entries and add new ones
    for (const [eventType, newEntries] of Object.entries(newHooks)) {
        const existing = Array.isArray(settings.hooks[eventType]) ? settings.hooks[eventType] : [];

        // Filter out old agent-connect hooks (identified by script path or old command)
        const userHooks = existing.filter(entry => {
            if (!Array.isArray(entry.hooks)) return true;
            return !entry.hooks.some(h =>
                (h.command && h.command.includes(HOOK_IDENTIFIER)) ||
                (h.command === OLD_STOP_HOOK_COMMAND)
            );
        });

        // Add our new hooks
        settings.hooks[eventType] = [...userHooks, ...newEntries];
    }

    // Also clean up any leftover old Stop hooks with the old command
    if (Array.isArray(settings.hooks.Stop)) {
        settings.hooks.Stop = settings.hooks.Stop.filter(entry => {
            if (!Array.isArray(entry.hooks)) return true;
            return !entry.hooks.some(h => h.command === OLD_STOP_HOOK_COMMAND);
        });
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    return settingsPath;
}

/**
 * Main entry point: install the hook-based notification system
 */
function installClaudeHook() {
    const claudeDir = getClaudeConfigDir();

    // Ensure ~/.claude directory exists
    if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
    }

    // Step 1: Remove old CLAUDE.md notification instructions
    removeClaudeMdNotificationBlock();

    // Step 2: Install proper hooks in settings.json
    const settingsPath = installSettingsHooks();

    return {
        status: 'success',
        message: `Hook-based notifications installed in ${settingsPath} (CLAUDE.md notification block removed)`
    };
}

module.exports = { installClaudeHook, MARKER, END_MARKER };
