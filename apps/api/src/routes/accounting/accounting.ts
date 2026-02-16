import { Hono } from 'hono';
import { ensureDate } from '../../lib/date';
import { jsonError, jsonOk } from '../../lib/http';
import { createLogger } from '../../lib/logger';
import { PERMISSIONS } from '../../lib/schemas';
import { listLedgerEntries } from '../../services/journalize';
import type { Env } from '../../env';
import { loadRbac, requirePermission } from '../../middleware/rbac';

const logger = createLogger('accounting');
const accounting = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
accounting.use('*', loadRbac);

accounting.get('/ledger-entries', requirePermission(PERMISSIONS.LEDGER_READ), async (c) => {
  const date = ensureDate(c.req.query('date') || '');
  if (!date) return jsonError(c, 'Invalid date', 400);
  try {
    const entries = await listLedgerEntries(c.env, date);
    return jsonOk(c, { entries });
  } catch (err) {
    logger.error('Failed to fetch ledger entries', { error: String(err) });
    return jsonError(c, 'Failed to fetch ledger entries');
  }
});

export default accounting;
