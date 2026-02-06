// Standalone API server for Agent Notifier
// Runs on port 3109 (backend API)
// The Next.js frontend runs separately on port 3110

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const os = require('os');

const crypto = require('crypto');

const PORT = process.env.API_PORT || 3109;
const DATA_DIR = process.env.AGENT_CONNECT_DATA_DIR || path.join(os.homedir(), '.agent-connect', 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// In-memory map of messageId -> Set<Response> for SSE wait connections
const sseWaiters = new Map();

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
    console.log(`VAPID subject: ${subject}`);
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

// Read messages
function getMessages() {
    ensureDataDir();
    try {
        const data = fs.readFileSync(MESSAGES_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// Write messages
function saveMessages(messages) {
    ensureDataDir();
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

// Create a new message
function createMessage({ type = 'notification', title = 'Agent Connect', body, notificationType = 'completed', options, allowCustom = true, timeoutSeconds }) {
    const now = new Date();
    const message = {
        id: crypto.randomUUID(),
        type,
        status: type === 'question' ? 'pending' : 'responded',
        title,
        body,
        notificationType,
        createdAt: now.toISOString(),
    };
    if (type === 'question') {
        message.options = options || [];
        message.allowCustom = allowCustom;
        if (timeoutSeconds) {
            message.expiresAt = new Date(now.getTime() + timeoutSeconds * 1000).toISOString();
        }
    }
    const messages = getMessages();
    messages.push(message);
    saveMessages(messages);
    return message;
}

// Get a message by ID
function getMessageById(id) {
    const messages = getMessages();
    return messages.find(m => m.id === id) || null;
}

// Respond to a message
function respondToMessage(id, value, source = 'app') {
    const messages = getMessages();
    const message = messages.find(m => m.id === id);
    if (!message) return { error: 'not_found' };
    if (message.status === 'responded') return { error: 'already_responded', message };
    message.status = 'responded';
    message.response = {
        value,
        respondedAt: new Date().toISOString(),
        source,
    };
    saveMessages(messages);

    // Notify SSE waiters
    const waiters = sseWaiters.get(id);
    if (waiters) {
        for (const waiterRes of waiters) {
            try {
                waiterRes.write(`event: response\ndata: ${JSON.stringify({ value, source, respondedAt: message.response.respondedAt })}\n\n`);
                waiterRes.end();
            } catch {}
        }
        sseWaiters.delete(id);
    }

    return { success: true, message };
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

            // Also create a message record for the inbox
            const msg = createMessage({
                type: 'notification',
                title: payload.title,
                body: payload.body,
                notificationType: payload.type || 'completed',
            });

            const subscriptions = getSubscriptions();

            if (subscriptions.length === 0) {
                return sendJson(res, 200, { success: true, message: 'No subscriptions to notify', sent: 0, messageId: msg.id });
            }

            const invalidEndpoints = [];
            let sentCount = 0;

            const notificationPayload = JSON.stringify({
                title: payload.title,
                body: payload.body,
                icon: payload.icon || '/icon-192.png',
                type: payload.type || 'completed',
                messageId: msg.id,
                data: { messageId: msg.id, ...payload.data || {} },
            });

            const pushOptions = {
                urgency: 'high',
                TTL: 86400,
            };

            await Promise.all(
                subscriptions.map(async (subscription) => {
                    const isApple = subscription.endpoint.includes('web.push.apple.com');
                    const endpointType = isApple ? 'Apple' : 'FCM/Other';
                    try {
                        const result = await webpush.sendNotification(subscription, notificationPayload, pushOptions);
                        sentCount++;
                        if (isApple) {
                            console.log(`[${endpointType}] Push sent successfully (status: ${result.statusCode})`);
                        }
                    } catch (error) {
                        // Log full details for Apple errors to diagnose 403s
                        if (isApple) {
                            console.error(`[Apple] Push failed (${error.statusCode}):`, {
                                body: error.body,
                                headers: error.headers,
                                endpoint: subscription.endpoint,
                                message: error.message,
                            });
                        }

                        if (error.statusCode === 404 || error.statusCode === 410) {
                            // Definitively expired — safe to remove
                            console.warn(`[${endpointType}] Subscription expired (${error.statusCode}), removing`);
                            invalidEndpoints.push(subscription.endpoint);
                        } else if (error.statusCode === 403) {
                            // 403 = forbidden/auth issue — keep subscription for debugging
                            console.warn(`[${endpointType}] Push rejected (403) — keeping subscription for diagnosis`);
                        } else if (!isApple) {
                            // Non-Apple errors not already logged above
                            console.error(`[${endpointType}] Failed to send notification:`, {
                                statusCode: error.statusCode,
                                body: error.body,
                                endpoint: subscription.endpoint.substring(0, 80) + '...',
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
                messageId: msg.id,
            });
        }

        // Create message (notification or question) + send push
        if (pathname === '/api/messages' && req.method === 'POST') {
            const payload = await parseBody(req);
            if (!payload.body) {
                return sendJson(res, 400, { error: 'body is required' });
            }
            const message = createMessage({
                type: payload.type || 'notification',
                title: payload.title || 'Agent Connect',
                body: payload.body,
                notificationType: payload.notificationType || 'completed',
                options: payload.options,
                allowCustom: payload.allowCustom !== false,
                timeoutSeconds: payload.timeout,
            });

            // Send push notification
            const subscriptions = getSubscriptions();
            if (subscriptions.length > 0) {
                const pushPayload = JSON.stringify({
                    title: message.title,
                    body: message.body,
                    icon: '/icon-192.png',
                    type: message.notificationType,
                    messageType: message.type,
                    messageId: message.id,
                    options: message.options,
                    data: { messageId: message.id },
                });
                const pushOptions = { urgency: 'high', TTL: 86400 };
                const invalidEndpoints = [];

                await Promise.all(
                    subscriptions.map(async (subscription) => {
                        try {
                            await webpush.sendNotification(subscription, pushPayload, pushOptions);
                        } catch (error) {
                            if (error.statusCode === 404 || error.statusCode === 410) {
                                invalidEndpoints.push(subscription.endpoint);
                            } else {
                                console.error('Push error:', error.statusCode, error.message);
                            }
                        }
                    })
                );

                if (invalidEndpoints.length > 0) {
                    const cleaned = subscriptions.filter(sub => !invalidEndpoints.includes(sub.endpoint));
                    saveSubscriptions(cleaned);
                }
            }

            return sendJson(res, 201, message);
        }

        // List messages
        if (pathname === '/api/messages' && req.method === 'GET') {
            const limit = parseInt(url.searchParams.get('limit') || '50', 10);
            const offset = parseInt(url.searchParams.get('offset') || '0', 10);
            const statusFilter = url.searchParams.get('status') || '';
            const typeFilter = url.searchParams.get('type') || '';

            let messages = getMessages();
            if (statusFilter) messages = messages.filter(m => m.status === statusFilter);
            if (typeFilter) messages = messages.filter(m => m.type === typeFilter);

            // Newest first
            messages.reverse();
            const total = messages.length;
            messages = messages.slice(offset, offset + limit);

            return sendJson(res, 200, { messages, total, limit, offset });
        }

        // Get specific message
        const messageMatch = pathname.match(/^\/api\/messages\/([^/]+)$/);
        if (messageMatch && req.method === 'GET') {
            const message = getMessageById(messageMatch[1]);
            if (!message) return sendJson(res, 404, { error: 'Message not found' });
            return sendJson(res, 200, message);
        }

        // Respond to a message
        const respondMatch = pathname.match(/^\/api\/messages\/([^/]+)\/respond$/);
        if (respondMatch && req.method === 'POST') {
            const payload = await parseBody(req);
            if (!payload.value) {
                return sendJson(res, 400, { error: 'value is required' });
            }
            const result = respondToMessage(respondMatch[1], payload.value, payload.source || 'app');
            if (result.error === 'not_found') return sendJson(res, 404, { error: 'Message not found' });
            if (result.error === 'already_responded') return sendJson(res, 409, { error: 'Already responded', message: result.message });
            return sendJson(res, 200, result.message);
        }

        // SSE wait for response (CLI blocks here)
        const waitMatch = pathname.match(/^\/api\/messages\/([^/]+)\/wait$/);
        if (waitMatch && req.method === 'GET') {
            const messageId = waitMatch[1];
            const message = getMessageById(messageId);
            if (!message) return sendJson(res, 404, { error: 'Message not found' });

            // If already responded, return immediately
            if (message.status === 'responded') {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*',
                });
                res.write(`event: response\ndata: ${JSON.stringify(message.response)}\n\n`);
                res.end();
                return;
            }

            // Set up SSE stream
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
            });
            res.write(`event: connected\ndata: ${JSON.stringify({ messageId })}\n\n`);

            // Register waiter
            if (!sseWaiters.has(messageId)) {
                sseWaiters.set(messageId, new Set());
            }
            sseWaiters.get(messageId).add(res);

            // Heartbeat every 30s
            const heartbeat = setInterval(() => {
                try { res.write(`:heartbeat\n\n`); } catch { clearInterval(heartbeat); }
            }, 30000);

            // Clean up on disconnect
            req.on('close', () => {
                clearInterval(heartbeat);
                const waiters = sseWaiters.get(messageId);
                if (waiters) {
                    waiters.delete(res);
                    if (waiters.size === 0) sseWaiters.delete(messageId);
                }
            });
            return;
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
    console.log(`  POST ${protocol}://${displayHost}:${PORT}/api/messages`);
    console.log(`  GET  ${protocol}://${displayHost}:${PORT}/api/messages`);
    console.log(`  GET  ${protocol}://${displayHost}:${PORT}/api/messages/:id`);
    console.log(`  POST ${protocol}://${displayHost}:${PORT}/api/messages/:id/respond`);
    console.log(`  GET  ${protocol}://${displayHost}:${PORT}/api/messages/:id/wait (SSE)`);
    console.log(`  GET  ${protocol}://${displayHost}:${PORT}/api/health`);
    console.log(`\nExample notification:`);
    console.log(`  curl ${useHttps ? '-k ' : ''}-X POST ${protocol}://${displayHost}:${PORT}/api/notify \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"title": "Claude Code", "body": "Task completed!", "type": "completed"}'`);
});
