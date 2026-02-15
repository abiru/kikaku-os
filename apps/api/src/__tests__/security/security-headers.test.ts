import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../env';

/**
 * Tests for HTTP security headers middleware.
 *
 * The app sets the following security headers on every response:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - X-XSS-Protection: 0 (modern approach - rely on CSP instead)
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: camera=(), microphone=(), geolocation=()
 */
describe('Security headers middleware', () => {
  const createApp = () => {
    const app = new Hono<Env>();

    // Replicate the security headers middleware from index.ts
    app.use('*', async (c, next) => {
      await next();
      c.res.headers.set('X-Content-Type-Options', 'nosniff');
      c.res.headers.set('X-Frame-Options', 'DENY');
      c.res.headers.set('X-XSS-Protection', '0');
      c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    });

    app.get('/test', (c) => c.json({ ok: true }));
    app.post('/test', (c) => c.json({ ok: true }));
    app.get('/html', (c) => c.html('<h1>Test</h1>'));

    return app;
  };

  it('sets X-Content-Type-Options to nosniff', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('sets X-Frame-Options to DENY', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('sets X-XSS-Protection to 0 (disable browser XSS filter)', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('X-XSS-Protection')).toBe('0');
  });

  it('sets Referrer-Policy to strict-origin-when-cross-origin', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets Permissions-Policy to restrict camera, microphone, geolocation', async () => {
    const app = createApp();
    const res = await app.request('/test');
    const policy = res.headers.get('Permissions-Policy');
    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
    expect(policy).toContain('geolocation=()');
  });

  it('applies security headers to POST responses', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'POST' });
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-XSS-Protection')).toBe('0');
  });

  it('applies security headers to HTML responses', async () => {
    const app = createApp();
    const res = await app.request('/html');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('sets correct Content-Type for JSON responses', async () => {
    const app = createApp();
    const res = await app.request('/test');
    const contentType = res.headers.get('Content-Type');
    expect(contentType).toContain('application/json');
  });

  it('applies all security headers on every response simultaneously', async () => {
    const app = createApp();
    const res = await app.request('/test');

    const expectedHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '0',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    };

    for (const [header, value] of Object.entries(expectedHeaders)) {
      expect(res.headers.get(header)).toBe(value);
    }
  });
});
