import { Hono } from 'hono';
import { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { getActor } from '../../middleware/clerkAuth';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../lib/schemas';
import { parseCSV, parseJSON, ImageMapping } from '../../services/bulkImageUpload';

const app = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
app.use('*', loadRbac);

// POST /admin/bulk-image-upload/parse - Parse and validate CSV/JSON file
app.post('/parse', requirePermission(PERMISSIONS.PRODUCTS_WRITE), async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return jsonError(c, 'Content-Type must be multipart/form-data', 400);
    }

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return jsonError(c, 'No file provided', 400);
    }

    const filename = file.name.toLowerCase();
    const content = await file.text();

    let parseResult;

    if (filename.endsWith('.csv')) {
      parseResult = await parseCSV(content, c.env.DB);
    } else if (filename.endsWith('.json')) {
      parseResult = await parseJSON(content, c.env.DB);
    } else {
      return jsonError(c, 'File must be .csv or .json', 400);
    }

    // Log the parse attempt
    await c.env.DB.prepare(
      'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
    ).bind(
      getActor(c),
      'bulk_image_upload_parse',
      'bulk_upload',
      JSON.stringify({
        filename: file.name,
        total_products: parseResult.summary.total_products,
        total_images: parseResult.summary.total_images,
        errors: parseResult.errors.length
      })
    ).run();

    return jsonOk(c, parseResult);
  } catch (e) {
    console.error('Parse error:', e);
    return jsonError(c, 'Failed to parse file');
  }
});

// POST /admin/bulk-image-upload/execute - Create inbox item for approval
app.post('/execute', requirePermission(PERMISSIONS.PRODUCTS_WRITE), async (c) => {
  try {
    const body = await c.req.json<{
      mappings: ImageMapping[];
      batch_name?: string;
    }>();

    if (!body.mappings || !Array.isArray(body.mappings) || body.mappings.length === 0) {
      return jsonError(c, 'No mappings provided', 400);
    }

    const totalImages = body.mappings.reduce((sum, m) => sum + m.image_urls.length, 0);

    const metadata = {
      upload_items: body.mappings,
      batch_name: body.batch_name || 'Bulk Image Upload',
      total_images: totalImages,
      requested_by: getActor(c),
      requested_at: new Date().toISOString()
    };

    const title = `Bulk Image Upload: ${body.mappings.length} products, ${totalImages} images`;
    const bodyText = `Batch: ${body.batch_name || 'Bulk Image Upload'}\n\nProducts:\n` +
      body.mappings.map(m =>
        `- ${m.product_title} (ID: ${m.product_id}): ${m.image_urls.length} images (existing: ${m.existing_r2_images})`
      ).join('\n');

    const result = await c.env.DB.prepare(
      `INSERT INTO inbox_items (title, body, severity, status, kind, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      title,
      bodyText,
      'info',
      'open',
      'bulk_image_upload',
      JSON.stringify(metadata)
    ).run();

    const inboxId = result.meta.last_row_id;

    // Log inbox creation
    await c.env.DB.prepare(
      'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
    ).bind(
      getActor(c),
      'bulk_image_upload_requested',
      `inbox:${inboxId}`,
      JSON.stringify({
        inbox_id: inboxId,
        products: body.mappings.length,
        images: totalImages
      })
    ).run();

    return jsonOk(c, {
      inbox_id: inboxId,
      message: `Created inbox item #${inboxId} for ${body.mappings.length} products (${totalImages} images)`
    });
  } catch (e) {
    console.error('Execute error:', e);
    return jsonError(c, 'Failed to create inbox item');
  }
});

export default app;
