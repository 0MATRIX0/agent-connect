import { NextResponse } from 'next/server';

const API_SERVER = process.env.API_SERVER_URL || 'http://localhost:3109';

export async function GET() {
  try {
    const res = await fetch(`${API_SERVER}/api/notifications`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }
}

export async function DELETE() {
  try {
    const res = await fetch(`${API_SERVER}/api/notifications`, {
      method: 'DELETE',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }
}
