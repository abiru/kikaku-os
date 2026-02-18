import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import errorReport from '../../../routes/system/errorReport';

const createMockDb = (shouldThrow = false) => ({
  prepare: vi.fn(() => ({
    bind: vi.fn(() => ({
      run: shouldThrow
        ? vi.fn(async () => { throw new Error('DB error'); })
        : vi.fn(async () => ({ success: true })),
    })),
  })),
});

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/errors', errorReport);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db } as any),
  };
};

describe('POST /errors/report', () => {
  it('accepts a valid error report and returns tracking ID', async () => {
    const db = createMockDb();
    const { fetch } = createApp(db);

    const body = {
      trackingId: 'ERR-1234567890-ab12',
      message: 'Something went wrong',
      stack: 'Error: Something went wrong\n  at foo.js:1:1',
      url: 'https://example.com/page',
      userAgent: 'Mozilla/5.0',
    };

    const res = await fetch('/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.trackingId).toBe('ERR-1234567890-ab12');
  });

  it('logs error to audit trail', async () => {
    const db = createMockDb();
    const { fetch } = createApp(db);

    await fetch('/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackingId: 'ERR-1234567890-ab12',
        message: 'Test error',
      }),
    });

    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs')
    );
  });

  it('rejects invalid tracking ID format', async () => {
    const db = createMockDb();
    const { fetch } = createApp(db);

    const res = await fetch('/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackingId: 'INVALID-FORMAT',
        message: 'Test error',
      }),
    });

    const json = (await res.json()) as any;
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it('rejects request with missing tracking ID', async () => {
    const db = createMockDb();
    const { fetch } = createApp(db);

    const res = await fetch('/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Test error without tracking ID',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('succeeds even when audit log fails', async () => {
    const db = createMockDb(true);
    const { fetch } = createApp(db);

    const res = await fetch('/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackingId: 'ERR-1234567890-ab12',
        message: 'Test error',
      }),
    });

    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it('accepts report with componentStack field', async () => {
    const db = createMockDb();
    const { fetch } = createApp(db);

    const res = await fetch('/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackingId: 'ERR-9999999999-zz99',
        message: 'Component render failed',
        componentStack: '\n  in MyComponent\n  in ErrorBoundary',
      }),
    });

    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });
});
