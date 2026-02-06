#!/usr/bin/env node

const { isSetupComplete, loadConfig, getDataDir } = require('./config');
const path = require('path');
const fs = require('fs');

const VERSION = require(path.join(__dirname, '..', 'package.json')).version;

const HELP = `
  Agent Connect v${VERSION}
  Push notifications for AI coding agents

  Usage:
    agent-connect              Start (runs setup if needed)
    agent-connect setup        Run interactive setup wizard
    agent-connect start        Start servers (skip setup check)
    agent-connect status       Show connection & subscription status
    agent-connect notify MSG   Send a notification
    agent-connect install-hook Install Claude Code notification hook
    agent-connect --help       Show this help
    agent-connect --version    Show version

  Notify options:
    --title TITLE              Notification title (default: "Agent Connect")
    --type TYPE                Notification type (default: completed)

  Notification types:
    completed                  Task/request finished successfully (default)
    planning_complete          Finished planning, ready for review
    approval_needed            Need approval before proceeding
    input_needed               Need information or clarification
    command_execution          A command finished executing
    error                      Something failed

  Examples:
    agent-connect notify "Refactored auth module" --type completed
    agent-connect notify "Ready to implement new endpoint" --type planning_complete
    agent-connect notify "Delete legacy files?" --type approval_needed
    agent-connect notify "Need clarification on API schema" --type input_needed
    agent-connect notify "npm install completed" --type command_execution
    agent-connect notify "Build failed: missing dep" --title "CI" --type error
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || '';

  if (command === '--help' || command === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log(VERSION);
    process.exit(0);
  }

  if (command === 'setup') {
    const { runSetup } = require('./setup');
    await runSetup();
    process.exit(0);
  }

  if (command === 'start') {
    const { startServers } = require('./start');
    await startServers();
    return;
  }

  if (command === 'status') {
    await showStatus();
    process.exit(0);
  }

  if (command === 'notify') {
    await sendNotify(args.slice(1));
    process.exit(0);
  }

  if (command === 'install-hook') {
    if (!isSetupComplete()) {
      console.error('  Not configured. Run: agent-connect setup');
      process.exit(1);
    }
    const { installClaudeHook } = require('./claude-hook');
    const result = installClaudeHook();
    console.log(`  ${result.message}`);
    process.exit(result.status === 'error' ? 1 : 0);
  }

  // Default: setup if needed, then start
  if (command === '' || command === 'run') {
    if (!isSetupComplete()) {
      console.log();
      console.log('  First-time setup required.');
      const { runSetup } = require('./setup');
      await runSetup();
    }

    const { startServers } = require('./start');
    await startServers();
    return;
  }

  console.error(`  Unknown command: ${command}`);
  console.log(HELP);
  process.exit(1);
}

async function showStatus() {
  console.log();
  console.log('  Agent Connect - Status');
  console.log('  ======================');
  console.log();

  // Config
  if (isSetupComplete()) {
    const config = loadConfig();
    console.log(`  Setup: complete`);
    console.log(`  Hostname: ${config.hostname}`);
    console.log(`  Frontend: https://${config.hostname}`);
    console.log(`  API: https://${config.hostname}:${config.apiPort}`);
    console.log(`  Setup date: ${config.setupDate}`);
  } else {
    console.log('  Setup: not configured');
    console.log('  Run: agent-connect setup');
    return;
  }

  // Subscriptions
  const dataDir = getDataDir();
  const subsFile = path.join(dataDir, 'subscriptions.json');
  try {
    const subs = JSON.parse(fs.readFileSync(subsFile, 'utf-8'));
    console.log(`  Subscriptions: ${subs.length}`);
  } catch {
    console.log('  Subscriptions: 0');
  }

  // Tailscale
  try {
    const { execSync } = require('child_process');
    const status = JSON.parse(execSync('tailscale status --json', { encoding: 'utf-8' }));
    console.log(`  Tailscale: ${status.BackendState}`);
  } catch {
    console.log('  Tailscale: unknown');
  }

  console.log();
}

async function sendNotify(args) {
  if (args.length === 0) {
    console.error('  Usage: agent-connect notify "message" [--title TITLE] [--type TYPE]');
    process.exit(1);
  }

  const config = loadConfig();
  if (!config) {
    console.error('  Not configured. Run: agent-connect setup');
    process.exit(1);
  }

  // Parse args
  let body = '';
  let title = 'Agent Connect';
  let type = 'completed';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      title = args[++i];
    } else if (args[i] === '--type' && args[i + 1]) {
      type = args[++i];
    } else if (!args[i].startsWith('--')) {
      body = args[i];
    }
  }

  if (!body) {
    console.error('  Message body is required.');
    process.exit(1);
  }

  const knownTypes = ['completed', 'task_done', 'planning_complete', 'approval_needed', 'input_needed', 'command_execution', 'error'];
  if (!knownTypes.includes(type)) {
    console.warn(`  Warning: unknown type "${type}" — will be treated as "completed" by the client`);
  }

  // Try local HTTP first (fastest, always works when server is running on same machine),
  // then fall back to Tailscale HTTPS URL
  const localUrl = `http://127.0.0.1:${config.apiPort}/api/notify`;
  const remoteUrl = `https://${config.hostname}:${config.apiPort}/api/notify`;
  const payload = JSON.stringify({ title, body, type });
  const headers = { 'Content-Type': 'application/json' };

  let lastError;
  for (const apiUrl of [localUrl, remoteUrl]) {
    try {
      const res = await fetch(apiUrl, { method: 'POST', headers, body: payload });
      const data = await res.json();
      if (res.ok) {
        console.log(`  Sent: ${data.message}`);
        return;
      } else {
        console.error(`  Error: ${data.error}`);
        process.exit(1);
      }
    } catch (err) {
      lastError = err;
    }
  }

  console.error(`  Failed to send notification: ${lastError.message}`);
  console.error('  Is Agent Connect running? Try: agent-connect start');
  process.exit(1);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
