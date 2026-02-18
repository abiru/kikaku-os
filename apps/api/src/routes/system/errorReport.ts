import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { createLogger } from '../../lib/logger';
import { logAuditEvent } from '../../lib/audit';
import { validationErrorHandler } from '../../lib/validation';

const logger = createLogger('error-report');

const errorReportSchema = z.object({
  trackingId: z.string().min(1).max(100),
  message: z.string().max(2000).optional(),
  stack: z.string().max(10000).optional(),
  componentStack: z.string().max(10000).optional(),
  url: z.string().max(2000).optional(),
  userAgent: z.string().max(500).optional(),
});

const errorReport = new Hono<Env>();

/**
 * POST /errors/report - Receive client-side error reports
 * Public endpoint (no auth required) with rate limiting applied globally.
 * Logs the error with a tracking ID for correlation with server-side logs.
 */
errorReport.post(
  '/report',
  zValidator('json', errorReportSchema, validationErrorHandler),
  async (c) => {
    const body = c.req.valid('json');

    // Validate tracking ID format (ERR-{timestamp}-{random})
    if (!/^ERR-\d+-[a-z0-9]{4}$/.test(body.trackingId)) {
      return jsonError(c, 'Invalid tracking ID format', 400);
    }

    logger.error('Client error reported', {
      trackingId: body.trackingId,
      message: body.message,
      url: body.url,
      userAgent: body.userAgent,
    });

    // Log to audit trail (non-blocking)
    try {
      await logAuditEvent(c.env.DB, {
        actor: 'client',
        action: 'client_error',
        target: 'error_report',
        metadata: {
          trackingId: body.trackingId,
          message: body.message,
          url: body.url,
          stack: body.stack?.slice(0, 2000),
          componentStack: body.componentStack?.slice(0, 2000),
        },
      });
    } catch {
      // Audit log failure is non-fatal
    }

    return jsonOk(c, { trackingId: body.trackingId });
  }
);

export default errorReport;
