import { createHmac, timingSafeEqual } from 'crypto';

export function generateSignature(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

export function verifySignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expected = generateSignature(body, secret);
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(signature, 'hex');

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

export function verifyTimestamp(
  timestampHeader: string,
  toleranceSeconds = 300
): boolean {
  const ts = parseInt(timestampHeader, 10);
  if (isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= toleranceSeconds;
}
