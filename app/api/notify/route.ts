import { NextRequest, NextResponse } from 'next/server';
import { getApiServer, getAuthHeaders, apiHeaders } from '../_helpers';

const API_SERVER = getApiServer();

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const res = await fetch(`${API_SERVER}/api/notify`, {
      method: 'POST',
      headers: apiHeaders('application/json'),
      body,
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const queryString = request.nextUrl.searchParams.toString();
    const res = await fetch(`${API_SERVER}/api/notify?${queryString}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }
}
