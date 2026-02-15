import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { validationErrorHandler } from '../../lib/validation';
import { createLogger } from '../../lib/logger';
import { adGenerateRequestSchema, PERMISSIONS } from '../../lib/schemas';
import { generateAdCopy } from '../../services/claudeAds';
import adminAdsDrafts from './adminAdsDrafts';
import adminAdsHistory from './adminAdsHistory';

const logger = createLogger('admin-ads');
const app = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
app.use('*', loadRbac);

// POST /admin/ads/generate - Generate AI ad copy candidates
// Following Inbox Pattern: AI output requires human approval
app.post(
  '/generate',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('json', adGenerateRequestSchema, validationErrorHandler),
  async (c) => {
    const request = c.req.valid('json');

    try {
      const apiKey = c.env.CLAUDE_API_KEY;
      if (!apiKey) {
        return jsonError(c, 'Claude API key not configured', 500);
      }

      // Generate ad copy with Claude
      const { candidates, promptUsed } = await generateAdCopy(request, apiKey, {
        AI_GATEWAY_ACCOUNT_ID: c.env.AI_GATEWAY_ACCOUNT_ID,
        AI_GATEWAY_ID: c.env.AI_GATEWAY_ID,
      });

      // Following "AIは信頼しない" principle: Save to inbox for human approval
      const inboxItem = await c.env.DB.prepare(
        `INSERT INTO inbox_items (title, body, severity, status, kind, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         RETURNING id`
      ).bind(
        `AI Ad Copy Generated for ${request.productName}`,
        `Generated ${candidates.length} candidate variations for ${request.adType} ad`,
        'info',
        'open',
        'ad_generation',
        JSON.stringify({
          request,
          candidates,
          promptUsed,
          generatedAt: new Date().toISOString(),
        })
      ).first<{ id: number }>();

      if (!inboxItem) {
        return jsonError(c, 'Failed to create inbox item', 500);
      }

      return jsonOk(c, {
        inboxItemId: inboxItem.id,
        message: 'Ad copy generated successfully. Please review in inbox.',
      });

    } catch (error) {
      logger.error('Ad generation failed', { error: String(error) });
      return jsonError(c, `Ad generation failed: ${(error as Error).message}`, 500);
    }
  }
);

// Mount sub-routes for drafts CRUD and generation history
app.route('/drafts', adminAdsDrafts);
app.route('/drafts', adminAdsHistory);

export default app;
