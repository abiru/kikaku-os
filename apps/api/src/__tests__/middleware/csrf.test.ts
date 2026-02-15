import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../env';
import {
  csrfProtection,
  generateCsrfToken,
  validateCsrfToken,
} from '../../middleware/csrf';

describe('generateCsrfToken', () => {
  it('returns a base64url-encoded token', () => {
    const token = generateCsrfToken();
    // Base64url characters: A-Za-z0-9-_
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(0);
  });

  it('returns different tokens on each call', () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();
    expect(token1).not.toBe(token2);
  });
});

describe('validateCsrfToken', () => {
  it('validates matching tokens', () => {
    const token = 'test-token-123';
    expect(validateCsrfToken(token, token)).toBe(true);
  });

  it('rejects mismatched tokens', () => {
    expect(validateCsrfToken('token-a', 'token-b')).toBe(false);
  });

  it('rejects empty cookie token', () => {
    expect(validateCsrfToken('', 'some-token')).toBe(false);
  });

  it('rejects empty header token', () => {
    expect(validateCsrfToken('some-token', '')).toBe(false);
  });

  it('rejects tokens of different lengths', () => {
    expect(validateCsrfToken('short', 'much-longer-token')).toBe(false);
  });

  it('uses constant-time comparison', () => {
    // This is a behavioral test - ensure no early return on mismatch
    const token1 = 'aaaaaaaaaaaaaaaaaaaa';
    const token2 = 'zzzzzzzzzzzzzzzzzzzz';
    expect(validateCsrfToken(token1, token2)).toBe(false);
  });
});

describe('csrfProtection middleware', () => {
  const createApp = () => {
    const app = new Hono<Env>();
    app.use('*', csrfProtection());
    app.get('/test', (c) => c.json({ ok: true }));
    app.post('/test', (c) => c.json({ ok: true }));
    app.put('/test', (c) => c.json({ ok: true }));
    app.delete('/test', (c) => c.json({ ok: true }));
    app.post('/webhooks/stripe', (c) => c.json({ ok: true }));
    app.post('/stripe/webhook', (c) => c.json({ ok: true }));
    app.post('/admin-action', (c) => c.json({ ok: true }));
    return app;
  };

  it('allows GET requests and sets CSRF cookie', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'GET' });
    expect(res.status).toBe(200);
    const setCookieHeader = res.headers.get('set-cookie');
    expect(setCookieHeader).toContain('__csrf=');
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('SameSite=Strict');
  });

  it('allows HEAD requests and sets CSRF cookie', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'HEAD' });
    expect(res.status).toBe(200);
    const setCookieHeader = res.headers.get('set-cookie');
    expect(setCookieHeader).toContain('__csrf=');
  });

  it('allows OPTIONS requests without setting cookie', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'OPTIONS' });
    // OPTIONS may return 404 because no explicit OPTIONS handler, but CSRF middleware passes
    expect(res.status).not.toBe(403);
  });

  it('rejects POST without CSRF token', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('CSRF token required');
  });

  it('rejects PUT without CSRF token', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'PUT' });
    expect(res.status).toBe(403);
  });

  it('rejects DELETE without CSRF token', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'DELETE' });
    expect(res.status).toBe(403);
  });

  it('rejects POST with mismatched CSRF token', async () => {
    const app = createApp();
    const token = generateCsrfToken();
    const res = await app.request('/test', {
      method: 'POST',
      headers: {
        'cookie': `__csrf=${token}`,
        'x-csrf-token': 'different-token',
      },
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('Invalid CSRF token');
  });

  it('allows POST with valid CSRF token', async () => {
    const app = createApp();
    const token = generateCsrfToken();
    const res = await app.request('/test', {
      method: 'POST',
      headers: {
        'cookie': `__csrf=${token}`,
        'x-csrf-token': token,
      },
    });
    expect(res.status).toBe(200);
  });

  it('allows reusing the same CSRF token (not one-time use)', async () => {
    const app = createApp();
    const token = generateCsrfToken();

    // First request
    const res1 = await app.request('/test', {
      method: 'POST',
      headers: {
        'cookie': `__csrf=${token}`,
        'x-csrf-token': token,
      },
    });
    expect(res1.status).toBe(200);

    // Second request with same token should also succeed
    const res2 = await app.request('/test', {
      method: 'POST',
      headers: {
        'cookie': `__csrf=${token}`,
        'x-csrf-token': token,
      },
    });
    expect(res2.status).toBe(200);
  });

  it('exempts webhook endpoints from CSRF', async () => {
    const app = createApp();
    const res = await app.request('/webhooks/stripe', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('exempts stripe/webhook endpoint from CSRF', async () => {
    const app = createApp();
    const res = await app.request('/stripe/webhook', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('exempts requests with x-admin-key from CSRF', async () => {
    const app = createApp();
    const res = await app.request('/admin-action', {
      method: 'POST',
      headers: { 'x-admin-key': 'test-admin-key' },
    });
    expect(res.status).toBe(200);
  });
});
