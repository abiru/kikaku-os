import { executeBulkImageUpload, type ImageMapping } from './bulkImageUpload';
import { createLogger } from '../lib/logger';

const logger = createLogger('inbox-handlers');

type ApproveContext = {
  db: D1Database;
  r2: R2Bucket;
  actor: string;
  itemId: number;
  metadata: string;
};

const handleProductUpdate = async (ctx: ApproveContext): Promise<void> => {
  const meta = JSON.parse(ctx.metadata);
  const productId = meta.product_id;
  if (!productId) return;

  const product = await ctx.db.prepare(
    `SELECT metadata FROM products WHERE id = ?`
  ).bind(productId).first<{ metadata: string | null }>();

  const currentMeta = product?.metadata ? JSON.parse(product.metadata) : {};
  const updatedMeta = {
    ...currentMeta,
    image_url: meta.image_url || currentMeta.image_url,
    specs: meta.specs || currentMeta.specs,
    source: meta.source || currentMeta.source,
    updated_from_web: new Date().toISOString(),
  };

  await ctx.db.prepare(
    `UPDATE products SET metadata = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(JSON.stringify(updatedMeta), productId).run();

  if (meta.title) {
    await ctx.db.prepare(
      `UPDATE products SET title = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(meta.title, productId).run();
  }

  if (meta.description) {
    await ctx.db.prepare(
      `UPDATE products SET description = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(meta.description, productId).run();
  }
};

const handleAdGeneration = async (ctx: ApproveContext): Promise<void> => {
  const meta = JSON.parse(ctx.metadata);
  const { request, candidates, promptUsed } = meta;

  await ctx.db.prepare(
    `INSERT INTO ad_generation_history (draft_id, prompt, generated_content, selected, created_at)
     VALUES (?, ?, ?, 1, datetime('now'))`
  ).bind(
    request.draftId || null,
    promptUsed,
    JSON.stringify({ candidates }),
  ).run();

  if (request.draftId && candidates && candidates.length > 0) {
    const firstCandidate = candidates[0];
    await ctx.db.prepare(
      `UPDATE ad_drafts
       SET headlines = ?, descriptions = ?, keywords = ?, last_prompt = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).bind(
      JSON.stringify(firstCandidate.headlines),
      JSON.stringify(firstCandidate.descriptions),
      JSON.stringify(firstCandidate.suggestedKeywords),
      promptUsed,
      request.draftId,
    ).run();
  }
};

const handleBulkImageUpload = async (ctx: ApproveContext): Promise<void> => {
  const meta = JSON.parse(ctx.metadata);
  const uploadItems: ImageMapping[] = meta.upload_items || [];
  if (uploadItems.length === 0) return;

  const results = await executeBulkImageUpload(ctx.db, ctx.r2, uploadItems);

  await ctx.db.prepare(
    'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
  ).bind(ctx.actor, 'bulk_image_upload_approved', 'image_upload', JSON.stringify(results)).run();

  const updatedMeta = {
    ...meta,
    results,
    executed_at: new Date().toISOString(),
    executed_by: ctx.actor,
  };

  await ctx.db.prepare(
    'UPDATE inbox_items SET metadata = ?, updated_at = datetime("now") WHERE id = ?'
  ).bind(JSON.stringify(updatedMeta), ctx.itemId).run();
};

const handleAiContentDraft = async (ctx: ApproveContext): Promise<void> => {
  const meta = JSON.parse(ctx.metadata);
  const { draftId, contentType, refType, refId } = meta;
  if (!draftId) return;

  const draft = await ctx.db.prepare(
    `SELECT generated_content FROM ai_content_drafts WHERE id = ?`
  ).bind(draftId).first<{ generated_content: string }>();

  if (!draft) return;

  const generatedText = draft.generated_content;

  if (contentType === 'product_description' && refType === 'product' && refId) {
    let description = generatedText;
    try {
      const parsed = JSON.parse(generatedText);
      description = parsed.description || generatedText;
    } catch {
      // Use as-is if not JSON
    }

    await ctx.db.prepare(
      `UPDATE products SET description = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(description, refId).run();
  }

  await ctx.db.prepare(
    `UPDATE ai_content_drafts
     SET status = 'approved', approved_by = ?, approved_at = datetime('now'), applied_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).bind(ctx.actor, draftId).run();

  await ctx.db.prepare(
    `INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)`
  ).bind(ctx.actor, 'approve_ai_content', contentType, JSON.stringify({ draftId, refType, refId })).run();
};

const handleAiEmailDraft = async (ctx: ApproveContext): Promise<void> => {
  const meta = JSON.parse(ctx.metadata);
  const { orderId, customerEmail, subject } = meta;

  await ctx.db.prepare(
    `INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)`
  ).bind(ctx.actor, 'approve_ai_email', 'email', JSON.stringify({ orderId, customerEmail, subject })).run();
};

const handleAiBudgetAlert = async (ctx: ApproveContext): Promise<void> => {
  const meta = JSON.parse(ctx.metadata);

  await ctx.db.prepare(
    `INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)`
  ).bind(ctx.actor, 'acknowledge_ai_budget_alert', 'ai_usage', JSON.stringify(meta)).run();
};

const kindHandlers: Record<string, (ctx: ApproveContext) => Promise<void>> = {
  product_update: handleProductUpdate,
  ad_generation: handleAdGeneration,
  bulk_image_upload: handleBulkImageUpload,
  ai_content_draft: handleAiContentDraft,
  ai_email_draft: handleAiEmailDraft,
  ai_budget_alert: handleAiBudgetAlert,
};

export const dispatchApproval = async (ctx: ApproveContext, kind: string | null): Promise<void> => {
  if (!kind || !ctx.metadata) return;

  const handler = kindHandlers[kind];
  if (!handler) return;

  try {
    await handler(ctx);
  } catch (err) {
    logger.error(`Failed to process ${kind} inbox item`, { error: String(err) });
  }
};
