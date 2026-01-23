import { describe, it, expect } from 'vitest';
import worker from '../../../../index';

type CustomerRow = {
  id: number;
  name: string;
  email: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};

const createMockEnv = () => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  let customerData: CustomerRow[] = [
    {
      id: 1,
      name: 'Test Customer',
      email: 'test@example.com',
      metadata: null,
      created_at: '2024-01-01 00:00:00',
      updated_at: '2024-01-01 00:00:00'
    },
    {
      id: 2,
      name: 'Another Customer',
      email: 'another@example.com',
      metadata: '{"vip": true}',
      created_at: '2024-01-02 00:00:00',
      updated_at: '2024-01-02 00:00:00'
    }
  ];
  let orderData: { customer_id: number }[] = [];
  let nextId = 3;

  return {
    calls,
    setOrderData: (data: { customer_id: number }[]) => {
      orderData = data;
    },
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async <T>() => {
            calls.push({ sql, bind: args });
            if (sql.includes('COUNT(*)') && sql.includes('customers')) {
              return { count: customerData.length } as T;
            }
            if (sql.includes('COUNT(*)') && sql.includes('orders')) {
              const customerId = args[0] as number;
              const count = orderData.filter((o) => o.customer_id === customerId).length;
              return { count } as T;
            }
            if (sql.includes('FROM customers') && sql.includes('WHERE id')) {
              const id = args[0] as number;
              const customer = customerData.find((c) => c.id === id);
              return customer as T | undefined;
            }
            return undefined;
          },
          all: async <T>() => {
            calls.push({ sql, bind: args });
            if (sql.includes('FROM customers')) {
              return { results: customerData } as T;
            }
            return { results: [] } as T;
          },
          run: async () => {
            calls.push({ sql, bind: args });
            if (sql.includes('INSERT INTO customers')) {
              const newCustomer: CustomerRow = {
                id: nextId++,
                name: args[0] as string,
                email: args[1] as string | null,
                metadata: args[2] as string | null,
                created_at: '2024-01-03 00:00:00',
                updated_at: '2024-01-03 00:00:00'
              };
              customerData.push(newCustomer);
              return { meta: { last_row_id: newCustomer.id } };
            }
            if (sql.includes('UPDATE customers')) {
              return { meta: {} };
            }
            if (sql.includes('DELETE FROM customers')) {
              const id = args[args.length - 1] as number;
              customerData = customerData.filter((c) => c.id !== id);
              return { meta: {} };
            }
            return { meta: {} };
          }
        })
      })
    },
    ADMIN_API_KEY: 'test-admin-key'
  };
};

const createExecutionContext = () => ({
  waitUntil: () => {},
  passThroughOnException: () => {}
});

describe('GET /admin/customers', () => {
  it('returns customer list with pagination', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.customers).toBeDefined();
    expect(json.meta).toBeDefined();
    expect(json.meta.page).toBe(1);
    expect(json.meta.perPage).toBe(20);
  });

  it('returns 401 without auth header', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers', {
        method: 'GET'
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /admin/customers/:id', () => {
  it('returns customer detail', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers/1', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.customer).toBeDefined();
    expect(json.customer.id).toBe(1);
    expect(json.customer.name).toBe('Test Customer');
  });

  it('returns 404 for non-existent customer', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers/999', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(404);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Customer not found');
  });

  it('returns 400 for invalid ID', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers/abc', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(400);
  });
});

describe('POST /admin/customers', () => {
  it('creates a new customer', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'New Customer',
          email: 'new@example.com'
        })
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.customer).toBeDefined();
    expect(mockEnv.calls.some((call) => call.sql.includes('INSERT INTO customers'))).toBe(true);
  });

  it('creates customer with metadata', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'VIP Customer',
          email: 'vip@example.com',
          metadata: { tier: 'gold', discount: 10 }
        })
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
  });

  it('returns 400 for missing name', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'noname@example.com'
        })
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(400);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
  });

  it('returns 400 for invalid email', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Invalid Email Customer',
          email: 'not-an-email'
        })
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(400);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
  });
});

describe('PUT /admin/customers/:id', () => {
  it('updates customer', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Updated Customer Name'
        })
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(mockEnv.calls.some((call) => call.sql.includes('UPDATE customers'))).toBe(true);
  });

  it('returns 404 for non-existent customer', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers/999', {
        method: 'PUT',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Updated Name'
        })
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(404);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Customer not found');
  });
});

describe('DELETE /admin/customers/:id', () => {
  it('deletes customer without orders', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(true);
    expect(mockEnv.calls.some((call) => call.sql.includes('DELETE FROM customers'))).toBe(true);
  });

  it('returns 404 for non-existent customer', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers/999', {
        method: 'DELETE',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(404);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Customer not found');
  });

  it('returns 400 when customer has orders', async () => {
    const mockEnv = createMockEnv();
    mockEnv.setOrderData([{ customer_id: 1 }]);

    const res = await worker.fetch(
      new Request('http://localhost/admin/customers/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(400);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
    expect(json.message).toContain('existing order');
  });
});
