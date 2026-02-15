import { Hono } from 'hono';
import type { Env } from '../../env';
import { validator } from 'hono/validator';
import { jsonError, jsonOk } from '../../lib/http';
import { getActor } from '../../middleware/clerkAuth';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import {
  settingKeyParamSchema,
  updateSettingSchema,
  updateBulkSettingsSchema,
  PERMISSIONS,
  type SettingKeyParam,
  type UpdateSettingInput,
  type UpdateBulkSettingsInput
} from '../../lib/schemas';

const adminSettings = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
adminSettings.use('*', loadRbac);

adminSettings.get('/', requirePermission(PERMISSIONS.SETTINGS_READ), async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT id, key, value, category, data_type, description, display_order, is_active, created_at, updated_at
       FROM app_settings
       WHERE is_active = 1
       ORDER BY category ASC, display_order ASC, key ASC`
    ).all();

    const settings = result.results || [];

    // Group by category
    type SettingRow = Record<string, unknown> & { category?: string };
    const grouped = settings.reduce((acc: Record<string, SettingRow[]>, setting) => {
      const row = setting as SettingRow;
      const category = (row.category as string) || 'general';
      if (!acc[category]) {
        return { ...acc, [category]: [row] };
      }
      return { ...acc, [category]: [...acc[category], row] };
    }, {} as Record<string, SettingRow[]>);

    return jsonOk(c, { settings, grouped });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return jsonError(c, 'Failed to fetch settings', 500);
  }
});

adminSettings.get(
  '/:key',
  requirePermission(PERMISSIONS.SETTINGS_READ),
  validator('param', (value, c) => {
    const parsed = settingKeyParamSchema.safeParse(value);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    return parsed.data;
  }),
  async (c) => {
    try {
      const { key } = c.req.valid('param') as SettingKeyParam;

      const result = await c.env.DB.prepare(
        `SELECT id, key, value, category, data_type, description, validation_rules, display_order, is_active, created_at, updated_at
         FROM app_settings
         WHERE key = ? AND is_active = 1`
      )
        .bind(key)
        .first();

      if (!result) {
        return jsonError(c, 'Setting not found', 404);
      }

      return jsonOk(c, result);
    } catch (error) {
      console.error('Failed to fetch setting:', error);
      return jsonError(c, 'Failed to fetch setting', 500);
    }
  }
);

adminSettings.put(
  '/:key',
  requirePermission(PERMISSIONS.SETTINGS_WRITE),
  validator('param', (value, c) => {
    const parsed = settingKeyParamSchema.safeParse(value);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    return parsed.data;
  }),
  validator('json', (value, c) => {
    const parsed = updateSettingSchema.safeParse(value);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    return parsed.data;
  }),
  async (c) => {
    try {
      const { key } = c.req.valid('param') as SettingKeyParam;
      const { value } = c.req.valid('json') as UpdateSettingInput;

      // Fetch existing setting
      const existing = await c.env.DB.prepare(
        'SELECT id, value, data_type, validation_rules FROM app_settings WHERE key = ? AND is_active = 1'
      )
        .bind(key)
        .first();

      if (!existing) {
        return jsonError(c, 'Setting not found', 404);
      }

      // Validate value
      const validationResult = validateSettingValue(
        value,
        existing.data_type as string,
        existing.validation_rules as string | null
      );

      if (!validationResult.valid) {
        return jsonError(c, validationResult.error || 'Invalid value', 400);
      }

      // Update
      const result = await c.env.DB.prepare(
        `UPDATE app_settings
         SET value = ?, updated_at = datetime('now')
         WHERE key = ?
         RETURNING id, key, value, category, data_type, description, display_order, is_active, created_at, updated_at`
      )
        .bind(value, key)
        .first();

      if (!result) {
        return jsonError(c, 'Failed to update setting', 500);
      }

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'update_setting',
        `app_setting:${key}`,
        JSON.stringify({ key, old_value: existing.value, new_value: value })
      ).run();

      return jsonOk(c, result);
    } catch (error) {
      console.error('Failed to update setting:', error);
      return jsonError(c, 'Failed to update setting', 500);
    }
  }
);

adminSettings.post(
  '/bulk',
  requirePermission(PERMISSIONS.SETTINGS_WRITE),
  validator('json', (value, c) => {
    const parsed = updateBulkSettingsSchema.safeParse(value);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    return parsed.data;
  }),
  async (c) => {
    try {
      const { settings } = c.req.valid('json') as UpdateBulkSettingsInput;

      const results = [];
      const errors = [];

      for (const { key, value } of settings) {
        try {
          const existing = await c.env.DB.prepare(
            'SELECT id, data_type, validation_rules FROM app_settings WHERE key = ? AND is_active = 1'
          )
            .bind(key)
            .first();

          if (!existing) {
            errors.push({ key, error: 'Setting not found' });
            continue;
          }

          const validationResult = validateSettingValue(
            value,
            existing.data_type as string,
            existing.validation_rules as string | null
          );

          if (!validationResult.valid) {
            errors.push({ key, error: validationResult.error });
            continue;
          }

          await c.env.DB.prepare(
            `UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE key = ?`
          )
            .bind(value, key)
            .run();

          await c.env.DB.prepare(
            'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
          ).bind(
            getActor(c),
            'update_setting',
            `app_setting:${key}`,
            JSON.stringify({ key, value })
          ).run();

          results.push({ key, success: true });
        } catch (error) {
          errors.push({ key, error: String(error) });
        }
      }

      return jsonOk(c, { results, errors });
    } catch (error) {
      console.error('Failed to bulk update settings:', error);
      return jsonError(c, 'Failed to bulk update settings', 500);
    }
  }
);

function isSafeRegexPattern(pattern: string): boolean {
  // Reject patterns with nested quantifiers that could cause catastrophic backtracking
  const dangerousPatterns = [
    /(\+|\*|\{[^}]*\})\s*(\+|\*|\{[^}]*\})/,  // Nested quantifiers: (a+)+, (a*)*
    /\([^)]*(\+|\*).*\)\s*(\+|\*)/,            // Quantified groups with quantifiers inside
    /(\+|\*)\s*\?/,                            // Possessive quantifiers
  ];

  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      return false;
    }
  }

  return true;
}

function validateSettingValue(
  value: string,
  dataType: string,
  validationRules: string | null
): { valid: boolean; error?: string } {
  // Basic type validation
  switch (dataType) {
    case 'integer':
      if (!/^-?\d+$/.test(value)) {
        return { valid: false, error: 'Value must be an integer' };
      }
      break;
    case 'boolean':
      if (!['true', 'false', '1', '0'].includes(value.toLowerCase())) {
        return { valid: false, error: 'Value must be a boolean (true/false)' };
      }
      break;
    case 'email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return { valid: false, error: 'Value must be a valid email address' };
      }
      break;
    case 'url':
      if (value && !value.match(/^https?:\/\/.+/)) {
        return { valid: false, error: 'Value must be a valid URL' };
      }
      break;
  }

  // Advanced validation rules
  if (validationRules) {
    try {
      const rules = JSON.parse(validationRules);

      if (dataType === 'integer') {
        const numValue = parseInt(value, 10);
        if (rules.min !== undefined && numValue < rules.min) {
          return { valid: false, error: `Value must be at least ${rules.min}` };
        }
        if (rules.max !== undefined && numValue > rules.max) {
          return { valid: false, error: `Value must be at most ${rules.max}` };
        }
      }

      if (dataType === 'string' && rules.maxLength) {
        if (value.length > rules.maxLength) {
          return { valid: false, error: `Value must be ${rules.maxLength} characters or less` };
        }
      }

      if (rules.pattern) {
        // Security: Prevent ReDoS attacks by validating pattern safety
        if (typeof rules.pattern !== 'string' || rules.pattern.length > 100) {
          console.warn('Skipping validation: Pattern too long or invalid');
        } else if (isSafeRegexPattern(rules.pattern)) {
          try {
            const regex = new RegExp(rules.pattern);
            if (!regex.test(value)) {
              return { valid: false, error: rules.patternMessage || 'Invalid format' };
            }
          } catch (e) {
            console.error('Invalid regex pattern:', e);
          }
        } else {
          console.warn('Skipping validation: Potentially unsafe regex pattern');
        }
      }
    } catch (e) {
      // Invalid JSON in validation_rules, skip
    }
  }

  return { valid: true };
}

export default adminSettings;
