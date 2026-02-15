import { vi } from 'vitest';
import { Hono } from 'hono';
import storefront from '../../../routes/storefront/storefront';

export type StorefrontRow = {
  product_id: number;
  product_title: string;
  product_description: string | null;
  variant_id: number;
  variant_title: string;
  sku: string | null;
  price_id: number;
  amount: number;
  currency: string;
  provider_price_id: string | null;
};

export type HeroSectionRow = {
  id: number;
  title: string;
  subtitle: string | null;
  image_r2_key: string | null;
  image_r2_key_small: string | null;
  cta_primary_text: string | null;
  cta_primary_url: string | null;
  cta_secondary_text: string | null;
  cta_secondary_url: string | null;
  position: number;
};

export type FeaturedProductRow = {
  id: number;
  title: string;
  description: string | null;
  category: string | null;
  r2_key: string | null;
};

export const createMockDb = (options: {
  productRows?: StorefrontRow[];
  orderRow?: {
    id: number;
    status: string;
    total_net: number;
    currency: string;
    created_at: string;
    customer_email: string | null;
  } | null;
  orderItems?: Array<{
    product_title: string;
    variant_title: string;
    quantity: number;
    unit_price: number;
  }>;
  categoryRows?: Array<{ category: string | null }>;
  priceRangeRow?: { minPrice: number | null; maxPrice: number | null };
  totalCount?: number;
  productIds?: Array<{ id: number }>;
  heroSections?: HeroSectionRow[];
  featuredProducts?: FeaturedProductRow[];
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('COUNT(DISTINCT p.id)')) {
            // Count query for pagination
            return { results: [] };
          }
          if (sql.includes('SELECT DISTINCT p.id')) {
            // Product IDs query for pagination
            return { results: options.productIds || [] };
          }
          if (sql.includes('FROM products')) {
            return { results: options.productRows || [] };
          }
          if (sql.includes('FROM order_items')) {
            return { results: options.orderItems || [] };
          }
          if (sql.includes('DISTINCT category')) {
            return { results: options.categoryRows || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(DISTINCT p.id)')) {
            // Count result for pagination
            return { total: options.totalCount ?? 0 };
          }
          if (sql.includes('FROM orders')) {
            return options.orderRow ?? null;
          }
          if (sql.includes('MIN(pr.amount)')) {
            return options.priceRangeRow ?? null;
          }
          return null;
        })
      })),
      all: vi.fn(async () => {
        if (sql.includes('COUNT(DISTINCT p.id)')) {
          return { results: [] };
        }
        if (sql.includes('SELECT DISTINCT p.id')) {
          return { results: options.productIds || [] };
        }
        if (sql.includes('FROM home_hero_sections')) {
          return { results: options.heroSections || [] };
        }
        if (sql.includes('p.featured = 1')) {
          return { results: options.featuredProducts || [] };
        }
        if (sql.includes('FROM products')) {
          return { results: options.productRows || [] };
        }
        if (sql.includes('DISTINCT category')) {
          return { results: options.categoryRows || [] };
        }
        return { results: [] };
      }),
      first: vi.fn(async () => {
        if (sql.includes('COUNT(DISTINCT p.id)')) {
          return { total: options.totalCount ?? 0 };
        }
        if (sql.includes('MIN(pr.amount)')) {
          return options.priceRangeRow ?? null;
        }
        return null;
      })
    }))
  };
};

export const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/store', storefront);
  return {
    app,
    fetch: (path: string) =>
      app.request(path, {}, { DB: db } as any)
  };
};
