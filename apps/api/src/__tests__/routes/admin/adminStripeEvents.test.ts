import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminStripeEvents from '../../../routes/admin/adminStripeEvents';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const mockHandleStripeEvent = vi.fn();
vi.mock('../../../services/stripeEventHandlers', () => ({
  handleStripeEvent: (...args: any[]) => mockHandleStripeEvent(...args),
}));

const ADMIN_KEY = 'test-admin-key';

type MockDbOptions = {
  events?: any[];
  totalCount?: number;
  event?: any | null;
  throwError?: boolean;
};

const createMockDb = (options: MockDbOptions) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (options.throwError) {
            throw new Error('DB error');
          }
          return { results: options.events || [] };
        }),
        first: vi.fn(async () => {
          if (options.throwError) {
            throw new Error('DB error');
          }
          if (sql.includes('COUNT(*)')) {
            return { count: options.totalCount ?? 0 };
          }
          if (sql.includes('FROM stripe_events')) {
            return options.event ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin', adminStripeEvents);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

describe('Admin Stripe Events API', () => {
  describe('GET /admin/stripe-events', () => {
    it('returns paginated list of stripe events', async () => {
      const events = [
        {
          id: 1,
          event_id: 'evt_001',
          event_type: 'checkout.session.completed',
          event_created: '2026-01-01T00:00:00Z',
          processing_status: 'completed',
          error: null,
          received_at: '2026-01-01T00:00:01Z',
          processed_at: '2026-01-01T00:00:02Z',
        },
        {
          id: 2,
          event_id: 'evt_002',
          event_type: 'payment_intent.succeeded',
          event_created: '2026-01-02T00:00:00Z',
          processing_status: 'completed',
          error: null,
          received_at: '2026-01-02T00:00:01Z',
          processed_at: '2026-01-02T00:00:02Z',
        },
      ];

      const db = createMockDb({ events, totalCount: 2 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.events).toHaveLength(2);
      expect(json.meta.page).toBe(1);
      expect(json.meta.perPage).toBe(50);
      expect(json.meta.totalCount).toBe(2);
      expect(json.meta.totalPages).toBe(1);
    });

    it('returns empty list when no events exist', async () => {
      const db = createMockDb({ events: [], totalCount: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.events).toHaveLength(0);
      expect(json.meta.totalCount).toBe(0);
    });

    it('supports page and perPage query parameters', async () => {
      const db = createMockDb({ events: [], totalCount: 100 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events?page=2&perPage=10', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.meta.page).toBe(2);
      expect(json.meta.perPage).toBe(10);
      expect(json.meta.totalPages).toBe(10);
    });

    it('supports status filter', async () => {
      const db = createMockDb({ events: [], totalCount: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events?status=failed', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(200);
      // Verify that status filter is passed in the SQL
      const prepareCalls = db.prepare.mock.calls;
      const hasStatusFilter = prepareCalls.some(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('processing_status')
      );
      expect(hasStatusFilter).toBe(true);
    });

    it('supports type filter', async () => {
      const db = createMockDb({ events: [], totalCount: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events?type=checkout.session.completed', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(200);
      const prepareCalls = db.prepare.mock.calls;
      const hasTypeFilter = prepareCalls.some(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('event_type')
      );
      expect(hasTypeFilter).toBe(true);
    });

    it('handles database errors gracefully', async () => {
      const db = createMockDb({ throwError: true });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to fetch stripe events');
    });
  });

  describe('GET /admin/stripe-events/:id', () => {
    it('returns a single event with payload', async () => {
      const event = {
        id: 1,
        event_id: 'evt_001',
        event_type: 'checkout.session.completed',
        event_created: '2026-01-01T00:00:00Z',
        payload_json: '{"type":"checkout.session.completed"}',
        processing_status: 'completed',
        error: null,
        received_at: '2026-01-01T00:00:01Z',
        processed_at: '2026-01-01T00:00:02Z',
      };

      const db = createMockDb({ event });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events/1', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.event.event_id).toBe('evt_001');
      expect(json.event.payload_json).toBe('{"type":"checkout.session.completed"}');
    });

    it('returns 404 for non-existent event', async () => {
      const db = createMockDb({ event: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events/999', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Event not found');
    });

    it('returns 400 for invalid event ID', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events/0', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Invalid event ID');
    });

    it('returns 400 for non-numeric event ID', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events/abc', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Invalid event ID');
    });

    it('handles database errors gracefully', async () => {
      const db = createMockDb({ throwError: true });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events/1', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to fetch event details');
    });
  });

  describe('POST /admin/stripe-events/:id/retry', () => {
    it('retries a failed event successfully', async () => {
      const event = {
        id: 1,
        event_id: 'evt_001',
        event_type: 'checkout.session.completed',
        payload_json: '{"type":"checkout.session.completed","id":"evt_001"}',
        processing_status: 'failed',
      };

      mockHandleStripeEvent.mockResolvedValueOnce({ handled: true });

      const db = createMockDb({ event });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events/1/retry', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.retried).toBe(true);
      expect(json.event_id).toBe('evt_001');
      expect(mockHandleStripeEvent).toHaveBeenCalled();
    });

    it('returns 404 for non-existent event', async () => {
      const db = createMockDb({ event: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events/999/retry', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Event not found');
    });

    it('returns 400 for non-failed event', async () => {
      const event = {
        id: 1,
        event_id: 'evt_001',
        event_type: 'checkout.session.completed',
        payload_json: '{}',
        processing_status: 'completed',
      };

      const db = createMockDb({ event });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events/1/retry', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain("Cannot retry event with status 'completed'");
    });

    it('returns 400 for invalid event ID', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events/0/retry', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Invalid event ID');
    });

    it('returns 500 when event payload cannot be parsed', async () => {
      const event = {
        id: 1,
        event_id: 'evt_001',
        event_type: 'checkout.session.completed',
        payload_json: 'not-valid-json',
        processing_status: 'failed',
      };

      const db = createMockDb({ event });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events/1/retry', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to parse event payload');
    });

    it('returns 500 and updates status when retry handler throws', async () => {
      const event = {
        id: 1,
        event_id: 'evt_001',
        event_type: 'checkout.session.completed',
        payload_json: '{"type":"checkout.session.completed"}',
        processing_status: 'failed',
      };

      mockHandleStripeEvent.mockRejectedValueOnce(new Error('Handler failed'));

      const db = createMockDb({ event });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/stripe-events/1/retry', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toBe('Event retry failed. Check event details for more information.');
    });
  });
});
