const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.AGENT_CONNECT_DATA_DIR || path.join(os.homedir(), '.agent-connect', 'data');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
const MAX_NOTIFICATIONS = 500;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getNotifications() {
  ensureDataDir();
  try {
    const data = fs.readFileSync(NOTIFICATIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveNotifications(notifications) {
  ensureDataDir();
  fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
}

function addNotification({ title, body, type, icon, data }) {
  const notifications = getNotifications();

  const notification = {
    id: uuidv4(),
    title: title || 'Agent Connect',
    body: body || '',
    type: type || 'completed',
    icon: icon || '/icon-192.png',
    data: data || {},
    timestamp: new Date().toISOString(),
  };

  notifications.unshift(notification);

  // Trim to max size
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.length = MAX_NOTIFICATIONS;
  }

  saveNotifications(notifications);
  return notification;
}

function deleteNotification(id) {
  const notifications = getNotifications();
  const index = notifications.findIndex(n => n.id === id);
  if (index === -1) {
    throw new Error('Notification not found');
  }
  const removed = notifications.splice(index, 1)[0];
  saveNotifications(notifications);
  return removed;
}

function clearNotifications() {
  saveNotifications([]);
}

module.exports = {
  getNotifications,
  addNotification,
  deleteNotification,
  clearNotifications,
};
