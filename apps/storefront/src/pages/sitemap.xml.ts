import type { APIRoute } from 'astro';
import { getApiBase } from '../lib/api';

export const prerender = false;

const SITE_URL = 'https://led-kikaku.com';

const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/products', changefreq: 'daily', priority: '0.9' },
  { path: '/contact', changefreq: 'monthly', priority: '0.6' },
  { path: '/order-status', changefreq: 'monthly', priority: '0.5' },
  { path: '/faq', changefreq: 'monthly', priority: '0.5' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/legal-notice', changefreq: 'yearly', priority: '0.4' },
  { path: '/social', changefreq: 'monthly', priority: '0.4' },
  { path: '/wishlist', changefreq: 'weekly', priority: '0.5' },
  { path: '/cart', changefreq: 'weekly', priority: '0.5' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/refund', changefreq: 'yearly', priority: '0.3' },
];

type ProductRow = {
  id: number;
  updated_at: string;
};

type ProductListResponse = {
  products?: ProductRow[];
  meta?: {
    totalPages?: number;
  };
};

export const GET: APIRoute = async () => {
  const today = new Date().toISOString().slice(0, 10);

  let products: ProductRow[] = [];
  try {
    const apiBase = getApiBase();
    const perPage = 100;
    const firstRes = await fetch(`${apiBase}/store/products?page=1&perPage=${perPage}`);

    if (firstRes.ok) {
      const firstData = await firstRes.json() as ProductListResponse;
      const seen = new Set<number>();

      for (const product of firstData.products || []) {
        if (!seen.has(product.id)) {
          seen.add(product.id);
          products.push(product);
        }
      }

      const totalPages = Math.max(1, Number(firstData.meta?.totalPages || 1));
      for (let page = 2; page <= totalPages; page++) {
        const pageRes = await fetch(`${apiBase}/store/products?page=${page}&perPage=${perPage}`);
        if (!pageRes.ok) break;
        const pageData = await pageRes.json() as ProductListResponse;
        for (const product of pageData.products || []) {
          if (!seen.has(product.id)) {
            seen.add(product.id);
            products.push(product);
          }
        }
      }
    }
  } catch {
    // If API is unavailable, generate sitemap with static pages only
  }

  const urls = STATIC_PAGES.map(
    (page) =>
      `  <url>
    <loc>${SITE_URL}${page.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  );

  for (const product of products) {
    const lastmod = product.updated_at ? product.updated_at.slice(0, 10) : today;
    urls.push(
      `  <url>
    <loc>${SITE_URL}/products/${product.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
