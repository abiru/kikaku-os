import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { getActor } from '../../middleware/clerkAuth';
import { requirePermission } from '../../middleware/rbac';
import { validationErrorHandler } from '../../lib/validation';
import {
  adDraftIdParamSchema,
  selectHistorySchema,
  PERMISSIONS,
} from '../../lib/schemas';

const app = new Hono<Env>();

// GET /admin/ads/drafts/:id/history - Get generation history for a draft
app.get(
  '/:id/history',
  requirePermission(PERMISSIONS.PRODUCTS_READ),
  zValidator('param', adDraftIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      // Check if draft exists
      const draft = await c.env.DB.prepare(
        'SELECT id FROM ad_drafts WHERE id = ?'
      ).bind(id).first();

      if (!draft) {
        return jsonError(c, 'Ad draft not found', 404);
      }

      // Fetch history
      const { results } = await c.env.DB.prepare(
        `SELECT id, draft_id, prompt, generated_content, selected, created_at
         FROM ad_generation_history
         WHERE draft_id = ?
         ORDER BY created_at DESC`
      ).bind(id).all<{
        id: number;
        draft_id: number;
        prompt: string;
        generated_content: string;
        selected: number;
        created_at: string;
      }>();

      return jsonOk(c, { history: results });

    } catch (error) {
      console.error('Failed to fetch generation history:', error);
      return jsonError(c, 'Failed to fetch generation history', 500);
    }
  }
);

// POST /admin/ads/drafts/:id/select-history - Adopt a previous generation
app.post(
  '/:id/select-history',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('param', adDraftIdParamSchema, validationErrorHandler),
  zValidator('json', selectHistorySchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const { historyId } = c.req.valid('json');

    try {
      // Fetch history record
      const history = await c.env.DB.prepare(
        `SELECT id, draft_id, prompt, generated_content
         FROM ad_generation_history
         WHERE id = ? AND draft_id = ?`
      ).bind(historyId, id).first<{
        id: number;
        draft_id: number;
        prompt: string;
        generated_content: string;
      }>();

      if (!history) {
        return jsonError(c, 'History record not found or does not belong to this draft', 404);
      }

      // Parse generated content
      const content = JSON.parse(history.generated_content) as { candidates: Array<{
        headlines: string[];
        descriptions: string[];
        suggestedKeywords: string[];
      }> };

      if (!content.candidates || content.candidates.length === 0) {
        return jsonError(c, 'Invalid history content', 400);
      }

      // Use first candidate
      const candidate = content.candidates[0];

      // Update draft with candidate content
      await c.env.DB.prepare(
        `UPDATE ad_drafts
         SET headlines = ?,
             descriptions = ?,
             keywords = ?,
             last_prompt = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      ).bind(
        JSON.stringify(candidate.headlines),
        JSON.stringify(candidate.descriptions),
        JSON.stringify(candidate.suggestedKeywords),
        history.prompt,
        id
      ).run();

      // Mark history as selected (clear previous selections first)
      await c.env.DB.prepare(
        'UPDATE ad_generation_history SET selected = 0 WHERE draft_id = ?'
      ).bind(id).run();

      await c.env.DB.prepare(
        'UPDATE ad_generation_history SET selected = 1 WHERE id = ?'
      ).bind(historyId).run();

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
        'select_history_ad_draft',
        'ad_draft',
        id,
        JSON.stringify({ historyId })
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
      console.error('Failed to select history:', error);
      return jsonError(c, 'Failed to select history', 500);
    }
  }
);

export default app;
