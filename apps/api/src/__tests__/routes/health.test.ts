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

// Use a strong API key (>= 32 chars) so security checks pass
const STRONG_ADMIN_KEY = 'a'.repeat(32);

const BASE_ENV = {
  ADMIN_API_KEY: STRONG_ADMIN_KEY,
  STRIPE_SECRET_KEY: 'sk_test_xxx',
  STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
  CLERK_SECRET_KEY: 'sk_clerk_xxx',
  STOREFRONT_BASE_URL: 'http://localhost:4321',
  DEV_MODE: 'false',
};

describe('Health Check', () => {
  describe('GET /health (unauthenticated)', () => {
    it('returns 200 with minimal status when healthy', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.status).toBe('ok');
      // Should NOT expose internal details
      expect(json.database).toBeUndefined();
      expect(json.r2).toBeUndefined();
      expect(json.secrets).toBeUndefined();
      expect(json.environment).toBeUndefined();
    });

    it('returns 503 with minimal info when database is down', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DB: createMockDb(null, true),
        R2: createMockR2(),
      });

      const res = await fetch('/health');
      const json = (await res.json()) as any;

      expect(res.status).toBe(503);
      expect(json.ok).toBe(false);
      // Should NOT expose which component failed
      expect(json.database).toBeUndefined();
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
    });
  });

  describe('GET /health (authenticated)', () => {
    it('returns full details with valid admin key', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health', {
        headers: { 'x-admin-key': STRONG_ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.api).toBe('ok');
      expect(json.database).toBe('ok');
      expect(json.r2).toBe('ok');
      expect(json.secrets).toBe('ok');
      expect(json.environment).toBe('production');
      expect(typeof json.timestamp).toBe('string');
    });

    it('returns production environment when DEV_MODE is not true', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DEV_MODE: 'false',
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health', {
        headers: { 'x-admin-key': STRONG_ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(json.environment).toBe('production');
    });

    it('returns 503 with details when DB returns unexpected result', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DB: createMockDb({ result: 0 }),
        R2: createMockR2(),
      });

      const res = await fetch('/health', {
        headers: { 'x-admin-key': STRONG_ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(503);
      expect(json.database).toBe('error');
    });
  });

  describe('GET /health?detailed=true', () => {
    it('returns secrets detail and security info with valid admin key', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health?detailed=true', {
        headers: { 'x-admin-key': STRONG_ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.secretsDetail).toBeDefined();
      expect(json.secretsDetail.required.ADMIN_API_KEY.configured).toBe(true);
      expect(json.secretsDetail.required.STRIPE_SECRET_KEY.configured).toBe(true);
      expect(json.security).toBeDefined();
      expect(json.security.adminKeyStrength).toBe('ok');
      expect(json.security.devMode).toBe('ok');
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
        ADMIN_API_KEY: STRONG_ADMIN_KEY,
        DB: createMockDb(),
        R2: createMockR2(),
        DEV_MODE: 'false',
      });

      const res = await fetch('/health?detailed=true', {
        headers: { 'x-admin-key': STRONG_ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      // Some secrets are missing, so status is 503
      expect(res.status).toBe(503);
      expect(json.secretsDetail.required.STRIPE_SECRET_KEY.configured).toBe(false);
      expect(json.secretsDetail.required.CLERK_SECRET_KEY.configured).toBe(false);
    });
  });

  describe('Security checks', () => {
    it('returns 503 when ADMIN_API_KEY is too short', async () => {
      const shortKey = 'short-key';
      const { fetch } = createApp({
        ...BASE_ENV,
        ADMIN_API_KEY: shortKey,
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health', {
        headers: { 'x-admin-key': shortKey },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(503);
      expect(json.warnings).toBeDefined();
      expect(json.warnings.some((w: string) => w.includes('too short'))).toBe(true);
    });

    it('returns 503 when ADMIN_API_KEY uses a weak default value', async () => {
      const weakKey = 'CHANGE_ME';
      const { fetch } = createApp({
        ...BASE_ENV,
        ADMIN_API_KEY: weakKey,
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health', {
        headers: { 'x-admin-key': weakKey },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(503);
      expect(json.warnings).toBeDefined();
      expect(json.warnings.some((w: string) => w.includes('known weak'))).toBe(true);
    });

    it('returns 503 when DEV_MODE is enabled', async () => {
      const { fetch } = createApp({
        ...BASE_ENV,
        DEV_MODE: 'true',
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health', {
        headers: { 'x-admin-key': STRONG_ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(503);
      expect(json.warnings).toBeDefined();
      expect(json.warnings.some((w: string) => w.includes('DEV_MODE'))).toBe(true);
    });

    it('reports security status in detailed view', async () => {
      const shortKey = 'weak';
      const { fetch } = createApp({
        ...BASE_ENV,
        ADMIN_API_KEY: shortKey,
        DEV_MODE: 'true',
        DB: createMockDb(),
        R2: createMockR2(),
      });

      const res = await fetch('/health?detailed=true', {
        headers: { 'x-admin-key': shortKey },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(503);
      expect(json.security.adminKeyStrength).toBe('warning');
      expect(json.security.devMode).toBe('warning');
    });
  });
});
