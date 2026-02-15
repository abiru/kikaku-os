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
 * - Strict-Transport-Security: max-age=31536000; includeSubDomains
 * - Content-Security-Policy: varies by response type (JSON vs HTML)
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
      c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

      const contentType = c.res.headers.get('Content-Type') || '';
      const isHtml = contentType.includes('text/html');
      const csp = isHtml
        ? "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"
        : "default-src 'none'; frame-ancestors 'none'";
      c.res.headers.set('Content-Security-Policy', csp);
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

  it('sets Strict-Transport-Security with max-age and includeSubDomains', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('sets strict Content-Security-Policy for JSON responses', async () => {
    const app = createApp();
    const res = await app.request('/test');
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it('sets Content-Security-Policy with inline styles for HTML responses', async () => {
    const app = createApp();
    const res = await app.request('/html');
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBe("default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  });

  it('applies security headers to POST responses', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'POST' });
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-XSS-Protection')).toBe('0');
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('applies security headers to HTML responses', async () => {
    const app = createApp();
    const res = await app.request('/html');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
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
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    };

    for (const [header, value] of Object.entries(expectedHeaders)) {
      expect(res.headers.get(header)).toBe(value);
    }
  });
});
