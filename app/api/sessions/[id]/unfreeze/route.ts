import { NextRequest, NextResponse } from 'next/server';
import { getApiServer, getAuthHeaders } from '../../../_helpers';

const API_SERVER = getApiServer();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(`${API_SERVER}/api/sessions/${params.id}/unfreeze`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }
}
