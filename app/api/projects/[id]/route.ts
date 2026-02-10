import { NextRequest, NextResponse } from 'next/server';
import { getApiServer, getAuthHeaders } from '../../_helpers';

const API_SERVER = getApiServer();

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const res = await fetch(`${API_SERVER}/api/projects/${params.id}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(`${API_SERVER}/api/projects/${params.id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }
}
