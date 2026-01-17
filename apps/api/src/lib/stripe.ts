const encoder = new TextEncoder();

export const parseStripeSignature = (header: string | null) => {
  if (!header) return null;
  const parts = header.split(',').map((p) => p.trim());
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return null;
  return { timestamp, signatures };
};

const timingSafeEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
};

const hexToBytes = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

export const computeStripeSignature = async (payload: string, secret: string, timestamp: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = encoder.encode(`${timestamp}.${payload}`);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const bytes = new Uint8Array(signature);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
};

type VerifyOptions = {
  toleranceSeconds?: number;
  nowMs?: number;
};

export const verifyStripeSignature = async (
  payload: string,
  header: string | null,
  secret: string,
  opts: VerifyOptions = {}
) => {
  const parsed = parseStripeSignature(header);
  if (!parsed) return false;
  const timestampSeconds = Number(parsed.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const tolerance = opts.toleranceSeconds ?? 0;
  if (tolerance > 0) {
    const nowSeconds = Math.floor((opts.nowMs ?? Date.now()) / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > tolerance) return false;
  }
  const expected = await computeStripeSignature(payload, secret, parsed.timestamp);
  const expectedBytes = hexToBytes(expected);
  return parsed.signatures.some((sig) => timingSafeEqual(hexToBytes(sig), expectedBytes));
};
