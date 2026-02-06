const { execSync, spawnSync } = require('child_process');
const readline = require('readline');
const path = require('path');
const { saveConfig, loadConfig, ensureDataDir, getConfigDir } = require('./config');

function ask(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: opts.stdio || 'pipe', ...opts }).trim();
  } catch (e) {
    if (opts.ignoreError) return '';
    throw e;
  }
}

function print(msg = '') {
  console.log(msg);
}

async function runSetup() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  print();
  print('  Agent Connect - Setup Wizard');
  print('  ============================');
  print();

  // Step 1: Check Node.js version
  const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeVersion < 18) {
    print(`  Node.js ${process.versions.node} detected. Node.js >= 18 is required.`);
    rl.close();
    process.exit(1);
  }
  print(`  Node.js ${process.versions.node} ... ok`);

  // Step 2: Check Tailscale installed
  let tailscaleInstalled = false;
  try {
    exec('tailscale version');
    tailscaleInstalled = true;
    print('  Tailscale ... installed');
  } catch {
    print('  Tailscale ... not found');
  }

  if (!tailscaleInstalled) {
    const installAnswer = await ask(rl, '  Install Tailscale? (Y/n) ');
    if (installAnswer.toLowerCase() === 'n') {
      print('  Tailscale is required. Exiting.');
      rl.close();
      process.exit(1);
    }
    print('  Installing Tailscale...');
    try {
      execSync('curl -fsSL https://tailscale.com/install.sh | sh', { stdio: 'inherit' });
      print('  Tailscale installed successfully.');
    } catch (e) {
      print('  Failed to install Tailscale. Please install manually:');
      print('  https://tailscale.com/download');
      rl.close();
      process.exit(1);
    }
  }

  // Step 3: Check Tailscale connected
  let tailscaleStatus;
  try {
    tailscaleStatus = JSON.parse(exec('tailscale status --json'));
  } catch {
    tailscaleStatus = null;
  }

  const backendState = tailscaleStatus?.BackendState;
  if (backendState !== 'Running') {
    print(`  Tailscale state: ${backendState || 'unknown'}`);
    print('  Starting Tailscale...');
    try {
      execSync('sudo tailscale up', { stdio: 'inherit' });
      // Re-check status
      tailscaleStatus = JSON.parse(exec('tailscale status --json'));
    } catch (e) {
      print('  Failed to start Tailscale. Please run: sudo tailscale up');
      rl.close();
      process.exit(1);
    }
  }
  print('  Tailscale ... connected');

  // Step 4: Set operator
  try {
    const currentUser = exec('whoami');
    exec(`sudo tailscale set --operator=${currentUser}`);
    print(`  Tailscale operator set to: ${currentUser}`);
  } catch {
    print('  Warning: Could not set Tailscale operator. You may need sudo for serve commands.');
  }

  // Step 5: Get hostname
  let hostname;
  try {
    tailscaleStatus = JSON.parse(exec('tailscale status --json'));
    const dnsName = tailscaleStatus.Self?.DNSName;
    if (dnsName) {
      // Remove trailing dot
      hostname = dnsName.replace(/\.$/, '');
    }
  } catch {}

  if (!hostname) {
    hostname = await ask(rl, '  Enter your Tailscale hostname (e.g., myhost.tailnet.ts.net): ');
  }
  print(`  Hostname: ${hostname}`);

  // Step 6: Generate VAPID keys
  print('  Generating VAPID keys...');
  const webpush = require('web-push');
  const vapidKeys = webpush.generateVAPIDKeys();

  const vapidSubject = 'mailto:agent-connect@localhost';
  print('  VAPID keys generated.');

  // Step 7: Configure ports
  const existingConfig = loadConfig();
  const apiPort = existingConfig?.apiPort || 3109;
  const frontendPort = existingConfig?.frontendPort || 3110;

  // Step 8: Set up Tailscale Serve
  print('  Setting up Tailscale Serve...');

  // Check if proxies are already configured
  let serveStatus = '';
  try {
    serveStatus = exec('tailscale serve status', { timeout: 5000, ignoreError: true }) || '';
  } catch {
    // No serve config yet
  }

  const proxyConfigs = [
    { name: 'frontend', https: '443', target: frontendPort },
    { name: 'API',      https: String(apiPort), target: apiPort },
  ];

  for (const proxy of proxyConfigs) {
    if (serveStatus.includes(`localhost:${proxy.target}`)) {
      print(`    HTTPS :${proxy.https} -> localhost:${proxy.target} (${proxy.name}) - already configured`);
      continue;
    }
    try {
      // Use stdio: 'inherit' so user can see and act on any auth prompts
      // (e.g. "Serve is not enabled on your tailnet. To enable, visit: ...")
      execSync(`tailscale serve --bg --https ${proxy.https} http://localhost:${proxy.target}`, { stdio: 'inherit' });
      print(`    HTTPS :${proxy.https} -> localhost:${proxy.target} (${proxy.name})`);
    } catch (e) {
      if (e.code === 'ETIMEDOUT') {
        print(`  Warning: Timed out setting up ${proxy.name} serve (30s)`);
      } else {
        print(`  Warning: Failed to set up ${proxy.name} serve: ${e.message}`);
      }
    }
  }

  // Step 9: Save config
  const config = {
    vapidPublicKey: vapidKeys.publicKey,
    vapidPrivateKey: vapidKeys.privateKey,
    vapidSubject,
    hostname,
    apiPort,
    frontendPort,
    setupDate: new Date().toISOString(),
  };

  saveConfig(config);
  ensureDataDir();

  // Install Claude Code notification hook
  const { installClaudeHook } = require('./claude-hook');
  const hookResult = installClaudeHook();
  print(`  Claude hook: ${hookResult.message}`);

  print();
  print(`  Config saved to ${getConfigDir()}/config.json`);
  print();
  print('  Setup complete!');
  print();
  print(`  Frontend: https://${hostname}`);
  print(`  API:      https://${hostname}:${apiPort}`);
  print();
  print('  Open the frontend URL on your phone to enable notifications.');
  print();

  rl.close();
  return config;
}

module.exports = { runSetup };

if (require.main === module) {
  runSetup().catch(err => {
    console.error('Setup failed:', err.message);
    process.exit(1);
  });
}
