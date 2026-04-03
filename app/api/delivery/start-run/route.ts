import { NextRequest, NextResponse } from 'next/server';
import { generateSignature } from '@/lib/signing';

export const runtime = 'nodejs';
const DEFAULT_ALLOWED_ORIGIN = 'https://lighttest.vercel.app';

function resolveHmacSecret(): string | undefined {
  if (process.env.HMAC_SECRET) {
    return process.env.HMAC_SECRET;
  }

  if (process.env.NODE_ENV === 'development') {
    return 'dev-secret';
  }

  return undefined;
}

function buildCorsHeaders(request: NextRequest): Record<string, string> {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!allowedOrigins.includes(DEFAULT_ALLOWED_ORIGIN)) {
    allowedOrigins.push(DEFAULT_ALLOWED_ORIGIN);
  }
  const origin = request.headers.get('origin') || '';

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (allowedOrigins.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*';
  } else if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(req),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const corsHeaders = buildCorsHeaders(req);
  const secret = resolveHmacSecret();

  if (!secret) {
    return NextResponse.json(
      { success: false, error: 'HMAC_SECRET is not configured', timestamp: new Date().toISOString() },
      { status: 500, headers: corsHeaders }
    );
  }

  const rawBody = await req.text();
  if (!rawBody.trim()) {
    return NextResponse.json(
      { success: false, error: 'Request body is required', timestamp: new Date().toISOString() },
      { status: 400, headers: corsHeaders }
    );
  }

  const signature = await generateSignature(rawBody, secret);
  const timestamp = String(Math.floor(Date.now() / 1000));

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const target = `${req.nextUrl.origin}${basePath}/api/v1/runs`;

  const upstream = await fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': signature,
      'x-timestamp': timestamp,
    },
    body: rawBody,
    cache: 'no-store',
  });

  const responseText = await upstream.text();

  return new NextResponse(responseText, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      ...corsHeaders,
    },
  });
}