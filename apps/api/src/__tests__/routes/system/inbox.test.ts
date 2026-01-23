import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import inbox from '../../../routes/system/inbox';

const createMockDb = (items: Array<Record<string, unknown>>) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  return {
    calls,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ sql, bind: args });
        return {
          all: async () => ({ results: items })
        };
      }
    })
  };
};

describe('GET /inbox', () => {
  it('returns items with kind/date fields', async () => {
    const app = new Hono();
    app.route('/', inbox);

    const items = [
      {
        id: 1,
        title: 'x',
        body: 'y',
        severity: 'info',
        status: 'open',
        kind: null,
        date: null,
        created_at: '2026-01-01T00:00:00Z'
      }
    ];

    const res = await app.request('http://localhost/inbox?status=open', {}, { DB: createMockDb(items) } as any);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.items[0]).toHaveProperty('kind');
    expect(json.items[0]).toHaveProperty('date');
    expect(json.items[0].kind).toBeNull();
    expect(json.items[0].date).toBeNull();
  });

  it('adds kind filter when provided', async () => {
    const app = new Hono();
    app.route('/', inbox);
    const mockDb = createMockDb([]);

    await app.request('http://localhost/inbox?status=open&kind=daily_close_anomaly', {}, { DB: mockDb } as any);

    expect(mockDb.calls[0].sql).toContain('kind=?');
    expect(mockDb.calls[0].bind).toEqual(['open', 'daily_close_anomaly', 100]);
  });

  it('adds date filter when provided', async () => {
    const app = new Hono();
    app.route('/', inbox);
    const mockDb = createMockDb([]);

    await app.request('http://localhost/inbox?status=open&date=2026-01-15', {}, { DB: mockDb } as any);

    expect(mockDb.calls[0].sql).toContain('date=?');
    expect(mockDb.calls[0].bind).toEqual(['open', '2026-01-15', 100]);
  });

  it('adds severity filter when provided', async () => {
    const app = new Hono();
    app.route('/', inbox);
    const mockDb = createMockDb([]);

    await app.request('http://localhost/inbox?status=open&severity=critical', {}, { DB: mockDb } as any);

    expect(mockDb.calls[0].sql).toContain('severity=?');
    expect(mockDb.calls[0].bind).toEqual(['open', 'critical', 100]);
  });

  it('adds kind and date filters together', async () => {
    const app = new Hono();
    app.route('/', inbox);
    const mockDb = createMockDb([]);

    await app.request('http://localhost/inbox?status=open&kind=daily_close_anomaly&date=2026-01-15', {}, { DB: mockDb } as any);

    expect(mockDb.calls[0].sql).toContain('kind=?');
    expect(mockDb.calls[0].sql).toContain('date=?');
    expect(mockDb.calls[0].bind).toEqual(['open', 'daily_close_anomaly', '2026-01-15', 100]);
  });
});
