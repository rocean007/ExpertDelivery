import { NextRequest, NextResponse } from 'next/server';
import { verifySignature, verifyTimestamp } from '@/lib/signing';

const PROTECTED_PATHS = [
  '/api/v1/runs',
  '/api/v1/voice',
];

const DEFAULT_ALLOWED_ORIGIN = 'https://lighttest.vercel.app';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

function normalizePathname(pathname: string): string {
  if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
    const stripped = pathname.slice(BASE_PATH.length);
    return stripped.startsWith('/') ? stripped : `/${stripped}`;
  }
  return pathname;
}

function isProtectedMethod(method: string): boolean {
  return ['POST', 'PATCH', 'DELETE', 'PUT'].includes(method.toUpperCase());
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname.startsWith(p));
}

function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (fromEnv.length === 0) {
    return [DEFAULT_ALLOWED_ORIGIN];
  }

  if (!fromEnv.includes(DEFAULT_ALLOWED_ORIGIN)) {
    fromEnv.push(DEFAULT_ALLOWED_ORIGIN);
  }

  return fromEnv;
}

/**
 * Server must verify HMAC with the same secret used by the signing endpoint.
 * In production, set `HMAC_SECRET` explicitly.
 * In development only, we allow a fallback so local runs still work before env setup.
 */
function resolveHmacSecret(): string | undefined {
  if (process.env.HMAC_SECRET) {
    return process.env.HMAC_SECRET;
  }
  if (process.env.NODE_ENV === 'development') {
    return 'dev-secret';
  }
  return undefined;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const normalizedPathname = normalizePathname(pathname);
  const method = request.method;

  // CORS headers for embed routes
  if (normalizedPathname.startsWith('/embed/') || normalizedPathname.startsWith('/api/v1/runs')) {
    const allowedOrigins = getAllowedOrigins();
    const origin = request.headers.get('origin') || '';

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Signature, X-Timestamp',
    };

    if (allowedOrigins.includes(origin)) {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
    } else if (allowedOrigins.length === 0) {
      corsHeaders['Access-Control-Allow-Origin'] = '*';
    }

    if (method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: corsHeaders });
    }

    if (!isProtectedMethod(method) || !isProtectedPath(normalizedPathname)) {
      const response = NextResponse.next();
      for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value);
      }
      return response;
    }
  }

  // HMAC validation for state-changing API calls
  if (isProtectedMethod(method) && isProtectedPath(normalizedPathname)) {
    const secret = resolveHmacSecret();
    if (!secret) {
      console.error('[Middleware] HMAC_SECRET not configured (required in production)');
      return NextResponse.json(
        { success: false, error: 'Server misconfiguration', timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }

    const signature = request.headers.get('x-signature');
    const timestamp = request.headers.get('x-timestamp');

    if (!signature || !timestamp) {
      return NextResponse.json(
        { success: false, error: 'Missing authentication headers', timestamp: new Date().toISOString() },
        { status: 401 }
      );
    }

    if (!verifyTimestamp(timestamp)) {
      return NextResponse.json(
        { success: false, error: 'Request timestamp expired or invalid', timestamp: new Date().toISOString() },
        { status: 401 }
      );
    }

    // Clone and read body for signature verification
    const clonedRequest = request.clone();
    const body = await clonedRequest.text();

    if (!(await verifySignature(body, signature, secret))) {
      return NextResponse.json(
        { success: false, error: 'Invalid signature', timestamp: new Date().toISOString() },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/v1/:path*', '/embed/:path*', '/expertdelivery/api/v1/:path*', '/expertdelivery/embed/:path*'],
};
