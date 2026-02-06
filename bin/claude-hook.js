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

When you need input or a decision from the user, ASK instead of just notifying:
\`\`\`bash
RESPONSE=$(agent-connect ask "question" --options "opt1,opt2,opt3")
\`\`\`
The \`ask\` command blocks until the user responds and returns their answer to stdout.
Use \`--timeout SECONDS\` to set a custom timeout (default: 300s).
Use \`--no-custom\` to restrict responses to the provided options only.

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
RESPONSE=$(agent-connect ask "Delete legacy files?" --options "Yes,No,Skip")
RESPONSE=$(agent-connect ask "Which database?" --options "PostgreSQL,SQLite" --timeout 60)
\`\`\`
Always include a descriptive body explaining what was done or what is needed.
${END_MARKER}
`;
}

function installClaudeHook() {
    const claudeDir = getClaudeConfigDir();
    const claudeMdPath = getClaudeMdPath();
    const block = buildNotificationBlock();

    // Ensure ~/.claude directory exists
    if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
    }

    // Check if CLAUDE.md exists
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
            return { status: 'success', message: `Notification hook updated in ${claudeMdPath}` };
        }

        // No existing block — prepend
        fs.writeFileSync(claudeMdPath, block + '\n' + existing);
    } else {
        // Create new file
        fs.writeFileSync(claudeMdPath, block);
    }

    return { status: 'success', message: `Notification hook installed in ${claudeMdPath}` };
}

module.exports = { installClaudeHook, MARKER, END_MARKER };
