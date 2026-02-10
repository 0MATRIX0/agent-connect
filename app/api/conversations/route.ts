import { NextRequest, NextResponse } from 'next/server';
import { getApiServer, apiHeaders } from '../_helpers';

const API_SERVER = getApiServer();

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const res = await fetch(`${API_SERVER}/api/conversations`, {
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
