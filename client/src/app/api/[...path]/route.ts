import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://136.109.58.88:3000';

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = `${BACKEND_URL}/${path.join('/')}${request.nextUrl.search}`;
  const authHeader = request.headers.get('authorization');
  const headers: HeadersInit = authHeader ? { Authorization: authHeader } : {};
  try {
    const res = await fetch(url, { headers });
    const body = await res.text();
    const contentType = res.headers.get('content-type') || 'application/json';
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = `${BACKEND_URL}/${path.join('/')}`;
  const authHeader = request.headers.get('authorization');
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (authHeader) headers.Authorization = authHeader;
  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const responseBody = await res.text();
    const contentType = res.headers.get('content-type') || 'application/json';
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 });
  }
}
