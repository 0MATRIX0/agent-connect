const fs = require('fs');
const path = require('path');
const os = require('os');

const MARKER = '## IMPORTANT: Notification';
const END_MARKER = '<!-- END agent-connect notification block -->';

function getClaudeConfigDir() {
    return path.join(os.homedir(), '.claude');
}

function getClaudeMdPath() {
    return path.join(getClaudeConfigDir(), 'CLAUDE.md');
}

function buildNotificationBlock() {
    return `${MARKER}
After finishing a task, needing input, or completing an action, notify me using:
\`\`\`bash
agent-connect notify "description" --type TYPE
\`\`\`

Notification types:
- \`completed\` — Task/request finished successfully (default)
- \`planning_complete\` — Finished planning, ready for review
- \`approval_needed\` — Need approval before proceeding
- \`input_needed\` — Need information or clarification
- \`command_execution\` — A command finished executing
- \`error\` — Something failed

Examples:
\`\`\`bash
agent-connect notify "Refactored auth module and added tests" --type completed
agent-connect notify "Ready to implement the new API endpoint" --type planning_complete
agent-connect notify "Should I delete the legacy migration files?" --type approval_needed
agent-connect notify "npm install completed successfully" --type command_execution
agent-connect notify "Build failed: missing dependency" --type error
\`\`\`
Always include a descriptive body explaining what was done or what is needed.
${END_MARKER}
`;
}

function getSettingsJsonPath() {
    return path.join(getClaudeConfigDir(), 'settings.json');
}

const STOP_HOOK_COMMAND = 'agent-connect notify "Claude is waiting for input" --type input_needed';

function installSettingsHook() {
    const settingsPath = getSettingsJsonPath();
    let settings = {};

    // Read existing settings.json if it exists
    if (fs.existsSync(settingsPath)) {
        try {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        } catch {
            // If JSON is corrupt, start fresh but log a warning
            console.warn('Warning: ~/.claude/settings.json was invalid JSON, recreating it');
            settings = {};
        }
    }

    // Ensure hooks object exists
    if (!settings.hooks) {
        settings.hooks = {};
    }

    // Build the Stop hook entry
    const stopHookEntry = {
        matcher: '',
        hooks: [
            {
                type: 'command',
                command: STOP_HOOK_COMMAND
            }
        ]
    };

    // Check if Stop hooks already contain our command
    if (Array.isArray(settings.hooks.Stop)) {
        const alreadyInstalled = settings.hooks.Stop.some(entry =>
            Array.isArray(entry.hooks) &&
            entry.hooks.some(h => h.command === STOP_HOOK_COMMAND)
        );
        if (!alreadyInstalled) {
            settings.hooks.Stop.push(stopHookEntry);
        }
    } else {
        settings.hooks.Stop = [stopHookEntry];
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    return settingsPath;
}

function installClaudeHook() {
    const claudeDir = getClaudeConfigDir();
    const claudeMdPath = getClaudeMdPath();
    const block = buildNotificationBlock();

    // Ensure ~/.claude directory exists
    if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
    }

    // --- Install CLAUDE.md notification instructions ---
    if (fs.existsSync(claudeMdPath)) {
        const existing = fs.readFileSync(claudeMdPath, 'utf-8');

        if (existing.includes(MARKER)) {
            // Replace existing block
            const markerIdx = existing.indexOf(MARKER);
            const before = existing.substring(0, markerIdx);

            let after = '';
            const endMarkerIdx = existing.indexOf(END_MARKER, markerIdx);
            if (endMarkerIdx !== -1) {
                // Modern block with END_MARKER — replace MARKER through END_MARKER + trailing newline
                let cutEnd = endMarkerIdx + END_MARKER.length;
                // Skip one trailing newline if present
                if (existing[cutEnd] === '\n') cutEnd++;
                after = existing.substring(cutEnd);
            } else {
                // Legacy block without END_MARKER — find next ## heading
                const rest = existing.substring(markerIdx + MARKER.length);
                const nextHeading = rest.search(/\n## /);
                if (nextHeading !== -1) {
                    // Keep from the next heading onward (include the newline before ##)
                    after = rest.substring(nextHeading);
                } else {
                    // No next heading — the block runs to EOF
                    after = '';
                }
            }

            fs.writeFileSync(claudeMdPath, before + block + after);
        } else {
            // No existing block — prepend
            fs.writeFileSync(claudeMdPath, block + '\n' + existing);
        }
    } else {
        // Create new file
        fs.writeFileSync(claudeMdPath, block);
    }

    // --- Install Stop hook in settings.json ---
    const settingsPath = installSettingsHook();

    return {
        status: 'success',
        message: `Notification hook installed in ${claudeMdPath} and ${settingsPath}`
    };
}

module.exports = { installClaudeHook, MARKER, END_MARKER };
