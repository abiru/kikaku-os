import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import newsletter from '../../../routes/storefront/newsletter';
import { signEmailToken } from '../../../lib/token';

const createMockDb = (options?: {
  existingSubscriber?: { id: number; status: string } | null;
}) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  return {
    calls,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ sql, bind: args });
        return {
          run: async () => ({ meta: { last_row_id: 1 } }),
          all: async () => ({ results: [] }),
          first: async () => {
            if (sql.includes('FROM newsletter_subscribers WHERE email')) {
              return options?.existingSubscriber ?? null;
            }
            return null;
          },
        };
      },
    }),
  };
};

const createEnv = (db = createMockDb(), overrides = {}) => ({
  DB: db,
  NEWSLETTER_SECRET: 'test-secret-key',
  ...overrides,
} as any);

describe('POST /store/newsletter/subscribe', () => {
  it('subscribes new email successfully', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/newsletter/subscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toBe('Subscribed successfully');
  });

  it('inserts into newsletter_subscribers', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const db = createMockDb();
    const env = createEnv(db);

    await app.request(
      'http://localhost/store/newsletter/subscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.com' }),
      },
      env
    );

    // First call: SELECT to check existing
    expect(db.calls[0].sql).toContain('newsletter_subscribers');
    expect(db.calls[0].bind).toEqual(['new@example.com']);

    // Second call: INSERT new subscriber
    expect(db.calls[1].sql).toContain('INSERT INTO newsletter_subscribers');
    expect(db.calls[1].bind).toEqual(['new@example.com']);
  });

  it('returns success for already active subscriber', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const db = createMockDb({ existingSubscriber: { id: 1, status: 'active' } });
    const env = createEnv(db);

    const res = await app.request(
      'http://localhost/store/newsletter/subscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'existing@example.com' }),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toBe('Already subscribed');
  });

  it('reactivates unsubscribed email', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const db = createMockDb({ existingSubscriber: { id: 5, status: 'unsubscribed' } });
    const env = createEnv(db);

    const res = await app.request(
      'http://localhost/store/newsletter/subscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'inactive@example.com' }),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toBe('Subscription reactivated');

    // Should update status to active
    expect(db.calls[1].sql).toContain('UPDATE newsletter_subscribers');
    expect(db.calls[1].bind).toEqual([5]);
  });

  it('rejects invalid email', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/newsletter/subscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      },
      env
    );

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.ok).toBe(false);
  });

  it('rejects missing email', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/newsletter/subscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
      env
    );

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.ok).toBe(false);
  });
});

describe('GET /store/newsletter/unsubscribe', () => {
  it('returns HTML confirmation page for valid token', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const db = createMockDb({ existingSubscriber: { id: 1, status: 'active' } });
    const env = createEnv(db);

    const token = await signEmailToken('test@example.com', 'test-secret-key');

    const res = await app.request(
      `http://localhost/store/newsletter/unsubscribe?token=${token}`,
      { method: 'GET' },
      env
    );

    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type');
    expect(contentType).toContain('text/html');

    const html = await res.text();
    expect(html).toContain('<form method="POST"');
    expect(html).toContain('type="hidden"');
    expect(html).toContain('Unsubscribe');
  });

  it('rejects invalid token', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/newsletter/unsubscribe?token=invalid-token',
      { method: 'GET' },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Invalid or expired unsubscribe link');
  });

  it('rejects missing token', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/newsletter/unsubscribe',
      { method: 'GET' },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it('returns 500 when secret is not configured', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const env = createEnv(createMockDb(), { NEWSLETTER_SECRET: undefined, ADMIN_API_KEY: undefined });

    const res = await app.request(
      'http://localhost/store/newsletter/unsubscribe?token=some-token',
      { method: 'GET' },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Service misconfigured');
  });
});

describe('POST /store/newsletter/unsubscribe', () => {
  it('unsubscribes with valid token', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const db = createMockDb({ existingSubscriber: { id: 1, status: 'active' } });
    const env = createEnv(db);

    const token = await signEmailToken('test@example.com', 'test-secret-key');

    const res = await app.request(
      'http://localhost/store/newsletter/unsubscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toBe('Successfully unsubscribed from newsletter');

    // Should update status to unsubscribed
    expect(db.calls[1].sql).toContain('UPDATE newsletter_subscribers');
    expect(db.calls[1].sql).toContain("status = 'unsubscribed'");
    expect(db.calls[1].bind).toEqual([1]);
  });

  it('rejects invalid token', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/newsletter/unsubscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: 'invalid-token' }),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Invalid or expired unsubscribe link');
  });

  it('rejects tampered token', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const env = createEnv();

    // Create valid token then tamper with it
    const token = await signEmailToken('test@example.com', 'test-secret-key');
    const tamperedToken = token.replace(/.$/, 'X'); // Change last char

    const res = await app.request(
      'http://localhost/store/newsletter/unsubscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tamperedToken }),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Invalid or expired unsubscribe link');
  });

  it('returns 404 for non-existent email', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const db = createMockDb({ existingSubscriber: null });
    const env = createEnv(db);

    const token = await signEmailToken('nonexistent@example.com', 'test-secret-key');

    const res = await app.request(
      'http://localhost/store/newsletter/unsubscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Email not found in newsletter list');
  });

  it('handles already unsubscribed email', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const db = createMockDb({ existingSubscriber: { id: 1, status: 'unsubscribed' } });
    const env = createEnv(db);

    const token = await signEmailToken('test@example.com', 'test-secret-key');

    const res = await app.request(
      'http://localhost/store/newsletter/unsubscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toBe('Already unsubscribed');
  });

  it('rejects missing token', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/newsletter/unsubscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({}),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it('returns 500 when secret is not configured', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const db = createMockDb({ existingSubscriber: { id: 1, status: 'active' } });
    const env = createEnv(db, { NEWSLETTER_SECRET: undefined, ADMIN_API_KEY: undefined });

    const res = await app.request(
      'http://localhost/store/newsletter/unsubscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: 'some-token' }),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Service misconfigured');
  });

  it('uses ADMIN_API_KEY as fallback when NEWSLETTER_SECRET is unset', async () => {
    const app = new Hono();
    app.route('/store', newsletter);
    const db = createMockDb({ existingSubscriber: { id: 1, status: 'active' } });
    const env = createEnv(db, { NEWSLETTER_SECRET: undefined, ADMIN_API_KEY: 'admin-key-fallback' });

    const token = await signEmailToken('test@example.com', 'admin-key-fallback');

    const res = await app.request(
      'http://localhost/store/newsletter/unsubscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toBe('Successfully unsubscribed from newsletter');
  });
});
