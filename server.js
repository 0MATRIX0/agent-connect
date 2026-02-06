// Standalone API server for Agent Notifier
// Runs on port 3109 (backend API)
// The Next.js frontend runs separately on port 3110

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const os = require('os');

const PORT = process.env.API_PORT || 3109;
const DATA_DIR = process.env.AGENT_CONNECT_DATA_DIR || path.join(os.homedir(), '.agent-connect', 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');

// Load config from .env.local first (source of truth for VAPID keys used by browser),
// then ~/.agent-connect/config.json as fallback for non-env settings
function loadConfig() {
  let hasEnvLocal = false;

  // Try .env.local first — this is the source of truth for VAPID keys
  // since the Next.js frontend serves these to the browser
  try {
    const envPath = path.join(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = process.env[key.trim()] || valueParts.join('=').trim();
      }
    });
    hasEnvLocal = true;
  } catch {
    // .env.local not found, will try config.json
  }

  // Load ~/.agent-connect/config.json as fallback (fills in any gaps)
  try {
    const configPath = path.join(os.homedir(), '.agent-connect', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // Warn if VAPID keys differ between .env.local and config.json
    const envPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
    if (hasEnvLocal && config.vapidPublicKey && envPublicKey && config.vapidPublicKey !== envPublicKey) {
      console.warn('Warning: VAPID public key in config.json differs from .env.local');
      console.warn('  .env.local key will be used (source of truth for browser subscriptions)');
    }

    if (config.vapidPublicKey) process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || config.vapidPublicKey;
    if (config.vapidPublicKey) process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || config.vapidPublicKey;
    if (config.vapidPrivateKey) process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || config.vapidPrivateKey;
    if (config.vapidSubject) process.env.VAPID_SUBJECT = process.env.VAPID_SUBJECT || config.vapidSubject;
    if (config.hostname) process.env.APP_HOSTNAME = process.env.APP_HOSTNAME || config.hostname;
    if (config.apiPort) process.env.API_PORT = process.env.API_PORT || String(config.apiPort);
    return true;
  } catch {
    if (!hasEnvLocal) {
      console.warn('Warning: No config found. Run: agent-connect setup');
      return false;
    }
  }

  return hasEnvLocal;
}

loadConfig();

// Configure web-push
const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  console.log(`VAPID public key: ${publicKey.substring(0, 20)}...`);
} else {
  console.error('VAPID keys not configured! Run: npm run generate-vapid-keys');
}

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Read subscriptions
function getSubscriptions() {
  ensureDataDir();
  try {
    const data = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Write subscriptions
function saveSubscriptions(subscriptions) {
  ensureDataDir();
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
}

// Parse JSON body
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Send JSON response
function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

// Request handler
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    // Subscribe endpoint
    if (pathname === '/api/subscribe' && req.method === 'POST') {
      const subscription = await parseBody(req);

      if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return sendJson(res, 400, { error: 'Invalid subscription object' });
      }

      const subscriptions = getSubscriptions();
      const exists = subscriptions.some(sub => sub.endpoint === subscription.endpoint);

      if (!exists) {
        subscriptions.push(subscription);
        saveSubscriptions(subscriptions);
      }

      return sendJson(res, 200, { success: true, message: 'Subscribed successfully' });
    }

    // Unsubscribe endpoint
    if (pathname === '/api/unsubscribe' && req.method === 'POST') {
      const { endpoint } = await parseBody(req);

      if (!endpoint) {
        return sendJson(res, 400, { error: 'Endpoint is required' });
      }

      const subscriptions = getSubscriptions();
      const filtered = subscriptions.filter(sub => sub.endpoint !== endpoint);

      if (filtered.length !== subscriptions.length) {
        saveSubscriptions(filtered);
        return sendJson(res, 200, { success: true, message: 'Unsubscribed successfully' });
      }

      return sendJson(res, 404, { error: 'Subscription not found' });
    }

    // Notify endpoint
    if (pathname === '/api/notify' && (req.method === 'POST' || req.method === 'GET')) {
      let payload;

      if (req.method === 'GET') {
        payload = {
          title: url.searchParams.get('title') || 'Agent Notifier',
          body: url.searchParams.get('body') || 'Test notification',
          type: url.searchParams.get('type') || 'completed',
        };
      } else {
        payload = await parseBody(req);
      }

      if (!payload.title || !payload.body) {
        return sendJson(res, 400, { error: 'Title and body are required' });
      }

      const subscriptions = getSubscriptions();

      if (subscriptions.length === 0) {
        return sendJson(res, 200, { success: true, message: 'No subscriptions to notify', sent: 0 });
      }

      const invalidEndpoints = [];
      let sentCount = 0;

      const notificationPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icon-192.png',
        badge: payload.badge || '/icon-192.png',
        type: payload.type || 'completed',
        data: payload.data || {},
      });

      const pushOptions = {
        urgency: 'high',
        TTL: 60,
      };

      await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            await webpush.sendNotification(subscription, notificationPayload, pushOptions);
            sentCount++;
          } catch (error) {
            if (error.statusCode === 404 || error.statusCode === 410) {
              invalidEndpoints.push(subscription.endpoint);
            } else {
              console.error('Failed to send notification:', {
                statusCode: error.statusCode,
                body: error.body,
                endpoint: subscription.endpoint,
                message: error.message,
              });
            }
          }
        })
      );

      // Clean up invalid subscriptions
      if (invalidEndpoints.length > 0) {
        const cleaned = subscriptions.filter(sub => !invalidEndpoints.includes(sub.endpoint));
        saveSubscriptions(cleaned);
      }

      return sendJson(res, 200, {
        success: true,
        message: `Notification sent to ${sentCount} subscriber(s)`,
        sent: sentCount,
        cleaned: invalidEndpoints.length,
      });
    }

    // Health check
    if (pathname === '/api/health' || pathname === '/health') {
      return sendJson(res, 200, { status: 'ok', subscriptions: getSubscriptions().length });
    }

    // 404
    sendJson(res, 404, { error: 'Not found' });

  } catch (error) {
    console.error('Request error:', error);
    sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
}

// Create and start server
const HOST = process.env.API_HOST || '0.0.0.0';
const CERTS_DIR = path.join(__dirname, 'certs');

// Check if SSL certificates exist (can be disabled with DISABLE_SSL=true)
const useHttps = process.env.DISABLE_SSL !== 'true' &&
                 fs.existsSync(path.join(CERTS_DIR, 'server.key')) &&
                 fs.existsSync(path.join(CERTS_DIR, 'server.crt'));

let server;
let protocol;

if (useHttps) {
  const sslOptions = {
    key: fs.readFileSync(path.join(CERTS_DIR, 'server.key')),
    cert: fs.readFileSync(path.join(CERTS_DIR, 'server.crt')),
  };
  server = https.createServer(sslOptions, handleRequest);
  protocol = 'https';
} else {
  console.warn('Running in HTTP mode (use Tailscale Serve or a reverse proxy for HTTPS).\n');
  server = http.createServer(handleRequest);
  protocol = 'http';
}

const displayHost = process.env.APP_HOSTNAME || HOST;

server.listen(PORT, HOST, () => {
  console.log(`Agent Notifier API server running on ${protocol}://${HOST}:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST ${protocol}://${displayHost}:${PORT}/api/subscribe`);
  console.log(`  POST ${protocol}://${displayHost}:${PORT}/api/unsubscribe`);
  console.log(`  POST ${protocol}://${displayHost}:${PORT}/api/notify`);
  console.log(`  GET  ${protocol}://${displayHost}:${PORT}/api/health`);
  console.log(`\nExample notification:`);
  console.log(`  curl ${useHttps ? '-k ' : ''}-X POST ${protocol}://${displayHost}:${PORT}/api/notify \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"title": "Claude Code", "body": "Task completed!", "type": "completed"}'`);
});
