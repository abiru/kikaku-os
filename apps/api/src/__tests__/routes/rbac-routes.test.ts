import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../env';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../lib/schemas';

/**
 * Tests that routes requiring RBAC properly deny access when
 * the user lacks permissions. Uses real (unmocked) RBAC middleware
 * to verify the routes are correctly protected.
 */

// Mock clerkAuth to simulate unauthenticated access
vi.mock('../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
  timingSafeCompare: (a: string, b: string) => a === b,
}));

// Helper: create a mock DB that returns empty permission sets
const createMockDb = () => ({
  prepare: vi.fn((_sql: string) => ({
    bind: vi.fn((..._args: unknown[]) => ({
      all: vi.fn(async () => ({ results: [] })),
      first: vi.fn(async () => null),
      run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
    })),
    all: vi.fn(async () => ({ results: [] })),
    first: vi.fn(async () => null),
  })),
});

const createMockR2 = () => ({
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
});

describe('RBAC Route Protection', () => {
  describe('Inbox routes', () => {
    let inboxModule: typeof import('../../routes/system/inbox');

    beforeEach(async () => {
      vi.resetModules();
      // Re-import to get fresh module with real RBAC
      inboxModule = await import('../../routes/system/inbox');
    });

    it('GET /inbox returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', inboxModule.default);

      const res = await app.request('http://localhost/inbox', {}, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('POST /inbox/:id/approve returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', inboxModule.default);

      const res = await app.request('http://localhost/inbox/1/approve', {
        method: 'POST',
      }, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('POST /inbox/:id/reject returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', inboxModule.default);

      const res = await app.request('http://localhost/inbox/1/reject', {
        method: 'POST',
      }, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });
  });

  describe('Accounting routes', () => {
    let accountingModule: typeof import('../../routes/accounting/accounting');

    beforeEach(async () => {
      vi.resetModules();
      accountingModule = await import('../../routes/accounting/accounting');
    });

    it('GET /ledger-entries returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', accountingModule.default);

      const res = await app.request('http://localhost/ledger-entries?date=2026-01-13', {}, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });
  });

  describe('Reports routes', () => {
    let reportsModule: typeof import('../../routes/accounting/reports');

    beforeEach(async () => {
      vi.resetModules();
      reportsModule = await import('../../routes/accounting/reports');
    });

    it('GET /daily returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/reports', reportsModule.default);

      const res = await app.request('http://localhost/reports/daily?date=2026-01-13', {}, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });
  });

  describe('Daily Close Artifacts routes', () => {
    let dailyCloseModule: typeof import('../../routes/accounting/dailyCloseArtifacts');

    beforeEach(async () => {
      vi.resetModules();
      dailyCloseModule = await import('../../routes/accounting/dailyCloseArtifacts');
    });

    it('POST /daily-close/:date/artifacts returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', dailyCloseModule.default);

      const res = await app.request('http://localhost/daily-close/2026-01-13/artifacts', {
        method: 'POST',
      }, {
        DB: createMockDb(),
        R2: createMockR2(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('GET /daily-close/:date/documents returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', dailyCloseModule.default);

      const res = await app.request('http://localhost/daily-close/2026-01-13/documents', {}, {
        DB: createMockDb(),
        R2: createMockR2(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('GET /daily-close/runs returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', dailyCloseModule.default);

      const res = await app.request('http://localhost/daily-close/runs', {}, {
        DB: createMockDb(),
        R2: createMockR2(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('POST /daily-close/backfill returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', dailyCloseModule.default);

      const res = await app.request('http://localhost/daily-close/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: '2026-01-01', endDate: '2026-01-05' }),
      }, {
        DB: createMockDb(),
        R2: createMockR2(),
      } as any);

      expect(res.status).toBe(401);
    });
  });

  describe('Quotation admin routes', () => {
    let quotationsModule: typeof import('../../routes/checkout/quotations');

    beforeEach(async () => {
      vi.resetModules();
      quotationsModule = await import('../../routes/checkout/quotations');
    });

    it('GET /quotations (list) returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', quotationsModule.default);

      const res = await app.request('http://localhost/quotations', {}, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('DELETE /quotations/:id returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', quotationsModule.default);

      const res = await app.request('http://localhost/quotations/1', {
        method: 'DELETE',
      }, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });
  });
});
