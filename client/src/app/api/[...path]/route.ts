import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://136.109.58.88:3000';
// Chain-related endpoints (escrow funding verification, condition resolution) can take >10s on slow RPCs.
const PROXY_TIMEOUT_MS = 25000;
const RETRY_DELAY_MS = 250;

export const runtime = 'nodejs';
export const preferredRegion = ['iad1'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function forwardWithRetry(url: string, init: RequestInit, attempts: number = 2): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error: unknown) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(RETRY_DELAY_MS);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Backend request failed');
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = `${BACKEND_URL}/${path.join('/')}${request.nextUrl.search}`;
  const authHeader = request.headers.get('authorization');
  const headers: HeadersInit = authHeader ? { Authorization: authHeader } : {};
  try {
    const res = await forwardWithRetry(url, { headers });
    const body = await res.text();
    const contentType = res.headers.get('content-type') || 'application/json';
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (error: unknown) {
    console.error('API proxy GET failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = `${BACKEND_URL}/${path.join('/')}${request.nextUrl.search}`;
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
    const res = await forwardWithRetry(url, {
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
  } catch (error: unknown) {
    console.error('API proxy POST failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 });
  }
}
