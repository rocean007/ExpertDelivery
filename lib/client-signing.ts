import { withBasePath } from '@/lib/base-path';

type SignApiResponse = {
  success: boolean;
  data?: {
    timestamp: string;
    signature: string;
  };
  error?: string;
};

export async function getSignedHeaders(payload: string): Promise<{ 'x-timestamp': string; 'x-signature': string }> {
  const res = await fetch(withBasePath('/api/v1/sign'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ payload }),
  });

  const json = (await res.json().catch(() => ({}))) as SignApiResponse;
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || 'Failed to sign request');
  }

  return {
    'x-timestamp': json.data.timestamp,
    'x-signature': json.data.signature,
  };
}
