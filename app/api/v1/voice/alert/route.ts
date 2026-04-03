import { NextRequest, NextResponse } from 'next/server';
import { generateSpeechStream } from '@/lib/elevenlabs';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { text: string; voiceId?: string };
  try {
    body = (await req.json()) as { text: string; voiceId?: string };
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON', timestamp: new Date().toISOString() },
      { status: 400 }
    );
  }

  if (!body.text || body.text.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: 'text is required', timestamp: new Date().toISOString() },
      { status: 400 }
    );
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'Voice service not configured', timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }

  try {
    const stream = await generateSpeechStream(body.text.slice(0, 500), body.voiceId);
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Voice generation failed';
    console.error('[Voice] ElevenLabs error:', msg);
    return NextResponse.json(
      { success: false, error: msg, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
