// Standalone API server for Agent Notifier
// Runs on port 3109 (backend API)
// The Next.js frontend runs separately on port 3110

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const { WebSocketServer } = require('ws');

const os = require('os');

const projects = require('./lib/server/projects');
const sessionManager = require('./lib/server/sessions');
const notifications = require('./lib/server/notifications');
const worktree = require('./lib/server/worktree');

const crypto = require('crypto');

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

// Load API token from config
let apiToken = process.env.API_TOKEN || '';
if (!apiToken) {
    try {
        const configPath = path.join(os.homedir(), '.agent-connect', 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.apiToken) apiToken = config.apiToken;
    } catch {}
}

// Authentication
function authenticateRequest(req) {
    if (!apiToken) return true; // No token configured, skip auth
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(apiToken));
    }
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const queryToken = url.searchParams.get('token');
    if (queryToken) {
        try {
            return crypto.timingSafeEqual(Buffer.from(queryToken), Buffer.from(apiToken));
        } catch {
            return false;
        }
    }
    return false;
}

// Rate limiter (in-memory)
const rateLimits = new Map(); // IP -> { count, resetTime }
function checkRateLimit(ip, maxRequests, windowMs = 60000) {
    const now = Date.now();
    const entry = rateLimits.get(ip);
    if (!entry || now > entry.resetTime) {
        rateLimits.set(ip, { count: 1, resetTime: now + windowMs });
        return true;
    }
    entry.count++;
    return entry.count <= maxRequests;
}

// Clean up rate limits periodically
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimits) {
        if (now > entry.resetTime) rateLimits.delete(ip);
    }
}, 60000);

// CORS allowed origins
function getAllowedOrigins() {
    const origins = ['http://localhost:3110', 'http://127.0.0.1:3110'];
    const hostname = process.env.APP_HOSTNAME;
    if (hostname) {
        origins.push(`https://${hostname}`);
        origins.push(`https://${hostname}:3110`);
    }
    return origins;
}

function getCorsOrigin(req) {
    if (!apiToken) return '*'; // No auth configured, allow all (backward compat)
    const origin = req.headers['origin'];
    const allowed = getAllowedOrigins();
    if (origin && allowed.includes(origin)) return origin;
    return allowed[0]; // Default to first allowed origin
}

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

// Parse JSON body (max 100KB default, configurable)
const MAX_BODY_SIZE = 100 * 1024;
const MAX_CONVERSATION_BODY_SIZE = 5 * 1024 * 1024; // 5MB for conversations
async function parseBody(req, maxSize = MAX_BODY_SIZE) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > maxSize) {
                req.destroy();
                reject(new Error('Request body too large'));
                return;
            }
            body += chunk;
        });
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
function sendJson(res, status, data, req) {
    const corsOrigin = req ? getCorsOrigin(req) : '*';
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(JSON.stringify(data));
}

// Request handler
async function handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        const corsOrigin = getCorsOrigin(req);
        res.writeHead(204, {
            'Access-Control-Allow-Origin': corsOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        });
        res.end();
        return;
    }

    // Auth: skip for health endpoint
    if (pathname !== '/api/health' && pathname !== '/health') {
        if (!authenticateRequest(req)) {
            return sendJson(res, 401, { error: 'Unauthorized' }, req);
        }
    }

    // Rate limiting
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    try {
        // Subscribe endpoint
        if (pathname === '/api/subscribe' && req.method === 'POST') {
            if (!checkRateLimit(clientIp, 10)) {
                return sendJson(res, 429, { error: 'Too many requests' }, req);
            }
            const subscription = await parseBody(req);

            if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
                return sendJson(res, 400, { error: 'Invalid subscription object' }, req);
            }

            // Validate endpoint is a valid URL
            try { new URL(subscription.endpoint); } catch {
                return sendJson(res, 400, { error: 'Invalid subscription endpoint URL' }, req);
            }

            const subscriptions = getSubscriptions();
            const exists = subscriptions.some(sub => sub.endpoint === subscription.endpoint);

            if (!exists) {
                subscriptions.push(subscription);
                saveSubscriptions(subscriptions);
            }

            return sendJson(res, 200, { success: true, message: 'Subscribed successfully' }, req);
        }

        // Unsubscribe endpoint
        if (pathname === '/api/unsubscribe' && req.method === 'POST') {
            const { endpoint } = await parseBody(req);

            if (!endpoint) {
                return sendJson(res, 400, { error: 'Endpoint is required' }, req);
            }

            const subscriptions = getSubscriptions();
            const filtered = subscriptions.filter(sub => sub.endpoint !== endpoint);

            if (filtered.length !== subscriptions.length) {
                saveSubscriptions(filtered);
                return sendJson(res, 200, { success: true, message: 'Unsubscribed successfully' }, req);
            }

            return sendJson(res, 404, { error: 'Subscription not found' }, req);
        }

        // Notify endpoint
        if (pathname === '/api/notify' && (req.method === 'POST' || req.method === 'GET')) {
            if (!checkRateLimit(clientIp, 30)) {
                return sendJson(res, 429, { error: 'Too many requests' }, req);
            }

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
                return sendJson(res, 400, { error: 'Title and body are required' }, req);
            }

            // Validate notification type
            const knownTypes = ['completed', 'task_done', 'planning_complete', 'approval_needed', 'input_needed', 'command_execution', 'error'];
            const notifType = knownTypes.includes(payload.type) ? payload.type : 'completed';

            // Persist notification before sending push
            notifications.addNotification({
                title: payload.title,
                body: payload.body,
                type: notifType,
                icon: payload.icon,
                data: payload.data,
            });

            // Skip push notification if user is actively on the app (has WebSocket connections)
            if (sessionManager.hasActiveClients()) {
                return sendJson(res, 200, { success: true, message: 'User is active, push suppressed', sent: 0, suppressed: true }, req);
            }

            const subscriptions = getSubscriptions();

            if (subscriptions.length === 0) {
                return sendJson(res, 200, { success: true, message: 'No subscriptions to notify', sent: 0 }, req);
            }

            const invalidEndpoints = [];
            let sentCount = 0;

            const notificationPayload = JSON.stringify({
                title: payload.title,
                body: payload.body,
                icon: payload.icon || '/icon-192.png',
                type: notifType,
                data: payload.data || {},
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
            }, req);
        }

        // Health check
        if (pathname === '/api/health' || pathname === '/health') {
            return sendJson(res, 200, { status: 'ok', subscriptions: getSubscriptions().length }, req);
        }

        // --- Project endpoints ---

        // List all projects
        if (pathname === '/api/projects' && req.method === 'GET') {
            return sendJson(res, 200, projects.getProjects(), req);
        }

        // Add a project
        if (pathname === '/api/projects' && req.method === 'POST') {
            const { name, path: projectPath } = await parseBody(req);
            try {
                const project = projects.addProject(name, projectPath);
                return sendJson(res, 201, project, req);
            } catch (error) {
                return sendJson(res, 400, { error: error.message }, req);
            }
        }

        // Reorder projects
        if (pathname === '/api/projects/reorder' && req.method === 'PUT') {
            const { ids } = await parseBody(req);
            try {
                const reordered = projects.reorderProjects(ids);
                return sendJson(res, 200, reordered, req);
            } catch (error) {
                return sendJson(res, 400, { error: error.message }, req);
            }
        }

        // List worktrees for a project
        const projectWorktreeMatch = pathname.match(/^\/api\/projects\/([^/]+)\/worktrees$/);
        if (projectWorktreeMatch && req.method === 'GET') {
            const project = projects.getProject(projectWorktreeMatch[1]);
            if (!project) {
                return sendJson(res, 404, { error: 'Project not found' }, req);
            }
            if (!worktree.isGitRepo(project.path)) {
                return sendJson(res, 200, [], req);
            }
            try {
                const worktrees = worktree.listWorktrees(project.path);
                return sendJson(res, 200, worktrees, req);
            } catch (error) {
                return sendJson(res, 500, { error: error.message }, req);
            }
        }

        // Update a project
        const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
        if (projectMatch && req.method === 'PUT') {
            const { name, path: projectPath } = await parseBody(req);
            try {
                const updated = projects.updateProject(projectMatch[1], { name, path: projectPath });
                return sendJson(res, 200, updated, req);
            } catch (error) {
                const status = error.message === 'Project not found' ? 404 : 400;
                return sendJson(res, status, { error: error.message }, req);
            }
        }

        // Delete a project
        if (projectMatch && req.method === 'DELETE') {
            try {
                const removed = projects.removeProject(projectMatch[1]);
                return sendJson(res, 200, { success: true, project: removed }, req);
            } catch (error) {
                return sendJson(res, 404, { error: error.message }, req);
            }
        }

        // --- Session endpoints ---

        // List sessions (optional ?projectId=, ?status=, ?limit=, ?offset= filters)
        if (pathname === '/api/sessions' && req.method === 'GET') {
            const projectId = url.searchParams.get('projectId') || undefined;
            const status = url.searchParams.get('status') || undefined;
            const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')) : undefined;
            const offset = url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')) : undefined;
            return sendJson(res, 200, sessionManager.getAllSessions({ projectId, status, limit, offset }), req);
        }

        // Launch a session
        if (pathname === '/api/sessions' && req.method === 'POST') {
            const { projectId, branch, useWorktree, worktreePath } = await parseBody(req);
            if (!projectId || typeof projectId !== 'string') {
                return sendJson(res, 400, { error: 'projectId is required and must be a string' }, req);
            }
            const project = projects.getProject(projectId);
            if (!project) {
                return sendJson(res, 404, { error: 'Project not found' }, req);
            }
            try {
                const opts = {};
                if (branch && typeof branch === 'string') opts.branch = branch;
                if (useWorktree === true) opts.useWorktree = true;
                if (worktreePath && typeof worktreePath === 'string') opts.worktreePath = worktreePath;
                const session = sessionManager.createSession(project.id, project.name, project.path, opts);
                return sendJson(res, 201, session, req);
            } catch (error) {
                return sendJson(res, 500, { error: error.message }, req);
            }
        }

        // Get a single session
        const sessionGetMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
        if (sessionGetMatch && req.method === 'GET') {
            const session = sessionManager.getSession(sessionGetMatch[1]);
            if (!session) {
                return sendJson(res, 404, { error: 'Session not found' }, req);
            }
            return sendJson(res, 200, session, req);
        }

        // Get session stats (PID, RSS, CPU)
        const sessionStatsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/stats$/);
        if (sessionStatsMatch && req.method === 'GET') {
            const session = sessionManager.getRawSession(sessionStatsMatch[1]);
            if (!session || session.status !== 'running') {
                return sendJson(res, 404, { error: 'Session not found or not running' }, req);
            }
            try {
                const pid = session.pid;
                const fs = require('fs');
                let rss = 0;
                let cpu = 0;
                try {
                    const statusContent = fs.readFileSync(`/proc/${pid}/status`, 'utf-8');
                    const rssMatch = statusContent.match(/VmRSS:\s+(\d+)\s+kB/);
                    if (rssMatch) rss = parseInt(rssMatch[1]) * 1024; // bytes
                    const statContent = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
                    const fields = statContent.split(' ');
                    const utime = parseInt(fields[13]) || 0;
                    const stime = parseInt(fields[14]) || 0;
                    cpu = utime + stime;
                } catch {
                    // /proc not available (non-Linux)
                }
                const uptime = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
                return sendJson(res, 200, { pid, rss, cpu, uptime }, req);
            } catch (error) {
                return sendJson(res, 500, { error: error.message }, req);
            }
        }

        // Update session activity status (used by hook scripts)
        const sessionStatusMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/status$/);
        if (sessionStatusMatch && req.method === 'PUT') {
            const { activityStatus } = await parseBody(req);
            if (!activityStatus || typeof activityStatus !== 'string') {
                return sendJson(res, 400, { error: 'activityStatus string is required' }, req);
            }
            const updated = sessionManager.updateSessionStatus(sessionStatusMatch[1], activityStatus);
            if (!updated) {
                return sendJson(res, 404, { error: 'Session not found or not in memory' }, req);
            }
            return sendJson(res, 200, updated, req);
        }

        // Get session output (last N lines, or full scrollback with ?full=true)
        const sessionOutputMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/output$/);
        if (sessionOutputMatch && req.method === 'GET') {
            const sessionId = sessionOutputMatch[1];
            const full = url.searchParams.get('full') === 'true';

            // Try in-memory first, then DB
            const rawSession = sessionManager.getRawSession(sessionId);
            let allText;
            if (rawSession) {
                allText = (rawSession.scrollback || []).join('');
            } else {
                // Fallback to DB for historical sessions
                allText = sessionManager.getSessionScrollback(sessionId);
                if (!allText && allText !== '') {
                    return sendJson(res, 404, { error: 'Session not found' }, req);
                }
            }

            // Return full raw scrollback (for terminal replay)
            if (full) {
                return sendJson(res, 200, { scrollback: allText }, req);
            }

            // Strip ANSI escape codes for clean line output
            const lineCount = parseInt(url.searchParams.get('lines') || '5');
            const cleanText = allText.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
            const allLines = cleanText.split('\n').filter(l => l.trim().length > 0);
            const lastLines = allLines.slice(-lineCount);
            return sendJson(res, 200, { lines: lastLines }, req);
        }

        // Kill a session
        const sessionDeleteMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
        if (sessionDeleteMatch && req.method === 'DELETE') {
            try {
                const session = sessionManager.killSession(sessionDeleteMatch[1]);
                return sendJson(res, 200, { success: true, session }, req);
            } catch (error) {
                return sendJson(res, 404, { error: error.message }, req);
            }
        }

        // Restore a session (create new session in same project)
        const sessionRestoreMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/restore$/);
        if (sessionRestoreMatch && req.method === 'POST') {
            const oldSessionId = sessionRestoreMatch[1];
            const oldSession = sessionManager.getSession(oldSessionId);
            if (!oldSession) {
                return sendJson(res, 404, { error: 'Session not found' }, req);
            }
            // Verify the project still exists
            const project = projects.getProject(oldSession.projectId);
            if (!project) {
                return sendJson(res, 404, { error: 'Original project no longer exists' }, req);
            }
            try {
                const newSession = sessionManager.createSession(project.id, project.name, project.path);
                return sendJson(res, 201, {
                    newSession,
                    oldSessionId,
                }, req);
            } catch (error) {
                return sendJson(res, 500, { error: error.message }, req);
            }
        }

        // Freeze a session (preserve across server restarts)
        const sessionFreezeMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/freeze$/);
        if (sessionFreezeMatch && req.method === 'POST') {
            try {
                const session = sessionManager.freezeSession(sessionFreezeMatch[1]);
                return sendJson(res, 200, { success: true, session }, req);
            } catch (error) {
                const status = error.message.includes('not found') ? 404 : 400;
                return sendJson(res, status, { error: error.message }, req);
            }
        }

        // Unfreeze a session (resume after server restart)
        const sessionUnfreezeMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/unfreeze$/);
        if (sessionUnfreezeMatch && req.method === 'POST') {
            try {
                const session = sessionManager.unfreezeSession(sessionUnfreezeMatch[1]);
                return sendJson(res, 200, { success: true, session }, req);
            } catch (error) {
                const status = error.message.includes('not found') ? 404 : 400;
                return sendJson(res, status, { error: error.message }, req);
            }
        }

        // Get worktree info for a session
        const sessionWorktreeMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/worktree$/);
        if (sessionWorktreeMatch && req.method === 'GET') {
            const info = sessionManager.getSessionWorktreeInfo(sessionWorktreeMatch[1]);
            if (!info) {
                return sendJson(res, 404, { error: 'Session not found' }, req);
            }
            return sendJson(res, 200, info, req);
        }

        // Clean up worktree for a stopped/frozen session
        if (sessionWorktreeMatch && req.method === 'DELETE') {
            try {
                const result = sessionManager.cleanupSessionWorktree(sessionWorktreeMatch[1]);
                return sendJson(res, 200, { success: true, session: result }, req);
            } catch (error) {
                const status = error.message.includes('not found') ? 404 : 400;
                return sendJson(res, status, { error: error.message }, req);
            }
        }

        // --- Conversation endpoints ---

        // Save a conversation transcript
        if (pathname === '/api/conversations' && req.method === 'POST') {
            const { projectPath, transcript } = await parseBody(req, MAX_CONVERSATION_BODY_SIZE);
            if (!projectPath || !transcript) {
                return sendJson(res, 400, { error: 'projectPath and transcript are required' }, req);
            }
            try {
                const session = sessionManager.saveConversation({ projectPath, transcript });
                return sendJson(res, 201, session, req);
            } catch (error) {
                return sendJson(res, 500, { error: error.message }, req);
            }
        }

        // Get conversation transcript
        const transcriptMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/transcript$/);
        if (transcriptMatch && req.method === 'GET') {
            const transcript = sessionManager.getTranscript(transcriptMatch[1]);
            if (transcript === null) {
                return sendJson(res, 404, { error: 'Transcript not found' }, req);
            }
            return sendJson(res, 200, { transcript }, req);
        }

        // --- Notification history endpoints ---

        // List notifications
        if (pathname === '/api/notifications' && req.method === 'GET') {
            return sendJson(res, 200, notifications.getNotifications(), req);
        }

        // Clear all notifications
        if (pathname === '/api/notifications' && req.method === 'DELETE') {
            notifications.clearNotifications();
            return sendJson(res, 200, { success: true, message: 'All notifications cleared' }, req);
        }

        // Delete a single notification
        const notificationMatch = pathname.match(/^\/api\/notifications\/([^/]+)$/);
        if (notificationMatch && req.method === 'DELETE') {
            try {
                const removed = notifications.deleteNotification(notificationMatch[1]);
                return sendJson(res, 200, { success: true, notification: removed }, req);
            } catch (error) {
                return sendJson(res, 404, { error: error.message }, req);
            }
        }

        // 404
        sendJson(res, 404, { error: 'Not found' }, req);

    } catch (error) {
        console.error('Request error:', error);
        sendJson(res, 500, { error: error.message || 'Internal server error' }, req);
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

// Initialize session persistence (DB + recovery)
sessionManager.initSessions();
sessionManager.purgeOldSessions(30);

const displayHost = process.env.APP_HOSTNAME || HOST;

// WebSocket server for terminal sessions (noServer mode — shares HTTP server)
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });

server.on('upgrade', (request, socket, head) => {
    socket.on('error', (err) => {
        console.error('[ws] Socket error during upgrade:', err.message);
    });

    const url = new URL(request.url, `http://localhost:${PORT}`);
    const wsMatch = url.pathname.match(/^\/ws\/sessions\/([^/]+)$/);

    if (!wsMatch) {
        socket.destroy();
        return;
    }

    // Authenticate WebSocket upgrade
    if (apiToken) {
        const queryToken = url.searchParams.get('token');
        if (!queryToken) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        try {
            if (!crypto.timingSafeEqual(Buffer.from(queryToken), Buffer.from(apiToken))) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
        } catch {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
    }

    const sessionId = wsMatch[1];
    const session = sessionManager.getRawSession(sessionId);

    if (!session) {
        socket.destroy();
        return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
        ws.on('error', (err) => {
            console.error(`[ws] Client error for session ${sessionId}:`, err.message);
        });

        // Attach client to session
        sessionManager.attachClient(sessionId, ws);

        // Ping/pong keepalive
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        // Forward client input to PTY
        ws.on('message', (message) => {
            try {
                const parsed = JSON.parse(message.toString());
                if (parsed.type === 'input') {
                    sessionManager.writeToSession(sessionId, parsed.data);
                } else if (parsed.type === 'resize') {
                    sessionManager.resizeSession(sessionId, parsed.cols, parsed.rows);
                } else if (parsed.type === 'ping') {
                    if (ws.readyState === 1) {
                        ws.send(JSON.stringify({ type: 'pong' }));
                    }
                }
            } catch {
                // Raw text fallback
                sessionManager.writeToSession(sessionId, message.toString());
            }
        });

        // Detach on close
        ws.on('close', () => {
            sessionManager.detachClient(sessionId, ws);
        });
    });
});

// Ping interval for all WebSocket clients (30s)
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// Graceful shutdown
function shutdown() {
    console.log('\nShutting down (tmux sessions will be frozen and survive)...');
    clearInterval(pingInterval);
    sessionManager.cleanupAllSessions();
    wss.close();
    server.close(() => {
        process.exit(0);
    });
    // Force exit after 5 seconds
    setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Safety net: catch unhandled errors to prevent server crashes
process.on('uncaughtException', (err) => {
    console.error('[fatal] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[fatal] Unhandled rejection:', reason);
});

server.listen(PORT, HOST, () => {
    console.log(`Agent Notifier API server running on ${protocol}://${HOST}:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST ${protocol}://${displayHost}:${PORT}/api/subscribe`);
    console.log(`  POST ${protocol}://${displayHost}:${PORT}/api/unsubscribe`);
    console.log(`  POST ${protocol}://${displayHost}:${PORT}/api/notify`);
    console.log(`  GET  ${protocol}://${displayHost}:${PORT}/api/health`);
    console.log(`  GET  ${protocol}://${displayHost}:${PORT}/api/projects`);
    console.log(`  POST ${protocol}://${displayHost}:${PORT}/api/projects`);
    console.log(`  GET  ${protocol}://${displayHost}:${PORT}/api/sessions`);
    console.log(`  POST ${protocol}://${displayHost}:${PORT}/api/sessions`);
    console.log(`  GET  ${protocol}://${displayHost}:${PORT}/api/notifications`);
    console.log(`  DEL  ${protocol}://${displayHost}:${PORT}/api/notifications`);
    console.log(`  DEL  ${protocol}://${displayHost}:${PORT}/api/notifications/:id`);
    console.log(`  POST ${protocol}://${displayHost}:${PORT}/api/sessions/:id/restore`);
    console.log(`  WS   ws://${displayHost}:${PORT}/ws/sessions/:id`);
    console.log(`\nExample notification:`);
    console.log(`  curl ${useHttps ? '-k ' : ''}-X POST ${protocol}://${displayHost}:${PORT}/api/notify \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"title": "Claude Code", "body": "Task completed!", "type": "completed"}'`);
});
