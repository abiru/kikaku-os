import { Hono } from 'hono';
import { jsonError, jsonOk } from '../../lib/http';
import type { Env } from '../../env';
import { getActor } from '../../middleware/clerkAuth';
import { executeBulkImageUpload, type ImageMapping } from '../../services/bulkImageUpload';

const inbox = new Hono<Env>();

inbox.get('/inbox', async (c) => {
  const status = c.req.query('status') || 'open';
  const kind = c.req.query('kind');
  const date = c.req.query('date');
  const severity = c.req.query('severity');
  const requested = Number(c.req.query('limit') || 100);
  const limit = Math.min(Math.max(requested, 1), 200);
  try {
    const where: string[] = ['status=?'];
    const params: unknown[] = [status];
    if (kind) {
      where.push('kind=?');
      params.push(kind);
    }
    if (date) {
      where.push('date=?');
      params.push(date);
    }
    if (severity) {
      where.push('severity=?');
      params.push(severity);
    }
    const sql = `SELECT id, title, body, severity, status, kind, date, created_at
      FROM inbox_items
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ?`;
    const stmt = c.env.DB.prepare(sql);
    const res = await stmt.bind(...params, limit).all();
    return jsonOk(c, { items: res.results || [] });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to fetch inbox');
  }
});

// Create new inbox item
inbox.post('/inbox', async (c) => {
  try {
    const body = await c.req.json<{
      title: string;
      body?: string;
      severity?: string;
      kind?: string;
      date?: string;
      metadata?: string;
    }>();

    if (!body.title) {
      return jsonError(c, 'Title is required', 400);
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO inbox_items (title, body, severity, kind, date, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      body.title,
      body.body || null,
      body.severity || 'info',
      body.kind || null,
      body.date || null,
      body.metadata || null
    ).run();

    return jsonOk(c, { id: result.meta.last_row_id });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to create inbox item');
  }
});

type InboxItem = {
  id: number;
  kind: string | null;
  metadata: string | null;
};

inbox.post('/inbox/:id/approve', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    // Get inbox item to check kind and metadata
    const item = await c.env.DB.prepare(
      `SELECT id, kind, metadata FROM inbox_items WHERE id = ?`
    ).bind(id).first<InboxItem>();

    if (!item) {
      return jsonError(c, 'Inbox item not found', 404);
    }

    // Handle product_update kind
    if (item.kind === 'product_update' && item.metadata) {
      try {
        const meta = JSON.parse(item.metadata);
        const productId = meta.product_id;

        if (productId) {
          // Get current product metadata
          const product = await c.env.DB.prepare(
            `SELECT metadata FROM products WHERE id = ?`
          ).bind(productId).first<{ metadata: string | null }>();

          const currentMeta = product?.metadata ? JSON.parse(product.metadata) : {};

          // Merge new image_url into metadata
          const updatedMeta = {
            ...currentMeta,
            image_url: meta.image_url || currentMeta.image_url,
            specs: meta.specs || currentMeta.specs,
            source: meta.source || currentMeta.source,
            updated_from_web: new Date().toISOString()
          };

          // Update metadata
          await c.env.DB.prepare(
            `UPDATE products SET metadata = ?, updated_at = datetime('now') WHERE id = ?`
          ).bind(JSON.stringify(updatedMeta), productId).run();

          // Update title if provided
          if (meta.title) {
            await c.env.DB.prepare(
              `UPDATE products SET title = ?, updated_at = datetime('now') WHERE id = ?`
            ).bind(meta.title, productId).run();
          }

          // Update description if provided
          if (meta.description) {
            await c.env.DB.prepare(
              `UPDATE products SET description = ?, updated_at = datetime('now') WHERE id = ?`
            ).bind(meta.description, productId).run();
          }
        }
      } catch (parseErr) {
        console.error('Failed to parse inbox metadata:', parseErr);
      }
    }

    // Handle ad_generation kind
    if (item.kind === 'ad_generation' && item.metadata) {
      try {
        const meta = JSON.parse(item.metadata);
        const { request, candidates, promptUsed } = meta;

        // Save to ad_generation_history
        await c.env.DB.prepare(
          `INSERT INTO ad_generation_history (draft_id, prompt, generated_content, selected, created_at)
           VALUES (?, ?, ?, 1, datetime('now'))`
        ).bind(
          request.draftId || null,
          promptUsed,
          JSON.stringify({ candidates })
        ).run();

        // If draftId is provided, optionally update the draft with first candidate
        // (Admin can manually select different candidate later)
        if (request.draftId && candidates && candidates.length > 0) {
          const firstCandidate = candidates[0];
          await c.env.DB.prepare(
            `UPDATE ad_drafts
             SET headlines = ?,
                 descriptions = ?,
                 keywords = ?,
                 last_prompt = ?,
                 updated_at = datetime('now')
             WHERE id = ?`
          ).bind(
            JSON.stringify(firstCandidate.headlines),
            JSON.stringify(firstCandidate.descriptions),
            JSON.stringify(firstCandidate.suggestedKeywords),
            promptUsed,
            request.draftId
          ).run();
        }
      } catch (parseErr) {
        console.error('Failed to process ad_generation inbox item:', parseErr);
      }
    }

    // Handle bulk_image_upload kind
    if (item.kind === 'bulk_image_upload' && item.metadata) {
      try {
        const meta = JSON.parse(item.metadata);
        const uploadItems: ImageMapping[] = meta.upload_items || [];

        if (uploadItems.length > 0) {
          const results = await executeBulkImageUpload(
            c.env.DB,
            c.env.R2,
            uploadItems
          );

          // Log the results to audit_logs
          await c.env.DB.prepare(
            'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
          ).bind(
            getActor(c),
            'bulk_image_upload_approved',
            'image_upload',
            JSON.stringify(results)
          ).run();

          // Update inbox item metadata with results
          const updatedMeta = {
            ...meta,
            results,
            executed_at: new Date().toISOString(),
            executed_by: getActor(c)
          };

          await c.env.DB.prepare(
            'UPDATE inbox_items SET metadata = ?, updated_at = datetime("now") WHERE id = ?'
          ).bind(
            JSON.stringify(updatedMeta),
            id
          ).run();
        }
      } catch (parseErr) {
        console.error('Failed to process bulk_image_upload inbox item:', parseErr);
      }
    }

    // Handle ai_content_draft kind (AI-generated content approval)
    if (item.kind === 'ai_content_draft' && item.metadata) {
      try {
        const meta = JSON.parse(item.metadata);
        const { draftId, contentType, refType, refId } = meta;

        if (draftId) {
          // Fetch the draft content
          const draft = await c.env.DB.prepare(
            `SELECT generated_content FROM ai_content_drafts WHERE id = ?`
          ).bind(draftId).first<{ generated_content: string }>();

          if (draft) {
            const generatedText = draft.generated_content;

            // Apply content based on type
            if (contentType === 'product_description' && refType === 'product' && refId) {
              // Parse JSON if needed
              let description = generatedText;
              try {
                const parsed = JSON.parse(generatedText);
                description = parsed.description || generatedText;
              } catch {
                // Use as-is if not JSON
              }

              await c.env.DB.prepare(
                `UPDATE products SET description = ?, updated_at = datetime('now') WHERE id = ?`
              ).bind(description, refId).run();
            }

            // Mark draft as approved and applied
            await c.env.DB.prepare(
              `UPDATE ai_content_drafts
               SET status = 'approved', approved_by = ?, approved_at = datetime('now'), applied_at = datetime('now'), updated_at = datetime('now')
               WHERE id = ?`
            ).bind(getActor(c), draftId).run();

            // Audit log
            await c.env.DB.prepare(
              `INSERT INTO audit_logs (actor, action, target, metadata)
               VALUES (?, ?, ?, ?)`
            ).bind(
              getActor(c),
              'approve_ai_content',
              contentType,
              JSON.stringify({ draftId, refType, refId })
            ).run();
          }
        }
      } catch (parseErr) {
        console.error('Failed to process ai_content_draft inbox item:', parseErr);
      }
    }

    // Handle ai_email_draft kind (AI-generated email approval)
    if (item.kind === 'ai_email_draft' && item.metadata) {
      try {
        const meta = JSON.parse(item.metadata);
        const { orderId, customerEmail, subject, body } = meta;

        // In a real implementation, you would send the email here via Resend
        // For now, just log the approval
        console.log(`Email approved for order ${orderId}: ${subject}`);

        // Audit log
        await c.env.DB.prepare(
          `INSERT INTO audit_logs (actor, action, target, metadata)
           VALUES (?, ?, ?, ?)`
        ).bind(
          getActor(c),
          'approve_ai_email',
          'email',
          JSON.stringify({ orderId, customerEmail, subject })
        ).run();
      } catch (parseErr) {
        console.error('Failed to process ai_email_draft inbox item:', parseErr);
      }
    }

    // Handle ai_budget_alert kind (acknowledge budget alert)
    if (item.kind === 'ai_budget_alert' && item.metadata) {
      try {
        const meta = JSON.parse(item.metadata);
        console.log(`AI budget alert acknowledged: ${meta.percentage}% used`);

        // Audit log
        await c.env.DB.prepare(
          `INSERT INTO audit_logs (actor, action, target, metadata)
           VALUES (?, ?, ?, ?)`
        ).bind(
          getActor(c),
          'acknowledge_ai_budget_alert',
          'ai_usage',
          JSON.stringify(meta)
        ).run();
      } catch (parseErr) {
        console.error('Failed to process ai_budget_alert inbox item:', parseErr);
      }
    }

    // Update inbox status
    await c.env.DB.prepare(
      `UPDATE inbox_items SET status='approved', decided_by=?, decided_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
    ).bind(getActor(c), id).run();

    return jsonOk(c, { applied: item.kind === 'product_update' });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to approve');
  }
});

inbox.post('/inbox/:id/reject', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    await c.env.DB.prepare(
      `UPDATE inbox_items SET status='rejected', decided_by=?, decided_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
    ).bind(getActor(c), id).run();
    return jsonOk(c, {});
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to reject');
  }
});

export default inbox;
