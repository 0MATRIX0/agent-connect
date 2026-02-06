const { fork, execSync } = require('child_process');
const path = require('path');
const { loadConfig, getDataDir, isSetupComplete } = require('./config');

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
  try {
    execSync(`tailscale serve --bg --https 443 http://localhost:${frontendPort}`, { stdio: 'pipe' });
    console.log(`  Tailscale Serve: https://${hostname} -> localhost:${frontendPort}`);
  } catch (err) {
    console.warn(`  Tailscale Serve: frontend proxy may already be active (${err.message})`);
  }
  try {
    execSync(`tailscale serve --bg --https ${apiPort} http://localhost:${apiPort}`, { stdio: 'pipe' });
    console.log(`  Tailscale Serve: https://${hostname}:${apiPort} -> localhost:${apiPort}`);
  } catch (err) {
    console.warn(`  Tailscale Serve: API proxy may already be active (${err.message})`);
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
  setEnvFromConfig(config);

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
