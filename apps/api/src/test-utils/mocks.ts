import { vi } from 'vitest';

/**
 * Options for configuring mock database behavior
 */
export type MockDbOptions = {
  /** Data to return from SELECT queries */
  selectResults?: Record<string, unknown[]>;
  /** Custom query handler for complex scenarios */
  queryHandler?: (sql: string, bindings: unknown[]) => unknown;
  /** Track all queries for assertions */
  trackQueries?: boolean;
};

/**
 * Creates a mock D1 database for testing.
 * Supports tracking queries and returning custom results.
 */
export const createMockDb = (options: MockDbOptions = {}) => {
  const queries: Array<{ sql: string; bindings: unknown[] }> = [];

  const mockDb = {
    queries,
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...bindings: unknown[]) => ({
        first: vi.fn(async <T>(): Promise<T | null> => {
          if (options.trackQueries) {
            queries.push({ sql, bindings });
          }

          if (options.queryHandler) {
            return options.queryHandler(sql, bindings) as T;
          }

          // Default: check selectResults for table-based results
          for (const [table, results] of Object.entries(options.selectResults || {})) {
            if (sql.toLowerCase().includes(table.toLowerCase())) {
              return (results[0] as T) || null;
            }
          }
          return null;
        }),
        all: vi.fn(async <T>(): Promise<{ results: T[] }> => {
          if (options.trackQueries) {
            queries.push({ sql, bindings });
          }

          if (options.queryHandler) {
            const result = options.queryHandler(sql, bindings);
            return { results: (Array.isArray(result) ? result : [result]) as T[] };
          }

          // Default: check selectResults
          for (const [table, results] of Object.entries(options.selectResults || {})) {
            if (sql.toLowerCase().includes(table.toLowerCase())) {
              return { results: results as T[] };
            }
          }
          return { results: [] };
        }),
        run: vi.fn(async () => {
          if (options.trackQueries) {
            queries.push({ sql, bindings });
          }

          if (options.queryHandler) {
            options.queryHandler(sql, bindings);
          }

          return { success: true, meta: { changes: 1, last_row_id: 1 } };
        })
      }))
    }))
  };

  return mockDb;
};

/**
 * Creates a mock R2 bucket for testing storage operations.
 */
export const createMockR2 = () => {
  const storage = new Map<string, { body: string; metadata?: Record<string, string> }>();

  return {
    storage,
    put: vi.fn(async (key: string, body: string, options?: { httpMetadata?: { contentType?: string } }) => {
      storage.set(key, {
        body,
        metadata: options?.httpMetadata ? { contentType: options.httpMetadata.contentType || '' } : undefined
      });
    }),
    get: vi.fn(async (key: string) => {
      const item = storage.get(key);
      if (!item) return null;
      return {
        body: item.body,
        httpMetadata: item.metadata,
        writeHttpMetadata: vi.fn()
      };
    }),
    delete: vi.fn(async (key: string) => {
      storage.delete(key);
    })
  };
};

/**
 * Creates a complete mock environment for Hono tests.
 */
export const createMockEnv = (overrides?: {
  dbOptions?: MockDbOptions;
  adminKey?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
}) => {
  return {
    DB: createMockDb(overrides?.dbOptions),
    R2: createMockR2(),
    ADMIN_API_KEY: overrides?.adminKey ?? 'test-admin-key',
    STRIPE_SECRET_KEY: overrides?.stripeSecretKey ?? 'sk_test_xxx',
    STRIPE_WEBHOOK_SECRET: overrides?.stripeWebhookSecret ?? 'whsec_test',
    DEV_MODE: 'true',
    STOREFRONT_BASE_URL: 'http://localhost:4321'
  };
};

/**
 * Creates headers with admin authentication.
 */
export const adminHeaders = (key: string = 'test-admin-key') => ({
  'x-admin-key': key,
  'content-type': 'application/json'
});

/**
 * Helper to create a Hono test app with mock environment.
 */
export const createTestApp = <T extends { Bindings: ReturnType<typeof createMockEnv> }>(
  routeFactory: (env: ReturnType<typeof createMockEnv>) => unknown,
  envOverrides?: Parameters<typeof createMockEnv>[0]
) => {
  const env = createMockEnv(envOverrides);
  const route = routeFactory(env);
  return { env, route };
};
