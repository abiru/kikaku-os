import { Hono } from 'hono';
import { ensureDate } from '../../lib/date';
import { jsonError, jsonOk } from '../../lib/http';
import { createLogger } from '../../lib/logger';
import { PERMISSIONS } from '../../lib/schemas';
import { generateDailyReport } from '../../services/dailyReport';
import type { Env } from '../../env';
import { loadRbac, requirePermission } from '../../middleware/rbac';

const logger = createLogger('reports');
const reports = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
reports.use('*', loadRbac);

reports.get('/daily', requirePermission(PERMISSIONS.REPORTS_READ), async (c) => {
  const date = ensureDate(c.req.query('date') || '');
  if (!date) return jsonError(c, 'Invalid date', 400);
  try {
    const report = await generateDailyReport(c.env, date);
    return jsonOk(c, { report });
  } catch (err) {
    logger.error('Failed to generate report', { error: String(err) });
    return jsonError(c, 'Failed to generate report');
  }
});

export default reports;
