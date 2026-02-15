/**
 * Generate a cryptographically secure random token for public access.
 * Uses base62 encoding (alphanumeric) for URL-safe tokens.
 */
const BASE62_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const generatePublicToken = (length = 24): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => BASE62_CHARS[b % BASE62_CHARS.length]).join('');
};

/** Maximum token age in milliseconds (30 days) */
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Encode a string to base64url (URL-safe, no padding).
 */
const toBase64Url = (input: string): string =>
  btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

/**
 * Decode a base64url string back to its original form.
 */
const fromBase64Url = (input: string): string => {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
};

/**
 * Sign an email with HMAC-SHA256 for secure unsubscribe links.
 * Returns a token in format: base64url(email):base64url(timestamp):base64url(signature)
 * The signature covers both email and timestamp to prevent tampering.
 */
export async function signEmailToken(email: string, secret: string): Promise<string> {
  const timestamp = String(Date.now());
  const payload = `${email}:${timestamp}`;

  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    secretKey,
    encoder.encode(payload)
  );

  const emailB64 = toBase64Url(email);
  const timestampB64 = toBase64Url(timestamp);
  const sigB64 = toBase64Url(String.fromCharCode(...new Uint8Array(signature)));

  return `${emailB64}:${timestampB64}:${sigB64}`;
}

/**
 * Verify a signed email token and extract the email.
 * Returns the email if valid and not expired, null otherwise.
 * Tokens older than 30 days are rejected.
 */
export async function verifyEmailToken(token: string, secret: string): Promise<string | null> {
  try {
    const parts = token.split(':');
    if (parts.length !== 3) return null;

    const [emailB64, timestampB64, sigB64] = parts;
    if (!emailB64 || !timestampB64 || !sigB64) return null;

    const email = fromBase64Url(emailB64);
    const timestamp = fromBase64Url(timestampB64);
    const expectedSig = fromBase64Url(sigB64);

    // Check token expiry
    const tokenTime = Number(timestamp);
    if (Number.isNaN(tokenTime)) return null;

    const age = Date.now() - tokenTime;
    if (age > TOKEN_MAX_AGE_MS || age < 0) return null;

    // Verify signature over email + timestamp
    const payload = `${email}:${timestamp}`;
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const expectedSigBytes = new Uint8Array(
      Array.from(expectedSig).map((c) => c.charCodeAt(0))
    );

    const isValid = await crypto.subtle.verify(
      'HMAC',
      secretKey,
      expectedSigBytes,
      encoder.encode(payload)
    );

    return isValid ? email : null;
  } catch {
    return null;
  }
}
