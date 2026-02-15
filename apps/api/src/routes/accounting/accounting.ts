import { Hono } from 'hono';
import { ensureDate } from '../../lib/date';
import { jsonError, jsonOk } from '../../lib/http';
import { createLogger } from '../../lib/logger';
import { listLedgerEntries } from '../../services/journalize';
import type { Env } from '../../env';

const logger = createLogger('accounting');
const accounting = new Hono<Env>();

accounting.get('/ledger-entries', async (c) => {
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
