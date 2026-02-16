import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import adminAuditLogs from '../../../routes/admin/adminAuditLogs';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

type MockDbOptions = {
  logs?: Array<Record<string, unknown>>;
  total?: number;
  actions?: string[];
  targets?: string[];
  shouldFail?: boolean;
};

const createMockDb = (options: MockDbOptions = {}) => {
  const logs = options.logs ?? [
    { id: 1, actor: 'admin@test.com', action: 'create', target: 'product', metadata: '{}', created_at: '2026-01-15T10:00:00Z' },
    { id: 2, actor: 'admin@test.com', action: 'update', target: 'order', metadata: null, created_at: '2026-01-15T11:00:00Z' },
  ];
  const total = options.total ?? logs.length;
  const actions = options.actions ?? ['create', 'update', 'delete'];
  const targets = options.targets ?? ['product', 'order'];

  const makeResultFns = (sql: string) => ({
    first: vi.fn(async () => {
      if (options.shouldFail) throw new Error('DB error');
      if (sql.includes('COUNT(*)')) return { total };
      return null;
    }),
    all: vi.fn(async () => {
      if (options.shouldFail) throw new Error('DB error');
      if (sql.includes('DISTINCT action')) return { results: actions.map(a => ({ action: a })) };
      if (sql.includes('DISTINCT target')) return { results: targets.map(t => ({ target: t })) };
      return { results: logs };
    }),
  });

  return {
    prepare: vi.fn((sql: string) => {
      const fns = makeResultFns(sql);
      return {
        // Direct .all()/.first() (no bind)
        ...fns,
        bind: vi.fn((..._args: unknown[]) => fns),
      };
    }),
  };
};

const createApp = (db: ReturnType<typeof createMockDb> = createMockDb()) => {
  const app = new Hono();
  app.route('/admin/audit-logs', adminAuditLogs);
  return {
    app,
    db,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db } as any),
  };
};

describe('Admin Audit Logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /admin/audit-logs', () => {
    it('returns audit logs with default pagination', async () => {
      const { fetch } = createApp();
      const res = await fetch('/admin/audit-logs');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.logs).toHaveLength(2);
      expect(data.total).toBe(2);
      expect(data.limit).toBe(50);
      expect(data.offset).toBe(0);
    });

    it('returns filter options for actions and targets', async () => {
      const { fetch } = createApp();
      const res = await fetch('/admin/audit-logs');
      const data = await res.json();

      expect(data.filters.actions).toEqual(['create', 'update', 'delete']);
      expect(data.filters.targets).toEqual(['product', 'order']);
    });

    it('supports custom limit and offset', async () => {
      const { fetch, db } = createApp();
      await fetch('/admin/audit-logs?limit=10&offset=20');

      const prepareCalls = db.prepare.mock.calls;
      const selectCall = prepareCalls.find(
        (call: string[]) => call[0]?.includes('SELECT id, actor')
      );
      expect(selectCall).toBeDefined();
    });

    it('supports actor filter', async () => {
      const { fetch, db } = createApp();
      await fetch('/admin/audit-logs?actor=admin');

      const prepareCalls = db.prepare.mock.calls;
      const hasActorFilter = prepareCalls.some(
        (call: string[]) => call[0]?.includes('actor LIKE')
      );
      expect(hasActorFilter).toBe(true);
    });

    it('supports action filter', async () => {
      const { fetch, db } = createApp();
      await fetch('/admin/audit-logs?action=create');

      const prepareCalls = db.prepare.mock.calls;
      const hasActionFilter = prepareCalls.some(
        (call: string[]) => call[0]?.includes('action =')
      );
      expect(hasActionFilter).toBe(true);
    });

    it('supports target filter', async () => {
      const { fetch, db } = createApp();
      await fetch('/admin/audit-logs?target=product');

      const prepareCalls = db.prepare.mock.calls;
      const hasTargetFilter = prepareCalls.some(
        (call: string[]) => call[0]?.includes('target =')
      );
      expect(hasTargetFilter).toBe(true);
    });

    it('supports date range filters', async () => {
      const { fetch, db } = createApp();
      await fetch('/admin/audit-logs?date_from=2026-01-01&date_to=2026-01-31');

      const prepareCalls = db.prepare.mock.calls;
      const hasDateFrom = prepareCalls.some(
        (call: string[]) => call[0]?.includes('created_at >=')
      );
      const hasDateTo = prepareCalls.some(
        (call: string[]) => call[0]?.includes('created_at <=')
      );
      expect(hasDateFrom).toBe(true);
      expect(hasDateTo).toBe(true);
    });

    it('caps limit at 200', async () => {
      const { fetch } = createApp();
      const res = await fetch('/admin/audit-logs?limit=500');
      const data = await res.json();
      expect(data.limit).toBe(200);
    });

    it('ensures limit is at least 1', async () => {
      const { fetch } = createApp();
      const res = await fetch('/admin/audit-logs?limit=1');
      const data = await res.json();
      expect(data.limit).toBe(1);
    });

    it('returns 500 on database error', async () => {
      const db = createMockDb({ shouldFail: true });
      const { fetch } = createApp(db);
      const res = await fetch('/admin/audit-logs');
      expect(res.status).toBe(500);
    });

    it('returns empty logs array when no results', async () => {
      const db = createMockDb({ logs: [], total: 0 });
      const { fetch } = createApp(db);
      const res = await fetch('/admin/audit-logs');
      const data = await res.json();
      expect(data.logs).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('validates date format', async () => {
      const { fetch } = createApp();
      const res = await fetch('/admin/audit-logs?date_from=invalid-date');
      expect(res.status).toBe(400);
    });
  });
});
