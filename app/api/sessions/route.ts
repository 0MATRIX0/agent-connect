import { NextRequest, NextResponse } from 'next/server';
import { getApiServer, getAuthHeaders, apiHeaders } from '../_helpers';

const API_SERVER = getApiServer();

export async function GET(request: NextRequest) {
  try {
    const params = new URLSearchParams();
    const projectId = request.nextUrl.searchParams.get('projectId');
    const status = request.nextUrl.searchParams.get('status');
    const limit = request.nextUrl.searchParams.get('limit');
    const offset = request.nextUrl.searchParams.get('offset');

    if (projectId) params.set('projectId', projectId);
    if (status) params.set('status', status);
    if (limit) params.set('limit', limit);
    if (offset) params.set('offset', offset);

    const qs = params.toString();
    const url = `${API_SERVER}/api/sessions${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const res = await fetch(`${API_SERVER}/api/sessions`, {
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
