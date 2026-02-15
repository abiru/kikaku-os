import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import health from '../../routes/health';

const createMockDb = (result: { result: number } | null = { result: 1 }, shouldThrow = false) => ({
  prepare: vi.fn(() => ({
    first: shouldThrow
      ? vi.fn(async () => { throw new Error('DB error'); })
      : vi.fn(async () => result),
  })),
});

const createMockR2 = (shouldThrow = false) => ({
  list: shouldThrow
    ? vi.fn(async () => { throw new Error('R2 error'); })
    : vi.fn(async () => ({ objects: [] })),
});

const createApp = (env: Record<string, unknown>) => {
  const app = new Hono();
  app.route('/', health);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, env as any),
  };
};

const BASE_ENV = {
  ADMIN_API_KEY: 'test-admin-key',
  STRIPE_SECRET_KEY: 'sk_test_xxx',
  STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
  CLERK_SECRET_KEY: 'sk_clerk_xxx',
  STOREFRONT_BASE_URL: 'http://localhost:4321',
  DEV_MODE: 'true',
};

describe('Health Check', () => {
  describe('GET /health', () => {
    it('returns 200 when all checks pass', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.api).toBe('ok');
      expect(json.database).toBe('ok');
      expect(json.r2).toBe('ok');
      expect(json.secrets).toBe('ok');
      expect(json.environment).toBe('development');
      expect(typeof json.timestamp).toBe('string');
    });

    it('returns 503 when database check fails', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DB: createMockDb(null, true),
        R2: createMockR2(),
      });

      const res = await fetch('/health');
      const json = (await res.json()) as any;

      expect(res.status).toBe(503);
      expect(json.ok).toBe(false);
      expect(json.database).toBe('error');
    });

    it('returns 503 when R2 check fails', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DB: createMockDb(),
        R2: createMockR2(true),
      });

      const res = await fetch('/health');
      const json = (await res.json()) as any;

      expect(res.status).toBe(503);
      expect(json.ok).toBe(false);
      expect(json.r2).toBe('error');
    });

    it('returns 503 when required secrets are missing', async () => {
      const { fetch } = createApp({
        DB: createMockDb(),
        R2: createMockR2(),
        DEV_MODE: 'false',
      });

      const res = await fetch('/health');
      const json = (await res.json()) as any;

      expect(res.status).toBe(503);
      expect(json.ok).toBe(false);
      expect(json.secrets).toBe('error');
    });

    it('returns production environment when DEV_MODE is not true', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DEV_MODE: 'false',
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health');
      const json = (await res.json()) as any;

      expect(json.environment).toBe('production');
    });

    it('returns 503 when DB returns unexpected result', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DB: createMockDb({ result: 0 }),
        R2: createMockR2(),
      });

      const res = await fetch('/health');
      const json = (await res.json()) as any;

      expect(res.status).toBe(503);
      expect(json.database).toBe('error');
    });
  });

  describe('GET /health?detailed=true', () => {
    it('returns secrets detail with valid admin key', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health?detailed=true', {
        headers: { 'x-admin-key': 'test-admin-key' },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.secretsDetail).toBeDefined();
      expect(json.secretsDetail.required.ADMIN_API_KEY.configured).toBe(true);
      expect(json.secretsDetail.required.STRIPE_SECRET_KEY.configured).toBe(true);
    });

    it('returns 401 without admin key', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health?detailed=true');
      const json = (await res.json()) as any;

      expect(res.status).toBe(401);
      expect(json.ok).toBe(false);
    });

    it('returns 401 with invalid admin key', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health?detailed=true', {
        headers: { 'x-admin-key': 'wrong-key' },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(401);
      expect(json.ok).toBe(false);
    });

    it('shows unconfigured secrets in detail', async () => {
      const { fetch } = createApp({
        ADMIN_API_KEY: 'test-admin-key',
        DB: createMockDb(),
        R2: createMockR2(),
        DEV_MODE: 'true',
      });

      const res = await fetch('/health?detailed=true', {
        headers: { 'x-admin-key': 'test-admin-key' },
      });
      const json = (await res.json()) as any;

      // Some secrets are missing, so status is 503
      expect(res.status).toBe(503);
      expect(json.secretsDetail.required.STRIPE_SECRET_KEY.configured).toBe(false);
      expect(json.secretsDetail.required.CLERK_SECRET_KEY.configured).toBe(false);
    });
  });
});
