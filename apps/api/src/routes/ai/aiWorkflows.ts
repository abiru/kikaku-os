import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { jsonError, jsonOk } from '../../lib/http';
import type { Env } from '../../env';
import { triageInboxItem, draftCustomerResponse } from '../../services/ai/workflowAutomation';

const aiWorkflows = new Hono<Env>();

// Validation error handler
const validationErrorHandler = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }, c: any) => {
  if (!result.success) {
    const messages = result.error?.issues.map((e) => e.message).join(', ') || 'Validation failed';
    return c.json({ ok: false, message: messages }, 400);
  }
};

/**
 * POST /ai/workflows/triage-inbox
 * Automatically triage an inbox item
 */
aiWorkflows.post(
  '/workflows/triage-inbox',
  zValidator('json', z.object({
    inboxItemId: z.number(),
  }), validationErrorHandler),
  async (c) => {
    try {
      const { inboxItemId } = c.req.valid('json');

      const result = await triageInboxItem(c.env, inboxItemId);

      return jsonOk(c, {
        classification: result.classification,
        suggestedAction: result.suggestedAction,
        reasoning: result.reasoning,
        message: 'Inbox item triaged successfully',
      });
    } catch (err) {
      console.error('Inbox triage failed:', err);
      return jsonError(c, (err as Error).message, 500);
    }
  }
);

/**
 * POST /ai/workflows/draft-response
 * Draft a customer inquiry response
 */
aiWorkflows.post(
  '/workflows/draft-response',
  zValidator('json', z.object({
    orderId: z.number(),
    customerMessage: z.string().min(1),
  }), validationErrorHandler),
  async (c) => {
    try {
      const { orderId, customerMessage } = c.req.valid('json');

      const result = await draftCustomerResponse(c.env, orderId, customerMessage);

      return jsonOk(c, {
        inboxItemId: result.inboxItemId,
        preview: result.draftContent.substring(0, 200),
        message: 'Email draft created. Check Inbox for approval.',
      });
    } catch (err) {
      console.error('Draft response failed:', err);
      return jsonError(c, (err as Error).message, 500);
    }
  }
);

/**
 * GET /ai/workflows/logs
 * Get AI workflow logs
 */
aiWorkflows.get('/workflows/logs', async (c) => {
  try {
    const workflowType = c.req.query('type');
    const limit = Math.min(Number(c.req.query('limit') || 50), 200);
    const offset = Number(c.req.query('offset') || 0);

    const where: string[] = [];
    const params: unknown[] = [];

    if (workflowType) {
      where.push('workflow_type=?');
      params.push(workflowType);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT id, workflow_type, trigger, action_taken, status, tokens_used, processing_time_ms, created_at
      FROM ai_workflow_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`;

    const result = await c.env.DB.prepare(sql).bind(...params, limit, offset).all();

    const countSql = `SELECT COUNT(*) as total FROM ai_workflow_logs ${whereClause}`;
    const countResult = await c.env.DB.prepare(countSql).bind(...params).first<{ total: number }>();

    return jsonOk(c, {
      logs: result.results || [],
      meta: {
        total: countResult?.total || 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error('Failed to fetch workflow logs:', err);
    return jsonError(c, 'Failed to fetch workflow logs');
  }
});

/**
 * GET /ai/workflows/usage
 * Get AI usage statistics
 */
aiWorkflows.get('/workflows/usage', async (c) => {
  try {
    const date = c.req.query('date') || new Date().toISOString().substring(0, 10);

    const result = await c.env.DB.prepare(
      `SELECT service, operation,
              COALESCE(SUM(request_count), 0) as requests,
              COALESCE(SUM(total_tokens), 0) as tokens,
              COALESCE(SUM(estimated_cost_cents), 0) as cost
       FROM ai_usage_tracking
       WHERE date LIKE ?
       GROUP BY service, operation
       ORDER BY cost DESC`
    ).bind(`${date}%`).all();

    const stats = result.results || [];
    const totalCost = stats.reduce((sum, item: any) => sum + (item.cost || 0), 0);
    const totalTokens = stats.reduce((sum, item: any) => sum + (item.tokens || 0), 0);
    const totalRequests = stats.reduce((sum, item: any) => sum + (item.requests || 0), 0);

    return jsonOk(c, {
      date,
      summary: {
        totalRequests,
        totalTokens,
        totalCostCents: totalCost,
        totalCostUSD: (totalCost / 100).toFixed(2),
      },
      breakdown: stats,
    });
  } catch (err) {
    console.error('Failed to fetch usage stats:', err);
    return jsonError(c, 'Failed to fetch usage stats');
  }
});

export default aiWorkflows;
