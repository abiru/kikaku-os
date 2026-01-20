import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../env';
import { jsonOk, jsonError } from '../lib/http';
import { getActor } from '../middleware/clerkAuth';
import {
  couponIdParamSchema,
  couponListQuerySchema,
  createCouponSchema,
  updateCouponSchema,
} from '../lib/schemas';

const app = new Hono<Env>();

const validationErrorHandler = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }, c: any) => {
  if (!result.success) {
    const messages = result.error?.issues.map((e) => e.message).join(', ') || 'Validation failed';
    return c.json({ ok: false, message: messages }, 400);
  }
};

type CouponRow = {
  id: number;
  code: string;
  type: string;
  value: number;
  currency: string;
  min_order_amount: number;
  max_uses: number | null;
  uses_per_customer: number;
  current_uses: number;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

// GET /coupons - List coupons with pagination, search, and status filter
app.get(
  '/coupons',
  zValidator('query', couponListQuerySchema, validationErrorHandler),
  async (c) => {
    const { q, status, page, perPage } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    try {
      const conditions: string[] = [];
      const bindings: (string | number)[] = [];

      if (q) {
        conditions.push('code LIKE ?');
        bindings.push(`%${q}%`);
      }

      if (status !== 'all') {
        conditions.push('status = ?');
        bindings.push(status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countQuery = `SELECT COUNT(*) as count FROM coupons ${whereClause}`;
      const countRes = await c.env.DB.prepare(countQuery).bind(...bindings).first<{ count: number }>();
      const totalCount = countRes?.count || 0;

      const dataQuery = `
        SELECT id, code, type, value, currency, min_order_amount, max_uses,
               uses_per_customer, current_uses, status, starts_at, expires_at,
               created_at, updated_at
        FROM coupons
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      bindings.push(perPage, offset);

      const coupons = await c.env.DB.prepare(dataQuery).bind(...bindings).all<CouponRow>();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'view_coupons',
        'admin_coupons_list',
        JSON.stringify({ q, status, page, perPage, count: coupons.results.length })
      ).run();

      return jsonOk(c, {
        coupons: coupons.results,
        meta: {
          page,
          perPage,
          totalCount,
          totalPages: Math.ceil(totalCount / perPage)
        }
      });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to fetch coupons');
    }
  }
);

// GET /coupons/:id - Fetch single coupon with usage statistics
app.get(
  '/coupons/:id',
  zValidator('param', couponIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const coupon = await c.env.DB.prepare(`
        SELECT id, code, type, value, currency, min_order_amount, max_uses,
               uses_per_customer, current_uses, status, starts_at, expires_at,
               created_at, updated_at
        FROM coupons
        WHERE id = ?
      `).bind(id).first<CouponRow>();

      if (!coupon) {
        return jsonError(c, 'Coupon not found', 404);
      }

      // Fetch usage statistics
      const usageStats = await c.env.DB.prepare(`
        SELECT COUNT(*) as total_usages, SUM(discount_amount) as total_discount
        FROM coupon_usages
        WHERE coupon_id = ?
      `).bind(id).first<{ total_usages: number; total_discount: number }>();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'view_coupon', `coupon:${id}`, JSON.stringify({ coupon_id: id })).run();

      return jsonOk(c, {
        coupon,
        stats: {
          totalUsages: usageStats?.total_usages || 0,
          totalDiscount: usageStats?.total_discount || 0
        }
      });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to fetch coupon');
    }
  }
);

// POST /coupons - Create coupon
app.post(
  '/coupons',
  zValidator('json', createCouponSchema, validationErrorHandler),
  async (c) => {
    const data = c.req.valid('json');

    try {
      // Check for duplicate code
      const existing = await c.env.DB.prepare(
        'SELECT id FROM coupons WHERE code = ?'
      ).bind(data.code).first();

      if (existing) {
        return jsonError(c, 'A coupon with this code already exists', 400);
      }

      const result = await c.env.DB.prepare(`
        INSERT INTO coupons (code, type, value, currency, min_order_amount, max_uses,
                            uses_per_customer, status, starts_at, expires_at,
                            created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        data.code,
        data.type,
        data.value,
        data.currency,
        data.min_order_amount,
        data.max_uses || null,
        data.uses_per_customer,
        data.status,
        data.starts_at || null,
        data.expires_at || null
      ).run();

      const couponId = result.meta.last_row_id;

      const coupon = await c.env.DB.prepare(`
        SELECT id, code, type, value, currency, min_order_amount, max_uses,
               uses_per_customer, current_uses, status, starts_at, expires_at,
               created_at, updated_at
        FROM coupons WHERE id = ?
      `).bind(couponId).first<CouponRow>();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'create_coupon', `coupon:${couponId}`, JSON.stringify({ code: data.code })).run();

      return jsonOk(c, { coupon });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to create coupon');
    }
  }
);

// PUT /coupons/:id - Update coupon
app.put(
  '/coupons/:id',
  zValidator('param', couponIdParamSchema, validationErrorHandler),
  zValidator('json', updateCouponSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');

    try {
      const existing = await c.env.DB.prepare(
        'SELECT id, code FROM coupons WHERE id = ?'
      ).bind(id).first<{ id: number; code: string }>();

      if (!existing) {
        return jsonError(c, 'Coupon not found', 404);
      }

      // Check for duplicate code if changed
      if (data.code !== existing.code) {
        const duplicate = await c.env.DB.prepare(
          'SELECT id FROM coupons WHERE code = ? AND id != ?'
        ).bind(data.code, id).first();

        if (duplicate) {
          return jsonError(c, 'A coupon with this code already exists', 400);
        }
      }

      await c.env.DB.prepare(`
        UPDATE coupons
        SET code = ?, type = ?, value = ?, currency = ?, min_order_amount = ?,
            max_uses = ?, uses_per_customer = ?, status = ?, starts_at = ?,
            expires_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        data.code,
        data.type,
        data.value,
        data.currency,
        data.min_order_amount,
        data.max_uses || null,
        data.uses_per_customer,
        data.status,
        data.starts_at || null,
        data.expires_at || null,
        id
      ).run();

      const coupon = await c.env.DB.prepare(`
        SELECT id, code, type, value, currency, min_order_amount, max_uses,
               uses_per_customer, current_uses, status, starts_at, expires_at,
               created_at, updated_at
        FROM coupons WHERE id = ?
      `).bind(id).first<CouponRow>();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'update_coupon', `coupon:${id}`, JSON.stringify({ code: data.code })).run();

      return jsonOk(c, { coupon });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to update coupon');
    }
  }
);

// DELETE /coupons/:id - Delete coupon (only if unused)
app.delete(
  '/coupons/:id',
  zValidator('param', couponIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const coupon = await c.env.DB.prepare(
        'SELECT id, code, current_uses FROM coupons WHERE id = ?'
      ).bind(id).first<{ id: number; code: string; current_uses: number }>();

      if (!coupon) {
        return jsonError(c, 'Coupon not found', 404);
      }

      if (coupon.current_uses > 0) {
        return jsonError(c, 'Cannot delete a coupon that has been used. Consider deactivating it instead.', 400);
      }

      // Delete any usage records (should be 0 based on check above)
      await c.env.DB.prepare('DELETE FROM coupon_usages WHERE coupon_id = ?').bind(id).run();

      await c.env.DB.prepare('DELETE FROM coupons WHERE id = ?').bind(id).run();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'delete_coupon', `coupon:${id}`, JSON.stringify({ code: coupon.code })).run();

      return jsonOk(c, { deleted: true });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to delete coupon');
    }
  }
);

// POST /coupons/:id/toggle - Toggle coupon status
app.post(
  '/coupons/:id/toggle',
  zValidator('param', couponIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const coupon = await c.env.DB.prepare(
        'SELECT id, code, status FROM coupons WHERE id = ?'
      ).bind(id).first<{ id: number; code: string; status: string }>();

      if (!coupon) {
        return jsonError(c, 'Coupon not found', 404);
      }

      const newStatus = coupon.status === 'active' ? 'inactive' : 'active';

      await c.env.DB.prepare(`
        UPDATE coupons SET status = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(newStatus, id).run();

      const updatedCoupon = await c.env.DB.prepare(`
        SELECT id, code, type, value, currency, min_order_amount, max_uses,
               uses_per_customer, current_uses, status, starts_at, expires_at,
               created_at, updated_at
        FROM coupons WHERE id = ?
      `).bind(id).first<CouponRow>();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'toggle_coupon', `coupon:${id}`, JSON.stringify({ code: coupon.code, newStatus })).run();

      return jsonOk(c, { coupon: updatedCoupon });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to toggle coupon status');
    }
  }
);

export default app;
