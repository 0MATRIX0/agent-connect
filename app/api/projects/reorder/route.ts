import { NextRequest, NextResponse } from 'next/server';
import { getApiServer, apiHeaders } from '../../_helpers';

const API_SERVER = getApiServer();

export async function PUT(request: NextRequest) {
  try {
    const body = await request.text();
    const res = await fetch(`${API_SERVER}/api/projects/reorder`, {
      method: 'PUT',
      headers: apiHeaders('application/json'),
      body,
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }
}
