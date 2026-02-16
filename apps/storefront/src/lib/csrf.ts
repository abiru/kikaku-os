/**
 * CSRF protection for Astro SSR forms.
 *
 * Uses double-submit cookie pattern:
 * - Generate random token, store in HttpOnly cookie
 * - Embed token as hidden form field
 * - On POST, compare cookie value to form field value
 */

const CSRF_COOKIE_NAME = '__csrf_ssr';
const CSRF_FORM_FIELD = '_csrf';

function generateToken(): string {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) {
      cookies[key] = rest.join('=');
    }
  }
  return cookies;
}

/**
 * Get or create a CSRF token for the current request.
 * Returns { token, setCookieHeader } where setCookieHeader is set
 * only when a new cookie needs to be created.
 */
export function getCsrfToken(request: Request): { token: string; cookieHeader: string | null } {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const existing = cookies[CSRF_COOKIE_NAME];

  if (existing) {
    return { token: existing, cookieHeader: null };
  }

  const token = generateToken();
  const isSecure = new URL(request.url).protocol === 'https:';
  const cookie = `${CSRF_COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${isSecure ? '; Secure' : ''}`;

  return { token, cookieHeader: cookie };
}

/**
 * Validate CSRF token from form data against cookie.
 * Returns true if valid.
 */
export function validateCsrfToken(request: Request, formData: FormData): boolean {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const cookieToken = cookies[CSRF_COOKIE_NAME] || '';
  const formToken = formData.get(CSRF_FORM_FIELD)?.toString() || '';

  if (!cookieToken || !formToken) return false;
  return constantTimeEqual(cookieToken, formToken);
}

/** The hidden form field name for CSRF token */
export const CSRF_FIELD_NAME = CSRF_FORM_FIELD;
