import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../lib/schemas';
import { validationErrorHandler } from '../../lib/validation';
import { createLogger } from '../../lib/logger';

const logger = createLogger('admin-audit-logs');
const adminAuditLogs = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
adminAuditLogs.use('*', loadRbac);

const auditLogListQuerySchema = z.object({
  actor: z.string().max(200).optional().default(''),
  action: z.string().max(100).optional().default(''),
  target: z.string().max(100).optional().default(''),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().default(''),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().default(''),
  limit: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('50')
    .transform((v) => Math.min(200, Math.max(1, parseInt(v, 10)))),
  offset: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('0')
    .transform((v) => Math.max(0, parseInt(v, 10))),
});

type AuditLogRow = {
  id: number;
  actor: string | null;
  action: string;
  target: string | null;
  metadata: string | null;
  created_at: string;
};

// GET /admin/audit-logs - List audit logs with optional filters
adminAuditLogs.get(
  '/',
  requirePermission(PERMISSIONS.SETTINGS_READ),
  zValidator('query', auditLogListQuerySchema, validationErrorHandler),
  async (c) => {
    const { actor, action, target, date_from, date_to, limit, offset } = c.req.valid('query');

    try {
      const conditions: string[] = [];
      const bindValues: (string | number)[] = [];

      if (actor) {
        conditions.push('actor LIKE ?');
        bindValues.push(`%${actor}%`);
      }
      if (action) {
        conditions.push('action = ?');
        bindValues.push(action);
      }
      if (target) {
        conditions.push('target = ?');
        bindValues.push(target);
      }
      if (date_from) {
        conditions.push('created_at >= ?');
        bindValues.push(`${date_from}T00:00:00`);
      }
      if (date_to) {
        conditions.push('created_at <= ?');
        bindValues.push(`${date_to}T23:59:59`);
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await c.env.DB.prepare(
        `SELECT COUNT(*) as total FROM audit_logs${whereClause}`
      ).bind(...bindValues).first<{ total: number }>();

      const result = await c.env.DB.prepare(
        `SELECT id, actor, action, target, metadata, created_at FROM audit_logs${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      ).bind(...bindValues, limit, offset).all<AuditLogRow>();

      // Get distinct actions for filter dropdown
      const actionsResult = await c.env.DB.prepare(
        'SELECT DISTINCT action FROM audit_logs ORDER BY action'
      ).all<{ action: string }>();

      // Get distinct targets for filter dropdown
      const targetsResult = await c.env.DB.prepare(
        'SELECT DISTINCT target FROM audit_logs WHERE target IS NOT NULL ORDER BY target'
      ).all<{ target: string }>();

      return jsonOk(c, {
        logs: result.results || [],
        total: countResult?.total ?? 0,
        limit,
        offset,
        filters: {
          actions: (actionsResult.results || []).map((r) => r.action),
          targets: (targetsResult.results || []).map((r) => r.target),
        },
      });
    } catch (err) {
      logger.error('Failed to list audit logs', { error: String(err) });
      return jsonError(c, 'Failed to list audit logs', 500);
    }
  }
);

export default adminAuditLogs;
