import { NextRequest, NextResponse } from 'next/server';
import { verifySignature, verifyTimestamp } from '@/lib/signing';

const PROTECTED_PATHS = [
  '/api/v1/runs',
  '/api/v1/voice',
];

function isProtectedMethod(method: string): boolean {
  return ['POST', 'PATCH', 'DELETE', 'PUT'].includes(method.toUpperCase());
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // CORS headers for embed routes
  if (pathname.startsWith('/embed/') || pathname.startsWith('/api/v1/runs')) {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim());
    const origin = request.headers.get('origin') || '';

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Signature, X-Timestamp',
    };

    if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
    } else if (allowedOrigins.length === 0 || allowedOrigins[0] === '') {
      corsHeaders['Access-Control-Allow-Origin'] = '*';
    }

    if (method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: corsHeaders });
    }

    if (!isProtectedMethod(method) || !isProtectedPath(pathname)) {
      const response = NextResponse.next();
      for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value);
      }
      return response;
    }
  }

  // HMAC validation for state-changing API calls
  if (isProtectedMethod(method) && isProtectedPath(pathname)) {
    const secret = process.env.HMAC_SECRET;
    if (!secret) {
      console.error('[Middleware] HMAC_SECRET not configured');
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

    if (!verifySignature(body, signature, secret)) {
      return NextResponse.json(
        { success: false, error: 'Invalid signature', timestamp: new Date().toISOString() },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/v1/:path*', '/embed/:path*'],
};
