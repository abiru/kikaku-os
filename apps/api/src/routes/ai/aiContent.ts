import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { jsonError, jsonOk } from '../../lib/http';
import type { Env } from '../../env';
import { generateContent } from '../../services/ai/contentGeneration';

const aiContent = new Hono<Env>();

// Validation error handler
const validationErrorHandler = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }, c: any) => {
  if (!result.success) {
    const messages = result.error?.issues.map((e) => e.message).join(', ') || 'Validation failed';
    return c.json({ ok: false, message: messages }, 400);
  }
};

// Validation schema for content generation
const generateSchema = z.object({
  type: z.enum(['product_description', 'email', 'report_summary', 'marketing_copy']),
  refType: z.string().optional(),
  refId: z.number().optional(),
  prompt: z.string().min(1),
  context: z.record(z.string(), z.unknown()),
  temperature: z.number().min(0).max(1).optional(),
});

// Validation schema for regenerate
const regenerateSchema = z.object({
  modifiedPrompt: z.string().min(1).max(5000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /ai/content/generate
 * Generate AI content with Inbox approval
 */
aiContent.post(
  '/content/generate',
  zValidator('json', generateSchema, validationErrorHandler),
  async (c) => {
    try {
      const body = c.req.valid('json');

      const result = await generateContent(c.env, {
        contentType: body.type,
        refType: body.refType,
        refId: body.refId,
        prompt: body.prompt,
        context: body.context,
        temperature: body.temperature,
      });

      return jsonOk(c, {
        inboxItemId: result.inboxItemId,
        draftId: result.draftId,
        preview: result.preview,
        message: 'Content generated successfully. Check Inbox for approval.',
      });
    } catch (err) {
      console.error('Content generation failed:', err);
      return jsonError(c, (err as Error).message, 500);
    }
  }
);

/**
 * GET /ai/content/drafts
 * List AI content drafts
 */
aiContent.get('/content/drafts', async (c) => {
  try {
    const type = c.req.query('type');
    const status = c.req.query('status') || 'pending';
    const limit = Math.min(Number(c.req.query('limit') || 50), 200);
    const offset = Number(c.req.query('offset') || 0);

    const where: string[] = ['status=?'];
    const params: unknown[] = [status];

    if (type) {
      where.push('content_type=?');
      params.push(type);
    }

    const sql = `SELECT id, content_type, ref_type, ref_id, status, model_used, tokens_used, generation_time_ms, created_at
      FROM ai_content_drafts
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`;

    const result = await c.env.DB.prepare(sql).bind(...params, limit, offset).all();

    const countSql = `SELECT COUNT(*) as total FROM ai_content_drafts WHERE ${where.join(' AND ')}`;
    const countResult = await c.env.DB.prepare(countSql).bind(...params).first<{ total: number }>();

    return jsonOk(c, {
      drafts: result.results || [],
      meta: {
        total: countResult?.total || 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error('Failed to fetch drafts:', err);
    return jsonError(c, 'Failed to fetch drafts');
  }
});

/**
 * GET /ai/content/drafts/:id
 * Get draft details
 */
aiContent.get('/content/drafts/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'));

    const draft = await c.env.DB.prepare(
      `SELECT * FROM ai_content_drafts WHERE id = ?`
    ).bind(id).first();

    if (!draft) {
      return jsonError(c, 'Draft not found', 404);
    }

    return jsonOk(c, { draft });
  } catch (err) {
    console.error('Failed to fetch draft:', err);
    return jsonError(c, 'Failed to fetch draft');
  }
});

/**
 * POST /ai/content/drafts/:id/regenerate
 * Regenerate content with modified prompt
 */
aiContent.post(
  '/content/drafts/:id/regenerate',
  zValidator('json', regenerateSchema, validationErrorHandler),
  async (c) => {
    try {
      const id = Number(c.req.param('id'));
      const body = c.req.valid('json');

    // Fetch original draft
    const originalDraft = await c.env.DB.prepare(
      `SELECT content_type, ref_type, ref_id, prompt, metadata FROM ai_content_drafts WHERE id = ?`
    ).bind(id).first<{
      content_type: string;
      ref_type: string | null;
      ref_id: number | null;
      prompt: string;
      metadata: string | null;
    }>();

    if (!originalDraft) {
      return jsonError(c, 'Original draft not found', 404);
    }

    const originalMetadata = originalDraft.metadata ? JSON.parse(originalDraft.metadata) : {};
    const newContext = body.context || originalMetadata;

    // Generate new content
    const result = await generateContent(c.env, {
      contentType: originalDraft.content_type as 'product_description' | 'email' | 'report_summary' | 'marketing_copy',
      refType: originalDraft.ref_type || undefined,
      refId: originalDraft.ref_id || undefined,
      prompt: body.modifiedPrompt || originalDraft.prompt,
      context: newContext,
    });

    // Mark original draft as superseded
    await c.env.DB.prepare(
      `UPDATE ai_content_drafts SET status = 'rejected', updated_at = datetime('now') WHERE id = ?`
    ).bind(id).run();

    return jsonOk(c, {
      inboxItemId: result.inboxItemId,
      draftId: result.draftId,
      preview: result.preview,
      message: 'Content regenerated successfully. Check Inbox for approval.',
    });
    } catch (err) {
      console.error('Content regeneration failed:', err);
      return jsonError(c, (err as Error).message, 500);
    }
  }
);

export default aiContent;
