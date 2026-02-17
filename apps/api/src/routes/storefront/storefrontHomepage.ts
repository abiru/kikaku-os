import { Hono } from 'hono';
import type { Env } from '../../env';
import { jsonOk } from '../../lib/http';
import type { HeroSectionRow, FeaturedProductRow } from './storefrontTypes';
import { resolveAssetUrl, extractImageUrl } from './storefrontUtils';

const homepage = new Hono<Env>();

// GET /home/heroes - Fetch active hero sections for homepage
homepage.get('/home/heroes', async (c) => {
  const res = await c.env.DB.prepare(`
    SELECT id, title, subtitle,
           image_r2_key, image_r2_key_small,
           cta_primary_text, cta_primary_url,
           cta_secondary_text, cta_secondary_url,
           position
    FROM home_hero_sections
    WHERE status = 'active'
    ORDER BY position ASC
  `).all<HeroSectionRow>();

  const baseUrl = new URL(c.req.url).origin;
  const heroes = (res.results || []).map((hero) => ({
    ...hero,
    image: hero.image_r2_key
      ? resolveAssetUrl(hero.image_r2_key, baseUrl)
      : null,
    imageSmall: hero.image_r2_key_small
      ? resolveAssetUrl(hero.image_r2_key_small, baseUrl)
      : null
  }));

  return jsonOk(c, { heroes });
});

// GET /home/featured-categories - Fetch featured products for category grid
homepage.get('/home/featured-categories', async (c) => {
  const res = await c.env.DB.prepare(`
    SELECT p.id, p.title, p.description, p.category, p.metadata as product_metadata,
           pi.r2_key
    FROM products p
    LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.position = 0
    WHERE p.status = 'active' AND p.featured = 1
    ORDER BY p.category, p.created_at DESC
  `).all<FeaturedProductRow>();

  const baseUrl = new URL(c.req.url).origin;
  const products = (res.results || []).map((product) => ({
    ...product,
    image: product.r2_key
      ? resolveAssetUrl(product.r2_key, baseUrl)
      : extractImageUrl(product.product_metadata)
  }));

  return jsonOk(c, { products });
});

export default homepage;
