import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../env';
import { rateLimit } from '../../middleware/rateLimit';

describe('rateLimit middleware', () => {
  const createApp = (max: number, windowSeconds: number) => {
    const app = new Hono<Env>();
    app.use('*', rateLimit({ max, windowSeconds, prefix: 'test' }));
    app.get('/test', (c) => c.json({ ok: true }));
    return app;
  };

  it('includes X-RateLimit-Limit header on first request', async () => {
    const app = createApp(10, 60);
    const headers = { 'x-forwarded-for': '10.0.0.1' };
    const res = await app.request('/test', { headers });
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
  });

  it('includes X-RateLimit-Remaining header on first request', async () => {
    const app = createApp(10, 60);
    const headers = { 'x-forwarded-for': '10.0.0.2' };
    const res = await app.request('/test', { headers });
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
  });

  it('includes X-RateLimit-Reset header on successful requests', async () => {
    const app = createApp(10, 60);
    const headers = { 'x-forwarded-for': '10.0.0.3' };
    const res = await app.request('/test', { headers });
    const reset = res.headers.get('X-RateLimit-Reset');
    expect(reset).toBeTruthy();
    // Reset should be a Unix timestamp in the future
    const resetTime = Number(reset);
    expect(resetTime).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('decrements remaining count on subsequent requests', async () => {
    const app = createApp(10, 60);
    // Use unique IP header per test to avoid cross-test pollution
    const headers = { 'x-forwarded-for': '10.0.0.50' };
    const res1 = await app.request('/test', { headers });
    expect(res1.headers.get('X-RateLimit-Remaining')).toBe('9');
    const res2 = await app.request('/test', { headers });
    expect(res2.headers.get('X-RateLimit-Remaining')).toBe('8');
  });

  it('returns 429 when limit is exceeded', async () => {
    const app = createApp(2, 60);
    const headers = { 'x-forwarded-for': '10.0.0.99' };
    await app.request('/test', { headers });
    await app.request('/test', { headers });
    const res = await app.request('/test', { headers });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.message).toBe('Too many requests');
  });

  it('includes Retry-After header on 429 response', async () => {
    const app = createApp(1, 60);
    const headers = { 'x-forwarded-for': '10.0.0.100' };
    await app.request('/test', { headers });
    const res = await app.request('/test', { headers });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('skips rate limiting for OPTIONS requests', async () => {
    const app = createApp(1, 60);
    const headers = { 'x-forwarded-for': '10.0.0.101' };
    // Exhaust the limit
    await app.request('/test', { headers });
    // OPTIONS should still pass
    const res = await app.request('/test', { method: 'OPTIONS', headers });
    expect(res.status).not.toBe(429);
  });

  it('skips rate limiting for health check', async () => {
    const app = new Hono<Env>();
    app.use('*', rateLimit({ max: 1, windowSeconds: 60, prefix: 'health-test' }));
    app.get('/health', (c) => c.json({ ok: true }));
    app.get('/test', (c) => c.json({ ok: true }));

    const headers = { 'x-forwarded-for': '10.0.0.102' };
    // Exhaust the limit
    await app.request('/test', { headers });
    // Health check should still pass
    const res = await app.request('/health', { headers });
    expect(res.status).toBe(200);
  });
});
