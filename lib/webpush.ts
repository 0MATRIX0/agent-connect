import webpush from 'web-push';

const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationPayload {
  title: string;
  body: string;
  type?: 'completed' | 'input_needed' | 'error';
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

export async function sendNotification(
  subscription: PushSubscription,
  payload: NotificationPayload
): Promise<void> {
  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    type: payload.type || 'completed',
    data: payload.data || {},
  });

  await webpush.sendNotification(subscription, notificationPayload);
}

export { webpush };
