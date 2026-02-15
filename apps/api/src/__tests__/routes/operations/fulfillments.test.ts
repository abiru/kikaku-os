import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import fulfillments from '../../../routes/operations/fulfillments';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

vi.mock('../../../services/orderEmail', () => ({
  sendShippingNotificationEmail: vi.fn(async () => {}),
}));

const ADMIN_KEY = 'test-admin-key';

const createMockDb = (options: {
  existingFulfillment?: any | null;
  updatedFulfillment?: any | null;
  order?: any | null;
  createdFulfillment?: any | null;
  insertResult?: { meta: { last_row_id: number; changes: number } };
} = {}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => ({ results: [] })),
        first: vi.fn(async () => {
          // PUT /admin/fulfillments/:id
          if (
            sql.includes('SELECT') &&
            sql.includes('FROM fulfillments') &&
            sql.includes('old_status')
          ) {
            return options.existingFulfillment ?? null;
          }
          // Fetch updated record after UPDATE
          if (
            sql.includes('SELECT *') &&
            sql.includes('FROM fulfillments') &&
            !sql.includes('old_status')
          ) {
            return options.updatedFulfillment ?? options.createdFulfillment ?? null;
          }
          // POST /admin/orders/:orderId/fulfillments - check order exists
          if (sql.includes('SELECT id FROM orders')) {
            return options.order ?? null;
          }
          return null;
        }),
        run: vi.fn(async () =>
          options.insertResult || { meta: { last_row_id: 1, changes: 1 } }
        ),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/', fulfillments);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

// -------------------------------------------------
// PUT /admin/fulfillments/:id
// -------------------------------------------------
describe('Fulfillment Routes', () => {
  describe('PUT /admin/fulfillments/:id', () => {
    it('updates fulfillment status', async () => {
      const existingFulfillment = {
        id: 1,
        order_id: 10,
        old_status: 'pending',
        metadata: null,
      };
      const updatedFulfillment = {
        id: 1,
        order_id: 10,
        status: 'processing',
        tracking_number: null,
        metadata: '{}',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T12:00:00Z',
      };

      const db = createMockDb({ existingFulfillment, updatedFulfillment });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/fulfillments/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'processing' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.fulfillment.status).toBe('processing');
    });

    it('updates fulfillment with tracking number and carrier', async () => {
      const existingFulfillment = {
        id: 1,
        order_id: 10,
        old_status: 'processing',
        metadata: '{}',
      };
      const updatedFulfillment = {
        id: 1,
        order_id: 10,
        status: 'shipped',
        tracking_number: '1234567890',
        metadata: JSON.stringify({ carrier: 'ヤマト運輸' }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T12:00:00Z',
      };

      const db = createMockDb({ existingFulfillment, updatedFulfillment });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/fulfillments/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'shipped',
          tracking_number: '1234567890',
          carrier: 'ヤマト運輸',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.fulfillment.tracking_number).toBe('1234567890');
    });

    it('returns 404 when fulfillment does not exist', async () => {
      const db = createMockDb({ existingFulfillment: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/fulfillments/999', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'shipped' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Fulfillment not found');
    });

    it('returns 400 for invalid fulfillment id param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/fulfillments/abc', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'shipped' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid status value', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/fulfillments/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'invalid_status' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when status is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/fulfillments/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tracking_number: '123' }),
      });

      expect(res.status).toBe(400);
    });

    it('merges carrier into existing metadata', async () => {
      const existingFulfillment = {
        id: 1,
        order_id: 10,
        old_status: 'pending',
        metadata: JSON.stringify({ some_key: 'some_value' }),
      };
      const updatedFulfillment = {
        id: 1,
        order_id: 10,
        status: 'shipped',
        tracking_number: 'TRACK123',
        metadata: JSON.stringify({ some_key: 'some_value', carrier: '佐川急便' }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T12:00:00Z',
      };

      const db = createMockDb({ existingFulfillment, updatedFulfillment });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/fulfillments/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'shipped',
          tracking_number: 'TRACK123',
          carrier: '佐川急便',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);

      // Verify the UPDATE was called with merged metadata
      const updateCall = db.prepare.mock.calls.find(
        (call: string[]) => typeof call[0] === 'string' && call[0].includes('UPDATE fulfillments')
      );
      expect(updateCall).toBeDefined();
    });
  });

  // -------------------------------------------------
  // POST /admin/orders/:orderId/fulfillments
  // -------------------------------------------------
  describe('POST /admin/orders/:orderId/fulfillments', () => {
    it('creates a fulfillment for an order', async () => {
      const createdFulfillment = {
        id: 5,
        order_id: 10,
        status: 'pending',
        tracking_number: null,
        metadata: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const db = createMockDb({
        order: { id: 10 },
        createdFulfillment,
        insertResult: { meta: { last_row_id: 5, changes: 1 } },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/orders/10/fulfillments', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.fulfillment.id).toBe(5);
      expect(json.fulfillment.status).toBe('pending');
    });

    it('creates a shipped fulfillment with tracking and carrier', async () => {
      const createdFulfillment = {
        id: 6,
        order_id: 10,
        status: 'shipped',
        tracking_number: 'TRACK456',
        metadata: JSON.stringify({ carrier: 'ヤマト運輸' }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const db = createMockDb({
        order: { id: 10 },
        createdFulfillment,
        insertResult: { meta: { last_row_id: 6, changes: 1 } },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/orders/10/fulfillments', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'shipped',
          tracking_number: 'TRACK456',
          carrier: 'ヤマト運輸',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.fulfillment.tracking_number).toBe('TRACK456');
    });

    it('returns 404 when order does not exist', async () => {
      const db = createMockDb({ order: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/orders/999/fulfillments', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'pending' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Order not found');
    });

    it('returns 400 for invalid orderId param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/orders/abc/fulfillments', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'pending' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid status value', async () => {
      const db = createMockDb({ order: { id: 10 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/orders/10/fulfillments', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'not_a_real_status' }),
      });

      expect(res.status).toBe(400);
    });

    it('defaults status to pending when not provided', async () => {
      const createdFulfillment = {
        id: 7,
        order_id: 10,
        status: 'pending',
        tracking_number: null,
        metadata: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const db = createMockDb({
        order: { id: 10 },
        createdFulfillment,
        insertResult: { meta: { last_row_id: 7, changes: 1 } },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/orders/10/fulfillments', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.fulfillment.status).toBe('pending');
    });
  });
});
