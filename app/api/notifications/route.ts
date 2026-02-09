import { NextResponse } from 'next/server';
import { getApiServer, getAuthHeaders } from '../_helpers';

const API_SERVER = getApiServer();

export async function GET() {
  try {
    const res = await fetch(`${API_SERVER}/api/notifications`, {
      headers: getAuthHeaders(),
    });
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
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }
}
