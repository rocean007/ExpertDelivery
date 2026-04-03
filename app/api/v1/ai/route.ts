import { NextRequest, NextResponse } from 'next/server';
import type { ApiResponse } from '@/types';

export const runtime = 'nodejs';

interface ModelTarget {
  id: string;
  label: string;
}

interface ModelAnswer {
  model: string;
  label: string;
  ok: boolean;
  answer?: string;
  error?: string;
  latencyMs: number;
}

interface AggregateAiResult {
  answer: string;
  promptPreview: string;
  modelAnswers: ModelAnswer[];
}

const MODEL_TARGETS: ModelTarget[] = [
  { id: 'openai-fast', label: 'OpenAI Fast' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'qwen-coder', label: 'Qwen Coder' },
];

function success<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() });
}

function failure(error: string, status = 400): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });
}

function parseTextPayload(raw: string): string {
  const text = raw.trim();
  if (!text) return '';

  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const json = JSON.parse(text) as
        | { text?: string; response?: string; output?: string }
        | Array<{ text?: string; response?: string; output?: string }>;

      if (Array.isArray(json)) {
        const joined = json
          .map((part) => part.text || part.response || part.output || '')
          .join(' ')
          .trim();
        if (joined) return joined;
      } else {
        const maybe = json.text || json.response || json.output || '';
        if (maybe.trim()) return maybe.trim();
      }
    } catch {
      // Fall back to plain text body.
    }
  }

  return text;
}

async function queryNoKeyModel(model: ModelTarget, prompt: string): Promise<ModelAnswer> {
  const startedAt = Date.now();

  try {
    const url = new URL(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
    url.searchParams.set('model', model.id);

    const res = await fetch(url, {
      headers: {
        Accept: 'text/plain, application/json',
      },
      signal: AbortSignal.timeout(22_000),
      cache: 'no-store',
    });

    if (!res.ok) {
      return {
        model: model.id,
        label: model.label,
        ok: false,
        error: `HTTP ${res.status}`,
        latencyMs: Date.now() - startedAt,
      };
    }

    const raw = await res.text();
    const parsed = parseTextPayload(raw).replace(/\s+/g, ' ').trim();

    if (!parsed) {
      return {
        model: model.id,
        label: model.label,
        ok: false,
        error: 'Empty response',
        latencyMs: Date.now() - startedAt,
      };
    }

    return {
      model: model.id,
      label: model.label,
      ok: true,
      answer: parsed,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      model: model.id,
      label: model.label,
      ok: false,
      error: err instanceof Error ? err.message : 'Request failed',
      latencyMs: Date.now() - startedAt,
    };
  }
}

function fallbackConsensus(modelAnswers: ModelAnswer[]): string {
  const okAnswers = modelAnswers.filter((m) => m.ok && m.answer).map((m) => m.answer as string);

  if (okAnswers.length === 0) {
    return 'No model returned a usable answer. Please try again in a few seconds.';
  }

  const snippets = okAnswers
    .map((ans) => ans.split(/(?<=[.!?])\s+/).find((s) => s.trim().length > 20) || ans)
    .slice(0, 3)
    .map((s) => s.trim());

  return snippets.join(' ').slice(0, 650);
}

async function buildConsensusWithModel(prompt: string, modelAnswers: ModelAnswer[]): Promise<string> {
  const okAnswers = modelAnswers.filter((m) => m.ok && m.answer);
  if (okAnswers.length === 0) {
    return fallbackConsensus(modelAnswers);
  }

  const synthesisPrompt = [
    'You are an expert route-ops summarizer.',
    'Given multiple model outputs for the same logistics prompt, return ONE concise final answer.',
    'Rules:',
    '- Keep it short (max 140 words).',
    '- Keep only practical actions and the biggest risk warnings.',
    '- No intro text, no bullet nesting, no markdown table.',
    '- If models disagree, prefer advice that is safer for driver operations.',
    '',
    'Original prompt:',
    prompt.slice(0, 8_000),
    '',
    'Model outputs:',
    ...okAnswers.map((item, idx) => `${idx + 1}. [${item.label}] ${item.answer}`),
  ].join('\n');

  const aggregate = await queryNoKeyModel({ id: 'openai-fast', label: 'OpenAI Fast (Synthesis)' }, synthesisPrompt);

  if (!aggregate.ok || !aggregate.answer) {
    return fallbackConsensus(modelAnswers);
  }

  return aggregate.answer.slice(0, 900).trim();
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<AggregateAiResult>>> {
  let body: { prompt?: string };

  try {
    body = (await req.json()) as { prompt?: string };
  } catch {
    return failure('Invalid JSON body');
  }

  const prompt = body.prompt?.trim();

  if (!prompt) {
    return failure('Prompt is required');
  }

  if (prompt.length > 14_000) {
    return failure('Prompt is too long (max 14,000 characters)');
  }

  const modelAnswers = await Promise.all(MODEL_TARGETS.map((model) => queryNoKeyModel(model, prompt)));
  const answer = await buildConsensusWithModel(prompt, modelAnswers);

  return success({
    answer,
    promptPreview: `${prompt.slice(0, 220)}${prompt.length > 220 ? '...' : ''}`,
    modelAnswers,
  });
}