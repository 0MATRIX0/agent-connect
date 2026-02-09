import { NextRequest, NextResponse } from 'next/server';
import { getApiServer, getAuthHeaders } from '../../../_helpers';

const API_SERVER = getApiServer();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const qs = new URLSearchParams();
    const lines = searchParams.get('lines');
    const full = searchParams.get('full');

    if (lines) qs.set('lines', lines);
    if (full) qs.set('full', full);

    const qsStr = qs.toString();
    const url = `${API_SERVER}/api/sessions/${params.id}/output${qsStr ? `?${qsStr}` : ''}`;
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }
}
