import { NextRequest, NextResponse } from 'next/server';

const API_SERVER = process.env.API_SERVER_URL || 'http://localhost:3109';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const url = new URL(request.url);
    const lines = url.searchParams.get('lines') || '5';
    const res = await fetch(`${API_SERVER}/api/sessions/${params.id}/output?lines=${lines}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }
}
