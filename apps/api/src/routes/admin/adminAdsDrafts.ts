import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { getActor } from '../../middleware/clerkAuth';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { validationErrorHandler } from '../../lib/validation';
import { createLogger } from '../../lib/logger';
import {
  createAdDraftSchema,
  updateAdDraftSchema,
  adDraftIdParamSchema,
  adDraftListQuerySchema,
  PERMISSIONS,
} from '../../lib/schemas';
import { validateAdCopy } from '../../services/adValidation';

const logger = createLogger('admin-ads-drafts');
const app = new Hono<Env>();

// Apply RBAC middleware independently (defense-in-depth)
app.use('*', loadRbac);

// GET /admin/ads/drafts - List ad drafts
app.get(
  '/',
  requirePermission(PERMISSIONS.PRODUCTS_READ),
  zValidator('query', adDraftListQuerySchema, validationErrorHandler),
  async (c) => {
    const { q, status, page, perPage } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    try {
      const conditions: string[] = [];
      const bindings: (string | number)[] = [];

      if (q) {
        conditions.push('(campaign_name LIKE ? OR product_name LIKE ?)');
        bindings.push(`%${q}%`, `%${q}%`);
      }

      if (status !== 'all') {
        conditions.push('status = ?');
        bindings.push(status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count total
      const countRes = await c.env.DB.prepare(
        `SELECT COUNT(*) as count FROM ad_drafts ${whereClause}`
      ).bind(...bindings).first<{ count: number }>();

      const totalCount = countRes?.count || 0;
      const totalPages = Math.ceil(totalCount / perPage);

      // Fetch page
      const { results } = await c.env.DB.prepare(
        `SELECT id, campaign_name, ad_type, status, language, product_name, final_url, daily_budget, created_at, updated_at
         FROM ad_drafts
         ${whereClause}
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`
      ).bind(...bindings, perPage, offset).all();

      return jsonOk(c, {
        drafts: results,
        meta: { page, perPage, totalCount, totalPages },
      });

    } catch (error) {
      logger.error('Failed to list ad drafts', { error: String(error) });
      return jsonError(c, 'Failed to list ad drafts', 500);
    }
  }
);

// POST /admin/ads/drafts - Create ad draft
app.post(
  '/',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('json', createAdDraftSchema, validationErrorHandler),
  async (c) => {
    const data = c.req.valid('json');

    try {
      // Validate ad copy
      const validation = validateAdCopy(
        data.headlines,
        data.descriptions,
        data.final_url,
        data.language
      );

      if (!validation.valid) {
        return jsonError(c, `Validation failed: ${validation.errors.join(', ')}`, 400);
      }

      // Create draft
      const draft = await c.env.DB.prepare(
        `INSERT INTO ad_drafts (
          campaign_name, ad_type, status, language,
          product_id, product_name, product_description, target_audience,
          headlines, descriptions, keywords,
          final_url, daily_budget, tone, last_prompt, metadata,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        RETURNING id, campaign_name, ad_type, status, language, product_id, product_name,
                  product_description, target_audience, headlines, descriptions, keywords,
                  final_url, daily_budget, tone, last_prompt, metadata, created_at, updated_at`
      ).bind(
        data.campaign_name,
        data.ad_type,
        data.status,
        data.language,
        data.product_id || null,
        data.product_name || null,
        data.product_description || null,
        data.target_audience || null,
        JSON.stringify(data.headlines),
        JSON.stringify(data.descriptions),
        data.keywords ? JSON.stringify(data.keywords) : null,
        data.final_url,
        data.daily_budget || null,
        data.tone || null,
        data.last_prompt || null,
        data.metadata ? JSON.stringify(data.metadata) : null
      ).first<{
        id: number;
        campaign_name: string;
        ad_type: string;
        status: string;
        language: string;
        product_id: number | null;
        product_name: string | null;
        product_description: string | null;
        target_audience: string | null;
        headlines: string;
        descriptions: string;
        keywords: string | null;
        final_url: string;
        daily_budget: number | null;
        tone: string | null;
        last_prompt: string | null;
        metadata: string | null;
        created_at: string;
        updated_at: string;
      }>();

      if (!draft) {
        return jsonError(c, 'Failed to create ad draft', 500);
      }

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, target_id, metadata) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'create_ad_draft',
        'ad_draft',
        draft.id,
        JSON.stringify({ campaign_name: draft.campaign_name })
      ).run();

      // Parse JSON fields
      const parsedDraft = {
        ...draft,
        headlines: JSON.parse(draft.headlines),
        descriptions: JSON.parse(draft.descriptions),
        keywords: draft.keywords ? JSON.parse(draft.keywords) : null,
        metadata: draft.metadata ? JSON.parse(draft.metadata) : null,
      };

      return c.json(parsedDraft, 201);

    } catch (error) {
      logger.error('Failed to create ad draft', { error: String(error) });
      return jsonError(c, 'Failed to create ad draft', 500);
    }
  }
);

// GET /admin/ads/drafts/:id - Get single ad draft
app.get(
  '/:id',
  requirePermission(PERMISSIONS.PRODUCTS_READ),
  zValidator('param', adDraftIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const draft = await c.env.DB.prepare(
        `SELECT id, campaign_name, ad_type, status, language,
                product_id, product_name, product_description, target_audience,
                headlines, descriptions, keywords,
                final_url, daily_budget, tone, last_prompt, metadata,
                created_at, updated_at
         FROM ad_drafts
         WHERE id = ?`
      ).bind(id).first<{
        id: number;
        campaign_name: string;
        ad_type: string;
        status: string;
        language: string;
        product_id: number | null;
        product_name: string | null;
        product_description: string | null;
        target_audience: string | null;
        headlines: string;
        descriptions: string;
        keywords: string | null;
        final_url: string;
        daily_budget: number | null;
        tone: string | null;
        last_prompt: string | null;
        metadata: string | null;
        created_at: string;
        updated_at: string;
      }>();

      if (!draft) {
        return jsonError(c, 'Ad draft not found', 404);
      }

      // Parse JSON fields
      const parsedDraft = {
        ...draft,
        headlines: JSON.parse(draft.headlines),
        descriptions: JSON.parse(draft.descriptions),
        keywords: draft.keywords ? JSON.parse(draft.keywords) : null,
        metadata: draft.metadata ? JSON.parse(draft.metadata) : null,
      };

      return jsonOk(c, { draft: parsedDraft });

    } catch (error) {
      logger.error('Failed to fetch ad draft', { error: String(error) });
      return jsonError(c, 'Failed to fetch ad draft', 500);
    }
  }
);

// PUT /admin/ads/drafts/:id - Update ad draft
app.put(
  '/:id',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('param', adDraftIdParamSchema, validationErrorHandler),
  zValidator('json', updateAdDraftSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');

    try {
      // Check if draft exists
      const existing = await c.env.DB.prepare(
        'SELECT id FROM ad_drafts WHERE id = ?'
      ).bind(id).first();

      if (!existing) {
        return jsonError(c, 'Ad draft not found', 404);
      }

      // Validate ad copy if headlines/descriptions/finalUrl/language provided
      if (data.headlines || data.descriptions || data.final_url || data.language) {
        // Fetch current values for validation
        const current = await c.env.DB.prepare(
          'SELECT headlines, descriptions, final_url, language FROM ad_drafts WHERE id = ?'
        ).bind(id).first<{
          headlines: string;
          descriptions: string;
          final_url: string;
          language: string;
        }>();

        if (current) {
          const headlines = data.headlines || JSON.parse(current.headlines);
          const descriptions = data.descriptions || JSON.parse(current.descriptions);
          const finalUrl = data.final_url || current.final_url;
          const language = (data.language || current.language) as 'ja' | 'en';

          const validation = validateAdCopy(headlines, descriptions, finalUrl, language);
          if (!validation.valid) {
            return jsonError(c, `Validation failed: ${validation.errors.join(', ')}`, 400);
          }
        }
      }

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];

      if (data.campaign_name !== undefined) {
        updates.push('campaign_name = ?');
        values.push(data.campaign_name);
      }
      if (data.ad_type !== undefined) {
        updates.push('ad_type = ?');
        values.push(data.ad_type);
      }
      if (data.status !== undefined) {
        updates.push('status = ?');
        values.push(data.status);
      }
      if (data.language !== undefined) {
        updates.push('language = ?');
        values.push(data.language);
      }
      if (data.product_id !== undefined) {
        updates.push('product_id = ?');
        values.push(data.product_id);
      }
      if (data.product_name !== undefined) {
        updates.push('product_name = ?');
        values.push(data.product_name);
      }
      if (data.product_description !== undefined) {
        updates.push('product_description = ?');
        values.push(data.product_description);
      }
      if (data.target_audience !== undefined) {
        updates.push('target_audience = ?');
        values.push(data.target_audience);
      }
      if (data.headlines !== undefined) {
        updates.push('headlines = ?');
        values.push(JSON.stringify(data.headlines));
      }
      if (data.descriptions !== undefined) {
        updates.push('descriptions = ?');
        values.push(JSON.stringify(data.descriptions));
      }
      if (data.keywords !== undefined) {
        updates.push('keywords = ?');
        values.push(data.keywords ? JSON.stringify(data.keywords) : null);
      }
      if (data.final_url !== undefined) {
        updates.push('final_url = ?');
        values.push(data.final_url);
      }
      if (data.daily_budget !== undefined) {
        updates.push('daily_budget = ?');
        values.push(data.daily_budget);
      }
      if (data.tone !== undefined) {
        updates.push('tone = ?');
        values.push(data.tone);
      }
      if (data.last_prompt !== undefined) {
        updates.push('last_prompt = ?');
        values.push(data.last_prompt);
      }
      if (data.metadata !== undefined) {
        updates.push('metadata = ?');
        values.push(data.metadata ? JSON.stringify(data.metadata) : null);
      }

      // Always update updated_at
      updates.push('updated_at = datetime(\'now\')');
      values.push(id);

      // Execute update
      await c.env.DB.prepare(
        `UPDATE ad_drafts SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...values).run();

      // Fetch updated draft
      const updated = await c.env.DB.prepare(
        `SELECT id, campaign_name, ad_type, status, language,
                product_id, product_name, product_description, target_audience,
                headlines, descriptions, keywords,
                final_url, daily_budget, tone, last_prompt, metadata,
                created_at, updated_at
         FROM ad_drafts
         WHERE id = ?`
      ).bind(id).first<{
        id: number;
        campaign_name: string;
        ad_type: string;
        status: string;
        language: string;
        product_id: number | null;
        product_name: string | null;
        product_description: string | null;
        target_audience: string | null;
        headlines: string;
        descriptions: string;
        keywords: string | null;
        final_url: string;
        daily_budget: number | null;
        tone: string | null;
        last_prompt: string | null;
        metadata: string | null;
        created_at: string;
        updated_at: string;
      }>();

      if (!updated) {
        return jsonError(c, 'Failed to fetch updated draft', 500);
      }

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, target_id, metadata) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'update_ad_draft',
        'ad_draft',
        id,
        JSON.stringify({ campaign_name: updated.campaign_name })
      ).run();

      // Parse JSON fields
      const parsedDraft = {
        ...updated,
        headlines: JSON.parse(updated.headlines),
        descriptions: JSON.parse(updated.descriptions),
        keywords: updated.keywords ? JSON.parse(updated.keywords) : null,
        metadata: updated.metadata ? JSON.parse(updated.metadata) : null,
      };

      return jsonOk(c, { draft: parsedDraft });

    } catch (error) {
      logger.error('Failed to update ad draft', { error: String(error) });
      return jsonError(c, 'Failed to update ad draft', 500);
    }
  }
);

// DELETE /admin/ads/drafts/:id - Delete ad draft
app.delete(
  '/:id',
  requirePermission(PERMISSIONS.PRODUCTS_DELETE),
  zValidator('param', adDraftIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      // Check if draft exists
      const existing = await c.env.DB.prepare(
        'SELECT id, campaign_name FROM ad_drafts WHERE id = ?'
      ).bind(id).first<{ id: number; campaign_name: string }>();

      if (!existing) {
        return jsonError(c, 'Ad draft not found', 404);
      }

      // Delete draft (hard delete)
      await c.env.DB.prepare(
        'DELETE FROM ad_drafts WHERE id = ?'
      ).bind(id).run();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, target_id, metadata) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'delete_ad_draft',
        'ad_draft',
        id,
        JSON.stringify({ campaign_name: existing.campaign_name })
      ).run();

      return jsonOk(c, { deleted: true });

    } catch (error) {
      logger.error('Failed to delete ad draft', { error: String(error) });
      return jsonError(c, 'Failed to delete ad draft', 500);
    }
  }
);

export default app;
