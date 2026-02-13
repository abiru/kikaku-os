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
