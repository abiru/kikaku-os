import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { getActor } from '../../middleware/clerkAuth';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { validationErrorHandler } from '../../lib/validation';
import { createLogger } from '../../lib/logger';
import { putImage, deleteKey } from '../../lib/r2';
import { PERMISSIONS } from '../../lib/schemas';
import { getExtensionFromContentType } from '../../lib/image';

const logger = createLogger('admin-heroes');
const app = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
app.use('*', loadRbac);

// Helper to transform empty strings to null
const emptyStringToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === '' ? null : val), schema);

// Validation schemas
const createHeroSchema = z.object({
  title: z.string().min(1).max(255),
  subtitle: emptyStringToNull(z.string().max(500).nullable().optional()),
  image_r2_key: emptyStringToNull(z.string().max(500).nullable().optional()),
  image_r2_key_small: emptyStringToNull(z.string().max(500).nullable().optional()),
  cta_primary_text: emptyStringToNull(z.string().max(100).nullable().optional()),
  cta_primary_url: emptyStringToNull(z.string().max(500).nullable().optional()),
  cta_secondary_text: emptyStringToNull(z.string().max(100).nullable().optional()),
  cta_secondary_url: emptyStringToNull(z.string().max(500).nullable().optional()),
  position: z.number().int().min(0).default(0),
  status: z.enum(['active', 'draft', 'archived']).default('active')
});

const updateHeroSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  subtitle: emptyStringToNull(z.string().max(500).nullable().optional()),
  image_r2_key: emptyStringToNull(z.string().max(500).nullable().optional()),
  image_r2_key_small: emptyStringToNull(z.string().max(500).nullable().optional()),
  cta_primary_text: emptyStringToNull(z.string().max(100).nullable().optional()),
  cta_primary_url: emptyStringToNull(z.string().max(500).nullable().optional()),
  cta_secondary_text: emptyStringToNull(z.string().max(100).nullable().optional()),
  cta_secondary_url: emptyStringToNull(z.string().max(500).nullable().optional()),
  position: z.number().int().min(0).optional(),
  status: z.enum(['active', 'draft', 'archived']).optional()
});

const heroIdParamSchema = z.object({
  id: z.string().transform(Number).pipe(z.number().int().positive())
});

const heroListQuerySchema = z.object({
  status: z.enum(['all', 'active', 'draft', 'archived']).default('all'),
  page: z.string().optional().default('1').transform(Number).pipe(z.number().int().positive()),
  perPage: z.string().optional().default('20').transform(Number).pipe(z.number().int().positive().max(100))
});

// Image upload constants
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// GET /home/heroes - List hero sections
app.get(
  '/home/heroes',
  requirePermission(PERMISSIONS.SETTINGS_READ),
  zValidator('query', heroListQuerySchema, validationErrorHandler),
  async (c) => {
    const { status, page, perPage } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    try {
      const conditions: string[] = [];
      const bindings: (string | number)[] = [];

      if (status !== 'all') {
        conditions.push('status = ?');
        bindings.push(status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countQuery = `SELECT COUNT(*) as count FROM home_hero_sections ${whereClause}`;
      const countRes = await c.env.DB.prepare(countQuery).bind(...bindings).first<{ count: number }>();
      const totalCount = countRes?.count || 0;

      const dataQuery = `
        SELECT id, title, subtitle, image_r2_key, image_r2_key_small,
               cta_primary_text, cta_primary_url, cta_secondary_text, cta_secondary_url,
               position, status, created_at, updated_at
        FROM home_hero_sections
        ${whereClause}
        ORDER BY position ASC, created_at DESC
        LIMIT ? OFFSET ?
      `;
      bindings.push(perPage, offset);

      const heroes = await c.env.DB.prepare(dataQuery).bind(...bindings).all();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'view_home_heroes',
        'admin_home_heroes_list',
        JSON.stringify({ status, page, perPage, count: heroes.results.length })
      ).run();

      return jsonOk(c, {
        heroes: heroes.results,
        meta: {
          page,
          perPage,
          totalCount,
          totalPages: Math.ceil(totalCount / perPage)
        }
      });
    } catch (e) {
      logger.error('Failed to fetch hero sections', { error: String(e) });
      return jsonError(c, 'Failed to fetch hero sections');
    }
  }
);

// GET /home/heroes/:id - Fetch single hero section
app.get(
  '/home/heroes/:id',
  requirePermission(PERMISSIONS.SETTINGS_READ),
  zValidator('param', heroIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const hero = await c.env.DB.prepare(`
        SELECT id, title, subtitle, image_r2_key, image_r2_key_small,
               cta_primary_text, cta_primary_url, cta_secondary_text, cta_secondary_url,
               position, status, created_at, updated_at
        FROM home_hero_sections
        WHERE id = ?
      `).bind(id).first();

      if (!hero) {
        return jsonError(c, 'Hero section not found', 404);
      }

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'view_home_hero',
        `home_hero_${id}`,
        JSON.stringify({ id })
      ).run();

      return jsonOk(c, { hero });
    } catch (e) {
      logger.error('Failed to fetch hero section', { error: String(e) });
      return jsonError(c, 'Failed to fetch hero section');
    }
  }
);

// POST /home/heroes - Create new hero section
app.post(
  '/home/heroes',
  requirePermission(PERMISSIONS.SETTINGS_WRITE),
  zValidator('json', createHeroSchema, validationErrorHandler),
  async (c) => {
    const data = c.req.valid('json');

    try {
      const result = await c.env.DB.prepare(`
        INSERT INTO home_hero_sections
        (title, subtitle, image_r2_key, image_r2_key_small,
         cta_primary_text, cta_primary_url, cta_secondary_text, cta_secondary_url,
         position, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        data.title,
        data.subtitle || null,
        data.image_r2_key || null,
        data.image_r2_key_small || null,
        data.cta_primary_text || null,
        data.cta_primary_url || null,
        data.cta_secondary_text || null,
        data.cta_secondary_url || null,
        data.position,
        data.status
      ).run();

      const heroId = result.meta.last_row_id;

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'create_home_hero',
        `home_hero_${heroId}`,
        JSON.stringify({ id: heroId, title: data.title })
      ).run();

      return jsonOk(c, { id: heroId, message: 'Hero section created' });
    } catch (e) {
      logger.error('Failed to create hero section', { error: String(e) });
      return jsonError(c, 'Failed to create hero section');
    }
  }
);

// PUT /home/heroes/:id - Update hero section
app.put(
  '/home/heroes/:id',
  requirePermission(PERMISSIONS.SETTINGS_WRITE),
  zValidator('param', heroIdParamSchema, validationErrorHandler),
  zValidator('json', updateHeroSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');

    try {
      // Check if hero exists
      const existing = await c.env.DB.prepare('SELECT id FROM home_hero_sections WHERE id = ?')
        .bind(id)
        .first();

      if (!existing) {
        return jsonError(c, 'Hero section not found', 404);
      }

      // Build update query dynamically
      const updates: string[] = [];
      const bindings: (string | number | null)[] = [];

      if (data.title !== undefined) {
        updates.push('title = ?');
        bindings.push(data.title);
      }
      if (data.subtitle !== undefined) {
        updates.push('subtitle = ?');
        bindings.push(data.subtitle || null);
      }
      if (data.image_r2_key !== undefined) {
        updates.push('image_r2_key = ?');
        bindings.push(data.image_r2_key || null);
      }
      if (data.image_r2_key_small !== undefined) {
        updates.push('image_r2_key_small = ?');
        bindings.push(data.image_r2_key_small || null);
      }
      if (data.cta_primary_text !== undefined) {
        updates.push('cta_primary_text = ?');
        bindings.push(data.cta_primary_text || null);
      }
      if (data.cta_primary_url !== undefined) {
        updates.push('cta_primary_url = ?');
        bindings.push(data.cta_primary_url || null);
      }
      if (data.cta_secondary_text !== undefined) {
        updates.push('cta_secondary_text = ?');
        bindings.push(data.cta_secondary_text || null);
      }
      if (data.cta_secondary_url !== undefined) {
        updates.push('cta_secondary_url = ?');
        bindings.push(data.cta_secondary_url || null);
      }
      if (data.position !== undefined) {
        updates.push('position = ?');
        bindings.push(data.position);
      }
      if (data.status !== undefined) {
        updates.push('status = ?');
        bindings.push(data.status);
      }

      if (updates.length === 0) {
        return jsonError(c, 'No fields to update');
      }

      updates.push('updated_at = datetime("now")');
      bindings.push(id);

      await c.env.DB.prepare(`
        UPDATE home_hero_sections
        SET ${updates.join(', ')}
        WHERE id = ?
      `).bind(...bindings).run();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'update_home_hero',
        `home_hero_${id}`,
        JSON.stringify({ id, updates: Object.keys(data) })
      ).run();

      return jsonOk(c, { message: 'Hero section updated' });
    } catch (e) {
      logger.error('Failed to update hero section', { error: String(e) });
      return jsonError(c, 'Failed to update hero section');
    }
  }
);

// DELETE /home/heroes/:id - Archive hero section (soft delete)
app.delete(
  '/home/heroes/:id',
  requirePermission(PERMISSIONS.SETTINGS_WRITE),
  zValidator('param', heroIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const existing = await c.env.DB.prepare('SELECT id, status FROM home_hero_sections WHERE id = ?')
        .bind(id)
        .first<{ id: number; status: string }>();

      if (!existing) {
        return jsonError(c, 'Hero section not found', 404);
      }

      await c.env.DB.prepare(`
        UPDATE home_hero_sections
        SET status = 'archived', updated_at = datetime('now')
        WHERE id = ?
      `).bind(id).run();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'archive_home_hero',
        `home_hero_${id}`,
        JSON.stringify({ id, previous_status: existing.status })
      ).run();

      return jsonOk(c, { message: 'Hero section archived' });
    } catch (e) {
      logger.error('Failed to archive hero section', { error: String(e) });
      return jsonError(c, 'Failed to archive hero section');
    }
  }
);

// POST /home/heroes/:id/restore - Restore archived hero section
app.post(
  '/home/heroes/:id/restore',
  requirePermission(PERMISSIONS.SETTINGS_WRITE),
  zValidator('param', heroIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const existing = await c.env.DB.prepare('SELECT id, status FROM home_hero_sections WHERE id = ?')
        .bind(id)
        .first<{ id: number; status: string }>();

      if (!existing) {
        return jsonError(c, 'Hero section not found', 404);
      }

      if (existing.status !== 'archived') {
        return jsonError(c, 'Hero section is not archived');
      }

      await c.env.DB.prepare(`
        UPDATE home_hero_sections
        SET status = 'draft', updated_at = datetime('now')
        WHERE id = ?
      `).bind(id).run();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'restore_home_hero',
        `home_hero_${id}`,
        JSON.stringify({ id })
      ).run();

      return jsonOk(c, { message: 'Hero section restored to draft' });
    } catch (e) {
      logger.error('Failed to restore hero section', { error: String(e) });
      return jsonError(c, 'Failed to restore hero section');
    }
  }
);

// POST /home/heroes/:id/image - Upload hero image
app.post(
  '/home/heroes/:id/image',
  requirePermission(PERMISSIONS.SETTINGS_WRITE),
  zValidator('param', heroIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      // Check if hero exists
      const hero = await c.env.DB.prepare('SELECT id FROM home_hero_sections WHERE id = ?')
        .bind(id)
        .first();

      if (!hero) {
        return jsonError(c, 'Hero section not found', 404);
      }

      const formData = await c.req.formData();
      const file = formData.get('image');
      const imageType = formData.get('imageType') as 'main' | 'small'; // 'main' or 'small'

      if (!file || !(file instanceof File)) {
        return jsonError(c, 'No image file provided', 400);
      }

      if (!imageType || !['main', 'small'].includes(imageType)) {
        return jsonError(c, 'Invalid imageType. Must be "main" or "small"', 400);
      }

      // Validate file type
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return jsonError(c, `Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`, 400);
      }

      // Validate file size
      if (file.size > MAX_IMAGE_SIZE) {
        return jsonError(c, `File too large. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`, 400);
      }

      // Generate R2 key
      const ext = getExtensionFromContentType(file.type);
      const timestamp = Date.now();
      const r2Key = `home-heroes/${id}/${imageType}-${timestamp}.${ext}`;

      // Upload to R2
      const buffer = await file.arrayBuffer();
      await putImage(c.env.R2, r2Key, buffer, file.type);

      // Update database
      const fieldName = imageType === 'main' ? 'image_r2_key' : 'image_r2_key_small';
      await c.env.DB.prepare(`
        UPDATE home_hero_sections
        SET ${fieldName} = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(r2Key, id).run();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'upload_home_hero_image',
        `home_hero_${id}`,
        JSON.stringify({ id, imageType, r2Key, size: file.size, contentType: file.type })
      ).run();

      return jsonOk(c, { r2Key, message: 'Image uploaded successfully' });
    } catch (e) {
      logger.error('Failed to upload hero image', { error: String(e) });
      return jsonError(c, 'Failed to upload image');
    }
  }
);

// DELETE /home/heroes/:id/image/:type - Delete hero image
app.delete(
  '/home/heroes/:id/image/:type',
  requirePermission(PERMISSIONS.SETTINGS_WRITE),
  zValidator('param', z.object({
    id: z.string().transform(Number).pipe(z.number().int().positive()),
    type: z.enum(['main', 'small'])
  }), validationErrorHandler),
  async (c) => {
    const { id, type } = c.req.valid('param');

    try {
      const fieldName = type === 'main' ? 'image_r2_key' : 'image_r2_key_small';
      const hero = await c.env.DB.prepare(`
        SELECT ${fieldName} as r2_key FROM home_hero_sections WHERE id = ?
      `).bind(id).first<{ r2_key: string | null }>();

      if (!hero) {
        return jsonError(c, 'Hero section not found', 404);
      }

      if (!hero.r2_key) {
        return jsonError(c, 'No image to delete', 404);
      }

      // Delete from R2
      await deleteKey(c.env.R2, hero.r2_key);

      // Update database
      await c.env.DB.prepare(`
        UPDATE home_hero_sections
        SET ${fieldName} = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).bind(id).run();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'delete_home_hero_image',
        `home_hero_${id}`,
        JSON.stringify({ id, type, r2Key: hero.r2_key })
      ).run();

      return jsonOk(c, { message: 'Image deleted successfully' });
    } catch (e) {
      logger.error('Failed to delete hero image', { error: String(e) });
      return jsonError(c, 'Failed to delete image');
    }
  }
);

export default app;
