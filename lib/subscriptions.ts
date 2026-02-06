import { promises as fs } from 'fs';
import path from 'path';
import { PushSubscription } from './webpush';

const DATA_DIR = path.join(process.cwd(), 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

export async function getSubscriptions(): Promise<PushSubscription[]> {
  await ensureDataDir();

  try {
    const data = await fs.readFile(SUBSCRIPTIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function addSubscription(subscription: PushSubscription): Promise<void> {
  const subscriptions = await getSubscriptions();

  // Check if subscription already exists (by endpoint)
  const exists = subscriptions.some(sub => sub.endpoint === subscription.endpoint);

  if (!exists) {
    subscriptions.push(subscription);
    await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
  }
}

export async function removeSubscription(endpoint: string): Promise<boolean> {
  const subscriptions = await getSubscriptions();
  const initialLength = subscriptions.length;

  const filtered = subscriptions.filter(sub => sub.endpoint !== endpoint);

  if (filtered.length !== initialLength) {
    await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(filtered, null, 2));
    return true;
  }

  return false;
}

export async function clearInvalidSubscriptions(invalidEndpoints: string[]): Promise<void> {
  const subscriptions = await getSubscriptions();
  const filtered = subscriptions.filter(sub => !invalidEndpoints.includes(sub.endpoint));
  await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(filtered, null, 2));
}
