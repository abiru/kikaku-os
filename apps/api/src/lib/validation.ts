import type { Context } from 'hono';

/**
 * Standard validation error handler for @hono/zod-validator
 * Returns 400 with combined error messages
 *
 * Usage:
 *   zValidator('json', schema, validationErrorHandler)
 */
export const validationErrorHandler = (
  result: { success: boolean; error?: { issues: Array<{ message: string }> } },
  c: Context
) => {
  if (!result.success) {
    const messages = result.error?.issues.map((e) => e.message).join(', ') || 'Validation failed';
    return c.json({ ok: false, message: messages }, 400);
  }
};
