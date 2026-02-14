import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { getActor } from '../../middleware/clerkAuth';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { validationErrorHandler } from '../../lib/validation';
import { putImage, deleteKey } from '../../lib/r2';
import {
  productIdParamSchema,
  productImageParamSchema,
  updateImageOrderSchema,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  MAX_IMAGES_PER_PRODUCT,
  PERMISSIONS,
} from '../../lib/schemas';

const app = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
app.use('*', loadRbac);

type ProductImageRow = {
  id: number;
  product_id: number;
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  position: number;
  created_at: string;
  updated_at: string;
};

const getExtensionFromContentType = (contentType: string): string => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return map[contentType] || 'bin';
};

// GET /products/:id/images - List images for a product
app.get(
  '/products/:id/images',
  requirePermission(PERMISSIONS.PRODUCTS_READ),
  zValidator('param', productIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const product = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?')
        .bind(id)
        .first();

      if (!product) {
        return jsonError(c, 'Product not found', 404);
      }

      const imagesResult = await c.env.DB.prepare(
        `SELECT id, product_id, r2_key, filename, content_type, size_bytes, position, created_at, updated_at
         FROM product_images
         WHERE product_id = ?
         ORDER BY position ASC, id ASC`
      )
        .bind(id)
        .all<ProductImageRow>();

      const images = imagesResult.results || [];

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      )
        .bind(
          getActor(c),
          'view_product_images',
          `product:${id}`,
          JSON.stringify({ product_id: id, count: images.length })
        )
        .run();

      return jsonOk(c, { images });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to fetch images');
    }
  }
);

// POST /products/:id/images - Upload image(s)
app.post(
  '/products/:id/images',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('param', productIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const product = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?')
        .bind(id)
        .first();

      if (!product) {
        return jsonError(c, 'Product not found', 404);
      }

      // Check current image count
      const countResult = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM product_images WHERE product_id = ?'
      )
        .bind(id)
        .first<{ count: number }>();

      const currentCount = countResult?.count || 0;

      const contentType = c.req.header('content-type') || '';
      if (!contentType.includes('multipart/form-data')) {
        return jsonError(c, 'Content-Type must be multipart/form-data', 400);
      }

      const formData = await c.req.formData();
      const files = formData.getAll('file') as File[];

      if (files.length === 0) {
        return jsonError(c, 'No files provided', 400);
      }

      if (currentCount + files.length > MAX_IMAGES_PER_PRODUCT) {
        return jsonError(
          c,
          `Maximum ${MAX_IMAGES_PER_PRODUCT} images per product. Current: ${currentCount}`,
          400
        );
      }

      const uploadedImages: ProductImageRow[] = [];

      // Get next position
      const maxPosResult = await c.env.DB.prepare(
        'SELECT MAX(position) as max_pos FROM product_images WHERE product_id = ?'
      )
        .bind(id)
        .first<{ max_pos: number | null }>();

      let nextPosition = (maxPosResult?.max_pos ?? -1) + 1;

      for (const file of files) {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type as any)) {
          return jsonError(
            c,
            `Invalid file type: ${file.type}. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
            400
          );
        }

        if (file.size > MAX_IMAGE_SIZE) {
          return jsonError(
            c,
            `File ${file.name} exceeds maximum size of ${MAX_IMAGE_SIZE / 1024 / 1024}MB`,
            400
          );
        }

        const uuid = crypto.randomUUID();
        const ext = getExtensionFromContentType(file.type);
        const r2Key = `products/${id}/${uuid}.${ext}`;

        const arrayBuffer = await file.arrayBuffer();
        await putImage(c.env.R2, r2Key, arrayBuffer, file.type);

        const result = await c.env.DB.prepare(
          `INSERT INTO product_images (product_id, r2_key, filename, content_type, size_bytes, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        )
          .bind(id, r2Key, file.name, file.type, file.size, nextPosition)
          .run();

        const imageId = result.meta.last_row_id;
        const image = await c.env.DB.prepare(
          `SELECT id, product_id, r2_key, filename, content_type, size_bytes, position, created_at, updated_at
           FROM product_images WHERE id = ?`
        )
          .bind(imageId)
          .first<ProductImageRow>();

        if (image) {
          uploadedImages.push(image);
        }

        nextPosition++;
      }

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      )
        .bind(
          getActor(c),
          'upload_product_images',
          `product:${id}`,
          JSON.stringify({
            product_id: id,
            count: uploadedImages.length,
            filenames: uploadedImages.map((i) => i.filename),
          })
        )
        .run();

      return jsonOk(c, { images: uploadedImages });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to upload images');
    }
  }
);

// PUT /products/:id/images/order - Update image order
app.put(
  '/products/:id/images/order',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('param', productIdParamSchema, validationErrorHandler),
  zValidator('json', updateImageOrderSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const { imageIds } = c.req.valid('json');

    try {
      const product = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?')
        .bind(id)
        .first();

      if (!product) {
        return jsonError(c, 'Product not found', 404);
      }

      // Verify all images belong to this product
      const placeholders = imageIds.map(() => '?').join(',');
      const existingResult = await c.env.DB.prepare(
        `SELECT id FROM product_images WHERE product_id = ? AND id IN (${placeholders})`
      )
        .bind(id, ...imageIds)
        .all<{ id: number }>();

      const existingIds = new Set((existingResult.results || []).map((r) => r.id));
      const invalidIds = imageIds.filter((imgId) => !existingIds.has(imgId));

      if (invalidIds.length > 0) {
        return jsonError(c, `Invalid image IDs: ${invalidIds.join(', ')}`, 400);
      }

      // Update positions
      for (let i = 0; i < imageIds.length; i++) {
        await c.env.DB.prepare(
          `UPDATE product_images SET position = ?, updated_at = datetime('now') WHERE id = ?`
        )
          .bind(i, imageIds[i])
          .run();
      }

      // Fetch updated images
      const imagesResult = await c.env.DB.prepare(
        `SELECT id, product_id, r2_key, filename, content_type, size_bytes, position, created_at, updated_at
         FROM product_images
         WHERE product_id = ?
         ORDER BY position ASC, id ASC`
      )
        .bind(id)
        .all<ProductImageRow>();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      )
        .bind(
          getActor(c),
          'reorder_product_images',
          `product:${id}`,
          JSON.stringify({ product_id: id, new_order: imageIds })
        )
        .run();

      return jsonOk(c, { images: imagesResult.results || [] });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to update image order');
    }
  }
);

// DELETE /products/:id/images/:imageId - Delete image
app.delete(
  '/products/:id/images/:imageId',
  requirePermission(PERMISSIONS.PRODUCTS_DELETE),
  zValidator('param', productImageParamSchema, validationErrorHandler),
  async (c) => {
    const { id, imageId } = c.req.valid('param');

    try {
      const image = await c.env.DB.prepare(
        'SELECT id, r2_key, filename FROM product_images WHERE id = ? AND product_id = ?'
      )
        .bind(imageId, id)
        .first<{ id: number; r2_key: string; filename: string }>();

      if (!image) {
        return jsonError(c, 'Image not found', 404);
      }

      // Delete from R2
      await deleteKey(c.env.R2, image.r2_key);

      // Delete from DB
      await c.env.DB.prepare('DELETE FROM product_images WHERE id = ?')
        .bind(imageId)
        .run();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      )
        .bind(
          getActor(c),
          'delete_product_image',
          `image:${imageId}`,
          JSON.stringify({ product_id: id, filename: image.filename, r2_key: image.r2_key })
        )
        .run();

      return jsonOk(c, { deleted: true });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to delete image');
    }
  }
);

export default app;
