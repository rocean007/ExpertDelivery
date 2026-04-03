import { NextRequest, NextResponse } from 'next/server';
import { generateSignature } from '@/lib/signing';

export const runtime = 'nodejs';

type SignResponse = {
  success: boolean;
  data?: {
    timestamp: string;
    signature: string;
  };
  error?: string;
  timestamp: string;
};

function response(payload: Omit<SignResponse, 'timestamp'>, status = 200): NextResponse<SignResponse> {
  return NextResponse.json({ ...payload, timestamp: new Date().toISOString() }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse<SignResponse>> {
  const secret = process.env.HMAC_SECRET;
  if (!secret) {
    return response({ success: false, error: 'HMAC_SECRET is not configured' }, 500);
  }

  let body: { payload?: string };
  try {
    body = (await req.json()) as { payload?: string };
  } catch {
    return response({ success: false, error: 'Invalid JSON body' }, 400);
  }

  if (typeof body.payload !== 'string') {
    return response({ success: false, error: 'payload must be a string' }, 400);
  }

  const reqTimestamp = String(Math.floor(Date.now() / 1000));
  const signature = await generateSignature(body.payload, secret);

  return response({
    success: true,
    data: {
      timestamp: reqTimestamp,
      signature,
    },
  });
}
