import { NextRequest, NextResponse } from 'next/server';

const API_SERVER = process.env.API_SERVER_URL || 'http://localhost:3109';

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path);
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path);
}

export async function OPTIONS(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(request, params.path);
}

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
  const path = pathSegments.join('/');
  const url = `${API_SERVER}/${path}`;

  const headers: HeadersInit = {};
  request.headers.forEach((value, key) => {
    if (key !== 'host') headers[key] = value;
  });

  const body = request.method !== 'GET' && request.method !== 'HEAD'
    ? await request.text()
    : undefined;

  const response = await fetch(url, {
    method: request.method,
    headers,
    body,
  });

  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    responseHeaders.set(key, value);
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
