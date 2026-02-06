const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.agent-connect');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DATA_DIR = path.join(CONFIG_DIR, 'data');

function getConfigDir() {
  return CONFIG_DIR;
}

function getDataDir() {
  return DATA_DIR;
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function isSetupComplete() {
  const config = loadConfig();
  if (!config) return false;
  return !!(config.vapidPublicKey && config.vapidPrivateKey && config.hostname);
}

function generateEnvLocal(packageRoot) {
  const config = loadConfig();
  if (!config) return false;

  const hostname = config.hostname;
  const apiPort = config.apiPort || 3109;

  const lines = [
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${config.vapidPublicKey}`,
    `VAPID_PRIVATE_KEY=${config.vapidPrivateKey}`,
    `VAPID_SUBJECT=${config.vapidSubject || 'mailto:agent-connect@localhost'}`,
    '',
    `APP_HOSTNAME=${hostname}`,
    '',
    `NEXT_PUBLIC_API_URL=https://${hostname}:${apiPort}`,
    `API_PORT=${apiPort}`,
    `API_HOST=127.0.0.1`,
    '',
  ];

  const envPath = path.join(packageRoot, '.env.local');
  fs.writeFileSync(envPath, lines.join('\n'));
  return true;
}

module.exports = {
  getConfigDir,
  getDataDir,
  ensureConfigDir,
  ensureDataDir,
  loadConfig,
  saveConfig,
  isSetupComplete,
  generateEnvLocal,
  CONFIG_DIR,
  CONFIG_FILE,
  DATA_DIR,
};
