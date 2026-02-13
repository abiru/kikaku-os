import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import newsletter from '../../../routes/storefront/newsletter';

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

const createEnv = (db = createMockDb()) => ({
  DB: db,
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
