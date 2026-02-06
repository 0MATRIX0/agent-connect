const { fork, execSync } = require('child_process');
const path = require('path');
const { loadConfig, saveConfig, getDataDir, isSetupComplete, generateEnvLocal, findAvailablePort } = require('./config');
const ui = require('./ui');

const PACKAGE_ROOT = path.resolve(__dirname, '..');

function ensureTailscale(config, runtimePorts) {
  const hostname = config.hostname;
  const configApiPort = config.apiPort || 3109;
  const apiPort = runtimePorts?.apiPort || configApiPort;
  const frontendPort = runtimePorts?.frontendPort || config.frontendPort || 3110;

  // Check if tailscaled is running
  try {
    execSync('tailscale status', { stdio: 'pipe' });
    ui.printStatus('Tailscale', 'running');
  } catch {
    ui.printWarning('Tailscale', 'starting tailscaled...');
    try {
      execSync('sudo systemctl start tailscaled', { stdio: 'inherit' });
      // Wait briefly for it to connect
      execSync('tailscale status --json', { stdio: 'pipe', timeout: 10000 });
      ui.printStatus('Tailscale', 'started');
    } catch (err) {
      ui.printError('Tailscale: failed to start tailscaled');
      ui.printError('Run manually: sudo systemctl start tailscaled');
      process.exit(1);
    }
  }

  // Set up tailscale serve proxies
  ui.printSection('Tailscale Serve');

  // Parse existing serve config via JSON for reliable proxy target detection
  let serveConfig = null;
  try {
    const serveJson = execSync('tailscale serve status --json', { stdio: 'pipe', timeout: 5000 }).toString();
    serveConfig = JSON.parse(serveJson);
  } catch {
    // No serve config or JSON parsing failed, will configure from scratch
  }

  function getExistingProxy(cfg, host, externalPort) {
    if (!cfg) return null;
    // Tailscale serve status JSON structure: { TCP/Web: { "hostname:port": { Handlers: { "/": { Proxy: "http://..." } } } } }
    const key = externalPort === 443 ? `https://${host}:443` : `https://${host}:${externalPort}`;
    // Try multiple possible key formats
    const keys = [
      key,
      externalPort === 443 ? `https://${host}` : null,
      `${host}:${externalPort}`,
      `${host}`,
    ].filter(Boolean);

    const web = cfg.Web || {};
    for (const k of keys) {
      if (web[k]?.Handlers?.['/']?.Proxy) {
        return web[k].Handlers['/'].Proxy;
      }
    }
    return null;
  }

  const proxyConfigs = [
    { name: 'Frontend', externalPort: 443, https: '443', target: frontendPort, url: `https://${hostname}` },
    { name: 'API',      externalPort: configApiPort, https: String(configApiPort), target: apiPort, url: `https://${hostname}:${configApiPort}` },
  ];

  for (const proxy of proxyConfigs) {
    const expectedTarget = `http://127.0.0.1:${proxy.target}`;
    const existingTarget = getExistingProxy(serveConfig, hostname, proxy.externalPort);

    if (existingTarget) {
      // Check if existing target already points to the right port
      const existingPort = existingTarget.match(/:(\d+)$/)?.[1];
      if (existingPort === String(proxy.target)) {
        ui.printStatus(proxy.name, `${proxy.url} → localhost:${proxy.target}`);
        continue;
      }
      // Target is wrong, remove old proxy first
      ui.printWarning(proxy.name, `updating proxy (${existingTarget} → ${expectedTarget})`);
      try {
        execSync(`tailscale serve --https ${proxy.https} off`, { stdio: 'pipe', timeout: 10000 });
      } catch {
        ui.printWarning(proxy.name, 'failed to remove old proxy, will try to overwrite');
      }
    }

    const cmd = `tailscale serve --bg --https ${proxy.https} http://localhost:${proxy.target}`;
    try {
      const start = Date.now();
      execSync(cmd, { stdio: 'pipe' });
      ui.printStatus(proxy.name, `${proxy.url} → localhost:${proxy.target} (${Date.now() - start}ms)`);
    } catch (err) {
      if (err.code === 'ETIMEDOUT') {
        ui.printError(`${proxy.name}: timed out after 30s`);
      } else {
        ui.printWarning(proxy.name, `failed to configure (${err.message})`);
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

async function startServers() {
  if (!isSetupComplete()) {
    ui.printError('Setup not complete. Run: agent-connect setup');
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
        ui.printWarning('Hostname changed', `${config.hostname} → ${currentHostname}`);
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

  // Resolve available ports (fallback if configured ports are busy)
  let actualApiPort = apiPort;
  let actualFrontendPort = frontendPort;

  try {
    const apiResult = await findAvailablePort(apiPort, '127.0.0.1');
    actualApiPort = apiResult.port;
    if (apiResult.changed) {
      ui.printWarning('Port conflict', `API port ${apiPort} in use, using ${actualApiPort}`);
    }

    const frontendResult = await findAvailablePort(frontendPort, '127.0.0.1');
    actualFrontendPort = frontendResult.port;

    // Ensure frontend doesn't collide with API port
    if (actualFrontendPort === actualApiPort) {
      const retryResult = await findAvailablePort(actualFrontendPort + 1, '127.0.0.1');
      actualFrontendPort = retryResult.port;
    }

    if (actualFrontendPort !== frontendPort) {
      ui.printWarning('Port conflict', `Frontend port ${frontendPort} in use, using ${actualFrontendPort}`);
    }

    // Update env vars with actual ports
    process.env.API_PORT = String(actualApiPort);
    process.env.PORT = String(actualFrontendPort);
  } catch (err) {
    ui.printError(`Fatal: ${err.message}`);
    process.exit(1);
  }

  ui.printBanner();

  // Ensure Tailscale is running and serve proxies are set up
  ensureTailscale(config, { apiPort: actualApiPort, frontendPort: actualFrontendPort });

  const internalInfo = {};
  if (actualFrontendPort !== frontendPort) internalInfo.frontend = actualFrontendPort;
  if (actualApiPort !== apiPort) internalInfo.api = actualApiPort;
  ui.printUrls(`https://${hostname}`, `https://${hostname}:${apiPort}`, internalInfo);

  // Fork API server
  const apiServer = fork(path.join(PACKAGE_ROOT, 'server.js'), [], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'inherit', 'ipc'],
  });

  apiServer.on('error', (err) => {
    console.error('API server error:', err.message);
  });

  // Start Next.js server inline
  const nextServer = fork(path.join(PACKAGE_ROOT, 'server-nextjs.js'), [], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'inherit', 'ipc'],
  });

  nextServer.on('error', (err) => {
    console.error('Next.js server error:', err.message);
  });

  ui.printReady();

  // Graceful shutdown
  function shutdown(signal) {
    ui.printShutdown(signal);
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
  startServers().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
