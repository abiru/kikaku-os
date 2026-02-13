import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import contact from '../../../routes/storefront/contact';

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null }),
    },
  })),
}));

const createMockDb = () => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  return {
    calls,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ sql, bind: args });
        return {
          run: async () => ({ meta: { last_row_id: 1 } }),
          all: async () => ({ results: [] }),
          first: async () => null,
        };
      },
    }),
  };
};

const createEnv = (db = createMockDb()) => ({
  DB: db,
  RESEND_API_KEY: 'test-key',
  RESEND_FROM_EMAIL: 'noreply@test.com',
} as any);

describe('POST /store/contact', () => {
  it('accepts valid contact form submission', async () => {
    const app = new Hono();
    app.route('/store', contact);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/contact',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          subject: 'Test Subject',
          body: 'Test message body',
        }),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.id).toBe(1);
  });

  it('inserts into contact_inquiries and inbox_items', async () => {
    const app = new Hono();
    app.route('/store', contact);
    const db = createMockDb();
    const env = createEnv(db);

    await app.request(
      'http://localhost/store/contact',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          subject: 'Test Subject',
          body: 'Test message body',
        }),
      },
      env
    );

    // First call: INSERT into contact_inquiries
    expect(db.calls[0].sql).toContain('contact_inquiries');
    expect(db.calls[0].bind).toEqual([
      'Test User',
      'test@example.com',
      'Test Subject',
      'Test message body',
    ]);

    // Second call: INSERT into inbox_items
    expect(db.calls[1].sql).toContain('inbox_items');
    expect(db.calls[1].bind[0]).toContain('お問い合わせ');
  });

  it('rejects missing required fields', async () => {
    const app = new Hono();
    app.route('/store', contact);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/contact',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      },
      env
    );

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.ok).toBe(false);
  });

  it('rejects invalid email', async () => {
    const app = new Hono();
    app.route('/store', contact);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/contact',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Test',
          email: 'not-an-email',
          subject: 'Test',
          body: 'Test body',
        }),
      },
      env
    );

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.ok).toBe(false);
  });

  it('rejects empty body', async () => {
    const app = new Hono();
    app.route('/store', contact);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/contact',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Test',
          email: 'test@example.com',
          subject: 'Test',
          body: '',
        }),
      },
      env
    );

    expect(res.status).toBe(400);
  });
});
