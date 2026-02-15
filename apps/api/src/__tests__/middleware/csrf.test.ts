import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../env';
import {
  csrfProtection,
  generateCsrfToken,
  validateCsrfToken,
  _clearTokenStore,
} from '../../middleware/csrf';

beforeEach(() => {
  _clearTokenStore();
});

describe('generateCsrfToken', () => {
  it('returns a UUID-format token', () => {
    const token = generateCsrfToken('test-session');
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('returns different tokens for different sessions', () => {
    const token1 = generateCsrfToken('session-1');
    const token2 = generateCsrfToken('session-2');
    expect(token1).not.toBe(token2);
  });
});

describe('validateCsrfToken', () => {
  it('validates a correct token', () => {
    const token = generateCsrfToken('session-a');
    expect(validateCsrfToken('session-a', token)).toBe(true);
  });

  it('rejects an incorrect token', () => {
    generateCsrfToken('session-b');
    expect(validateCsrfToken('session-b', 'wrong-token')).toBe(false);
  });

  it('rejects a token for unknown session', () => {
    expect(validateCsrfToken('unknown', 'any-token')).toBe(false);
  });

  it('consumes the token on successful validation (one-time use)', () => {
    const token = generateCsrfToken('session-c');
    expect(validateCsrfToken('session-c', token)).toBe(true);
    // Second use should fail
    expect(validateCsrfToken('session-c', token)).toBe(false);
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

  it('allows GET requests without CSRF token', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'GET' });
    expect(res.status).toBe(200);
  });

  it('allows OPTIONS requests without CSRF token', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'OPTIONS' });
    // OPTIONS may return 404 because no explicit OPTIONS handler, but CSRF middleware passes
    expect(res.status).not.toBe(403);
  });

  it('rejects POST without CSRF token', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = await res.json();
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

  it('rejects POST with invalid CSRF token', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'x-csrf-token': 'invalid-token' },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Invalid or expired CSRF token');
  });

  it('allows POST with valid CSRF token', async () => {
    const app = createApp();
    const sessionKey = 'csrf:unknown'; // default IP in test
    const token = generateCsrfToken(sessionKey);
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'x-csrf-token': token },
    });
    expect(res.status).toBe(200);
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
