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

module.exports = {
  getConfigDir,
  getDataDir,
  ensureConfigDir,
  ensureDataDir,
  loadConfig,
  saveConfig,
  isSetupComplete,
  CONFIG_DIR,
  CONFIG_FILE,
  DATA_DIR,
};
