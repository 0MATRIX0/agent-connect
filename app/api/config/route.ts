import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

function loadConfigJson(): Record<string, string> {
  try {
    const configPath = path.join(os.homedir(), '.agent-connect', 'config.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

export async function GET() {
  const config = loadConfigJson();

  return NextResponse.json({
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || config.vapidPublicKey || '',
    apiUrl: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || '',
  });
}
