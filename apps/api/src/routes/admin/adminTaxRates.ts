import { Hono } from 'hono';
import type { Env } from '../../env';
import { validator } from 'hono/validator';
import { jsonError, jsonOk } from '../../lib/http';
import { getActor } from '../../middleware/clerkAuth';
import {
  createTaxRateSchema,
  updateTaxRateSchema,
  taxRateIdParamSchema,
  type CreateTaxRateInput,
  type UpdateTaxRateInput,
  type TaxRateIdParam
} from '../../lib/schemas';

const adminTaxRates = new Hono<Env>();

/**
 * GET /admin/tax-rates
 * List all tax rates (active and inactive)
 */
adminTaxRates.get('/', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT id, name, rate, applicable_from, applicable_to, is_active, description, created_at, updated_at
       FROM tax_rates
       ORDER BY applicable_from DESC, rate DESC`
    ).all();

    return c.json(result.results || []);
  } catch (error) {
    console.error('Failed to fetch tax rates:', error);
    return jsonError(c, 'Failed to fetch tax rates', 500);
  }
});

/**
 * GET /admin/tax-rates/:id
 * Get single tax rate by ID
 */
adminTaxRates.get(
  '/:id',
  validator('param', (value, c) => {
    const parsed = taxRateIdParamSchema.safeParse(value);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    return parsed.data;
  }),
  async (c) => {
    try {
      const { id } = c.req.valid('param') as TaxRateIdParam;

      const result = await c.env.DB.prepare(
        `SELECT id, name, rate, applicable_from, applicable_to, is_active, description, created_at, updated_at
         FROM tax_rates
         WHERE id = ?`
      )
        .bind(id)
        .first();

      if (!result) {
        return jsonError(c, 'Tax rate not found', 404);
      }

      return jsonOk(c, result);
    } catch (error) {
      console.error('Failed to fetch tax rate:', error);
      return jsonError(c, 'Failed to fetch tax rate', 500);
    }
  }
);

/**
 * POST /admin/tax-rates
 * Create a new tax rate
 */
adminTaxRates.post(
  '/',
  validator('json', (value, c) => {
    const parsed = createTaxRateSchema.safeParse(value);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    return parsed.data;
  }),
  async (c) => {
    try {
      const data = c.req.valid('json') as CreateTaxRateInput;

      // Validate date range if applicable_to is provided
      if (data.applicable_to && data.applicable_to <= data.applicable_from) {
        return jsonError(c, 'applicable_to must be after applicable_from', 400);
      }

      // Insert new tax rate
      const result = await c.env.DB.prepare(
        `INSERT INTO tax_rates (name, rate, applicable_from, applicable_to, is_active, description)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id, name, rate, applicable_from, applicable_to, is_active, description, created_at, updated_at`
      )
        .bind(
          data.name,
          data.rate,
          data.applicable_from,
          data.applicable_to || null,
          data.is_active ? 1 : 0,
          data.description || null
        )
        .first();

      if (!result) {
        return jsonError(c, 'Failed to create tax rate', 500);
      }

      // Log audit
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, target_id, metadata) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'create_tax_rate',
        'tax_rate',
        result.id,
        JSON.stringify({ name: data.name, rate: data.rate })
      ).run();

      return c.json(result, 201);
    } catch (error) {
      console.error('Failed to create tax rate:', error);
      return jsonError(c, 'Failed to create tax rate', 500);
    }
  }
);

/**
 * PUT /admin/tax-rates/:id
 * Update an existing tax rate
 */
adminTaxRates.put(
  '/:id',
  validator('param', (value, c) => {
    const parsed = taxRateIdParamSchema.safeParse(value);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    return parsed.data;
  }),
  validator('json', (value, c) => {
    const parsed = updateTaxRateSchema.safeParse(value);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    return parsed.data;
  }),
  async (c) => {
    try {
      const { id } = c.req.valid('param') as TaxRateIdParam;
      const data = c.req.valid('json') as UpdateTaxRateInput;

      // Check if tax rate exists
      const existing = await c.env.DB.prepare('SELECT * FROM tax_rates WHERE id = ?')
        .bind(id)
        .first();

      if (!existing) {
        return jsonError(c, 'Tax rate not found', 404);
      }

      // Build update query dynamically based on provided fields
      const updates: string[] = [];
      const values: any[] = [];

      if (data.name !== undefined) {
        updates.push('name = ?');
        values.push(data.name);
      }
      if (data.rate !== undefined) {
        updates.push('rate = ?');
        values.push(data.rate);
      }
      if (data.applicable_from !== undefined) {
        updates.push('applicable_from = ?');
        values.push(data.applicable_from);
      }
      if (data.applicable_to !== undefined) {
        updates.push('applicable_to = ?');
        values.push(data.applicable_to);
      }
      if (data.description !== undefined) {
        updates.push('description = ?');
        values.push(data.description);
      }
      if (data.is_active !== undefined) {
        updates.push('is_active = ?');
        values.push(data.is_active ? 1 : 0);
      }

      if (updates.length === 0) {
        return jsonError(c, 'No fields to update', 400);
      }

      updates.push('updated_at = datetime("now")');
      values.push(id);

      const result = await c.env.DB.prepare(
        `UPDATE tax_rates
         SET ${updates.join(', ')}
         WHERE id = ?
         RETURNING id, name, rate, applicable_from, applicable_to, is_active, description, created_at, updated_at`
      )
        .bind(...values)
        .first();

      if (!result) {
        return jsonError(c, 'Failed to update tax rate', 500);
      }

      // Log audit
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, target_id, metadata) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'update_tax_rate',
        'tax_rate',
        id,
        JSON.stringify(data)
      ).run();

      return jsonOk(c, result);
    } catch (error) {
      console.error('Failed to update tax rate:', error);
      return jsonError(c, 'Failed to update tax rate', 500);
    }
  }
);

/**
 * DELETE /admin/tax-rates/:id
 * Soft delete a tax rate (set is_active = 0)
 * Prevents deletion if rate is in use by products
 */
adminTaxRates.delete(
  '/:id',
  validator('param', (value, c) => {
    const parsed = taxRateIdParamSchema.safeParse(value);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    return parsed.data;
  }),
  async (c) => {
    try {
      const { id } = c.req.valid('param') as TaxRateIdParam;

      // Check if tax rate exists
      const existing = await c.env.DB.prepare('SELECT * FROM tax_rates WHERE id = ?')
        .bind(id)
        .first();

      if (!existing) {
        return jsonError(c, 'Tax rate not found', 404);
      }

      // Check if tax rate is in use by any products
      const usage = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM products WHERE tax_rate_id = ?'
      )
        .bind(id)
        .first();

      if (usage && (usage.count as number) > 0) {
        return jsonError(
          c,
          `Cannot delete tax rate: ${usage.count} product(s) are using this rate`,
          400
        );
      }

      // Soft delete: set is_active = 0
      const result = await c.env.DB.prepare(
        `UPDATE tax_rates
         SET is_active = 0, updated_at = datetime('now')
         WHERE id = ?
         RETURNING id, name, rate, applicable_from, applicable_to, is_active, description, created_at, updated_at`
      )
        .bind(id)
        .first();

      if (!result) {
        return jsonError(c, 'Failed to delete tax rate', 500);
      }

      // Log audit
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, target_id, metadata) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'delete_tax_rate',
        'tax_rate',
        id,
        JSON.stringify({ name: existing.name })
      ).run();

      return jsonOk(c, { message: 'Tax rate deactivated successfully', taxRate: result });
    } catch (error) {
      console.error('Failed to delete tax rate:', error);
      return jsonError(c, 'Failed to delete tax rate', 500);
    }
  }
);

export default adminTaxRates;
