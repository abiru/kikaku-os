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

/**
 * Sign an email with HMAC-SHA256 for secure unsubscribe links.
 * Returns a token in format: base64url(email):base64url(signature)
 */
export async function signEmailToken(email: string, secret: string): Promise<string> {
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
    encoder.encode(email)
  );

  // Use base64url encoding (URL-safe, no padding)
  const emailB64 = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${emailB64}:${sigB64}`;
}

/**
 * Verify a signed email token and extract the email.
 * Returns the email if valid, null if invalid or tampered.
 */
export async function verifyEmailToken(token: string, secret: string): Promise<string | null> {
  try {
    const [emailB64, sigB64] = token.split(':');
    if (!emailB64 || !sigB64) return null;

    // Decode base64url (restore padding if needed)
    const emailPadded = emailB64.replace(/-/g, '+').replace(/_/g, '/');
    const sigPadded = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    const email = atob(emailPadded + '='.repeat((4 - (emailPadded.length % 4)) % 4));
    const expectedSig = atob(sigPadded + '='.repeat((4 - (sigPadded.length % 4)) % 4));

    // Verify signature
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
      encoder.encode(email)
    );

    return isValid ? email : null;
  } catch (err) {
    console.error('Token verification failed:', err);
    return null;
  }
}
