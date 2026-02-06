const { fork, execSync } = require('child_process');
const path = require('path');
const { loadConfig, saveConfig, getDataDir, isSetupComplete, generateEnvLocal } = require('./config');

const PACKAGE_ROOT = path.resolve(__dirname, '..');

function ensureTailscale(config) {
  const hostname = config.hostname;
  const apiPort = config.apiPort || 3109;
  const frontendPort = config.frontendPort || 3110;

  // Check if tailscaled is running
  try {
    execSync('tailscale status', { stdio: 'pipe' });
    console.log('  Tailscale: running');
  } catch {
    console.log('  Tailscale: starting tailscaled...');
    try {
      execSync('sudo systemctl start tailscaled', { stdio: 'inherit' });
      // Wait briefly for it to connect
      execSync('tailscale status --json', { stdio: 'pipe', timeout: 10000 });
      console.log('  Tailscale: started');
    } catch (err) {
      console.error('  Tailscale: failed to start tailscaled');
      console.error('  Run manually: sudo systemctl start tailscaled');
      process.exit(1);
    }
  }

  // Set up tailscale serve proxies
  console.log('  Tailscale Serve: configuring proxies...');

  // Check if proxies are already configured
  let serveStatus = '';
  try {
    serveStatus = execSync('tailscale serve status', { stdio: 'pipe', timeout: 5000 }).toString();
  } catch {
    // No serve config yet, will configure below
  }

  const proxyConfigs = [
    { name: 'Frontend', https: '443', target: frontendPort, url: `https://${hostname}` },
    { name: 'API',      https: String(apiPort), target: apiPort, url: `https://${hostname}:${apiPort}` },
  ];

  for (const proxy of proxyConfigs) {
    // Skip if this proxy is already configured (status output contains "localhost:<port>")
    if (serveStatus.includes(`localhost:${proxy.target}`)) {
      console.log(`    ${proxy.name}: already configured (${proxy.url} -> localhost:${proxy.target})`);
      continue;
    }

    const cmd = `tailscale serve --bg --https ${proxy.https} http://localhost:${proxy.target}`;
    console.log(`    ${proxy.name}: ${cmd}`);
    try {
      const start = Date.now();
      // Use stdio: 'inherit' so user can see and act on any auth prompts
      // (e.g. "Serve is not enabled on your tailnet. To enable, visit: ...")
      execSync(cmd, { stdio: 'inherit' });
      console.log(`    ${proxy.name}: ${proxy.url} -> localhost:${proxy.target} (${Date.now() - start}ms)`);
    } catch (err) {
      if (err.code === 'ETIMEDOUT') {
        console.error(`    ${proxy.name}: timed out after 30s`);
      } else {
        console.warn(`    ${proxy.name}: failed to configure (${err.message})`);
      }
    }
  }
}

function setEnvFromConfig(config) {
  process.env.VAPID_PUBLIC_KEY = config.vapidPublicKey;
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = config.vapidPublicKey;
  process.env.VAPID_PRIVATE_KEY = config.vapidPrivateKey;
  process.env.VAPID_SUBJECT = config.vapidSubject || 'mailto:agent-connect@localhost';
  process.env.APP_HOSTNAME = config.hostname;
  process.env.API_PORT = String(config.apiPort || 3109);
  process.env.API_URL = `https://${config.hostname}:${config.apiPort || 3109}`;
  process.env.NEXT_PUBLIC_API_URL = process.env.API_URL;
  process.env.AGENT_CONNECT_DATA_DIR = getDataDir();
  process.env.DISABLE_SSL = 'true';
  process.env.LISTEN_HOST = '127.0.0.1';
  process.env.API_HOST = '127.0.0.1';
  process.env.NODE_ENV = 'production';
  process.env.PORT = String(config.frontendPort || 3110);
  process.env.NEXT_APP_DIR = PACKAGE_ROOT;
}

function startServers() {
  if (!isSetupComplete()) {
    console.error('Setup not complete. Run: agent-connect setup');
    process.exit(1);
  }

  const config = loadConfig();

  // Auto-detect Tailscale hostname changes
  try {
    const statusJson = execSync('tailscale status --json', { stdio: 'pipe', timeout: 5000 }).toString();
    const status = JSON.parse(statusJson);
    const dnsName = status.Self?.DNSName;
    if (dnsName) {
      const currentHostname = dnsName.replace(/\.$/, '');
      if (currentHostname && currentHostname !== config.hostname) {
        console.log(`  Tailscale hostname changed: ${config.hostname} -> ${currentHostname}`);
        config.hostname = currentHostname;
        config.apiPort = config.apiPort || 3109;
        saveConfig(config);
      }
    }
  } catch {
    // Tailscale not available yet, will be handled by ensureTailscale
  }

  setEnvFromConfig(config);

  // Keep .env.local in sync with config on every startup
  generateEnvLocal(PACKAGE_ROOT);

  const hostname = config.hostname;
  const apiPort = config.apiPort || 3109;
  const frontendPort = config.frontendPort || 3110;

  console.log();
  console.log('  Agent Connect');
  console.log('  =============');
  console.log();

  // Ensure Tailscale is running and serve proxies are set up
  ensureTailscale(config);

  console.log();
  console.log(`  Frontend: https://${hostname}`);
  console.log(`  API:      https://${hostname}:${apiPort}`);
  console.log();

  // Fork API server
  const apiServer = fork(path.join(PACKAGE_ROOT, 'server.js'), [], {
    env: process.env,
    stdio: 'inherit',
  });

  apiServer.on('error', (err) => {
    console.error('API server error:', err.message);
  });

  // Start Next.js server inline
  const nextServer = fork(path.join(PACKAGE_ROOT, 'server-nextjs.js'), [], {
    env: process.env,
    stdio: 'inherit',
  });

  nextServer.on('error', (err) => {
    console.error('Next.js server error:', err.message);
  });

  // Graceful shutdown
  function shutdown(signal) {
    console.log(`\n  Received ${signal}. Shutting down...`);
    apiServer.kill('SIGTERM');
    nextServer.kill('SIGTERM');

    setTimeout(() => {
      apiServer.kill('SIGKILL');
      nextServer.kill('SIGKILL');
      process.exit(0);
    }, 5000);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Exit if either child dies
  apiServer.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`API server exited with code ${code}`);
      nextServer.kill('SIGTERM');
      process.exit(code);
    }
  });

  nextServer.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Next.js server exited with code ${code}`);
      apiServer.kill('SIGTERM');
      process.exit(code);
    }
  });
}

module.exports = { startServers };

if (require.main === module) {
  startServers();
}
