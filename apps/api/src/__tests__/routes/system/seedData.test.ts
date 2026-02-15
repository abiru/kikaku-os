import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import dev from '../../../routes/system/dev';
import {
  ensureImageMetadata,
  ADDITIONAL_PRODUCTS,
  HERO_IMAGE_PAIRS,
  HERO_TEMPLATES,
  REVIEW_DEFS,
  INQUIRY_DEFS,
  getStaticPageBody,
} from '../../../routes/system/seedData';

// ---- Unit tests for seedData helpers ----

describe('ensureImageMetadata', () => {
  it('adds image_url to null metadata', () => {
    const { metadata, changed } = ensureImageMetadata(null, '/img.svg');
    expect(changed).toBe(true);
    expect(JSON.parse(metadata)).toEqual({ image_url: '/img.svg' });
  });

  it('adds image_url to empty object metadata', () => {
    const { metadata, changed } = ensureImageMetadata('{}', '/img.svg');
    expect(changed).toBe(true);
    expect(JSON.parse(metadata)).toEqual({ image_url: '/img.svg' });
  });

  it('returns unchanged when image_url already matches', () => {
    const existing = JSON.stringify({ image_url: '/img.svg', other: 'data' });
    const { metadata, changed } = ensureImageMetadata(existing, '/img.svg');
    expect(changed).toBe(false);
    expect(JSON.parse(metadata)).toEqual({ image_url: '/img.svg', other: 'data' });
  });

  it('updates image_url when different', () => {
    const existing = JSON.stringify({ image_url: '/old.svg' });
    const { metadata, changed } = ensureImageMetadata(existing, '/new.svg');
    expect(changed).toBe(true);
    expect(JSON.parse(metadata)).toEqual({ image_url: '/new.svg' });
  });

  it('handles invalid JSON metadata gracefully', () => {
    const { metadata, changed } = ensureImageMetadata('not-json', '/img.svg');
    expect(changed).toBe(true);
    expect(JSON.parse(metadata)).toEqual({ image_url: '/img.svg' });
  });

  it('handles array metadata by replacing with object', () => {
    const { metadata, changed } = ensureImageMetadata('[1,2,3]', '/img.svg');
    expect(changed).toBe(true);
    expect(JSON.parse(metadata)).toEqual({ image_url: '/img.svg' });
  });
});

describe('getStaticPageBody', () => {
  it('returns HTML for privacy page', () => {
    const body = getStaticPageBody('privacy');
    expect(body).toContain('個人情報保護方針');
  });

  it('returns HTML for terms page', () => {
    const body = getStaticPageBody('terms');
    expect(body).toContain('利用規約');
  });

  it('returns HTML for refund page', () => {
    const body = getStaticPageBody('refund');
    expect(body).toContain('返品・返金ポリシー');
  });

  it('returns null for unknown slug', () => {
    const body = getStaticPageBody('unknown');
    expect(body).toBeNull();
  });
});

describe('Seed data constants', () => {
  it('has additional products defined', () => {
    expect(ADDITIONAL_PRODUCTS.length).toBeGreaterThan(0);
    for (const p of ADDITIONAL_PRODUCTS) {
      expect(p.title).toBeTruthy();
      expect(p.sku).toBeTruthy();
      expect(p.price).toBeGreaterThan(0);
    }
  });

  it('has hero image pairs matching templates', () => {
    expect(HERO_IMAGE_PAIRS.length).toBe(HERO_TEMPLATES.length);
    for (const pair of HERO_IMAGE_PAIRS) {
      expect(pair.main).toBeTruthy();
      expect(pair.small).toBeTruthy();
    }
  });

  it('has review definitions', () => {
    expect(REVIEW_DEFS.length).toBeGreaterThan(0);
    for (const r of REVIEW_DEFS) {
      expect(r.rating).toBeGreaterThanOrEqual(1);
      expect(r.rating).toBeLessThanOrEqual(5);
    }
  });

  it('has inquiry definitions', () => {
    expect(INQUIRY_DEFS.length).toBeGreaterThan(0);
    for (const inq of INQUIRY_DEFS) {
      expect(inq.email).toContain('@');
    }
  });
});

// ---- Route tests for /dev/seed (DEV_MODE guard) ----

const createApp = (devMode: string = 'true') => {
  const app = new Hono();
  app.route('/dev', dev);

  const createEnv = (db: any) => ({
    DB: db,
    DEV_MODE: devMode,
    STRIPE_SECRET_KEY: 'sk_test_xxx',
  });

  return { app, createEnv };
};

describe('POST /dev/seed', () => {
  it('returns 404 when DEV_MODE is not true', async () => {
    const { app, createEnv } = createApp('false');
    const db = { prepare: vi.fn() };

    const res = await app.request(
      '/dev/seed',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      createEnv(db) as any
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as any;
    expect(json.ok).toBe(false);
  });

  it('returns 404 for non-dev endpoints when DEV_MODE is false', async () => {
    const { app, createEnv } = createApp('false');
    const db = { prepare: vi.fn() };

    const res = await app.request(
      '/dev/ping',
      { method: 'GET' },
      createEnv(db) as any
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as any;
    expect(json.ok).toBe(false);
  });

  it('accepts seed request with valid date in DEV_MODE', async () => {
    const { app, createEnv } = createApp('true');

    // Build a mock DB that handles the many SQL calls in seed
    const mockFirstResults = new Map<string, any>();
    mockFirstResults.set('customers', null); // No existing customer
    mockFirstResults.set('products', null); // No existing product
    mockFirstResults.set('variants', null); // No existing variant
    mockFirstResults.set('prices', null); // No existing price
    mockFirstResults.set('inventory_movements', null);
    mockFirstResults.set('tax_rates', null);
    mockFirstResults.set('coupons', null);
    mockFirstResults.set('COUNT', { count: 0 });

    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(function (this: any) { return this; }),
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({
          success: true,
          meta: { last_row_id: 1, changes: 1 },
        })),
        all: vi.fn(async () => ({ results: [] })),
      })),
    };

    const res = await app.request(
      '/dev/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: '2026-01-15', orders: 1, refunds: 0 }),
      },
      createEnv(db) as any
    );

    const json = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.date).toBe('2026-01-15');
    expect(json.created).toBeDefined();
  });

  it('returns 400 for invalid date', async () => {
    const { app, createEnv } = createApp('true');

    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(function (this: any) { return this; }),
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({ success: true, meta: { last_row_id: 1, changes: 1 } })),
        all: vi.fn(async () => ({ results: [] })),
      })),
    };

    const res = await app.request(
      '/dev/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: 'not-a-date' }),
      },
      createEnv(db) as any
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.ok).toBe(false);
    expect(json.message).toContain('Invalid date');
  });

  it('works with empty body', async () => {
    const { app, createEnv } = createApp('true');

    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(function (this: any) { return this; }),
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({
          success: true,
          meta: { last_row_id: 1, changes: 1 },
        })),
        all: vi.fn(async () => ({ results: [] })),
      })),
    };

    const res = await app.request(
      '/dev/seed',
      { method: 'POST' },
      createEnv(db) as any
    );

    const json = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.date).toBeTruthy();
  });
});
