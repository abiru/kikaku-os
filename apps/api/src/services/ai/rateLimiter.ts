import { estimateCost } from './claudeClient';

type Bindings = {
  DB: D1Database;
  AI_RATE_LIMIT_PER_HOUR?: string;
};

/**
 * Check if request is within rate limit
 */
export async function checkRateLimit(
  db: D1Database,
  service: string,
  operation: string,
  limitOverride?: number
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const now = new Date();
  const hour = now.toISOString().substring(0, 13); // YYYY-MM-DDTHH

  const usage = await db.prepare(
    `SELECT COALESCE(SUM(request_count), 0) as count
     FROM ai_usage_tracking
     WHERE date = ? AND service = ? AND operation = ?`
  ).bind(hour, service, operation).first<{ count: number }>();

  const limit = limitOverride || 100; // Default 100 requests per hour
  const count = usage?.count || 0;

  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count),
    limit,
  };
}

/**
 * Track AI usage and cost
 */
export async function trackAIUsage(
  db: D1Database,
  service: string,
  operation: string,
  tokens: number
): Promise<void> {
  const now = new Date();
  const hour = now.toISOString().substring(0, 13); // YYYY-MM-DDTHH
  const cost = estimateCost(tokens);

  try {
    // Insert or update usage tracking
    await db.prepare(
      `INSERT INTO ai_usage_tracking (date, service, operation, request_count, total_tokens, estimated_cost_cents)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(date, service, operation) DO UPDATE SET
         request_count = request_count + 1,
         total_tokens = total_tokens + ?,
         estimated_cost_cents = estimated_cost_cents + ?`
    ).bind(hour, service, operation, tokens, cost, tokens, cost).run();
  } catch (err) {
    console.error('Failed to track AI usage:', err);
    // Don't throw - tracking failures shouldn't break requests
  }
}

/**
 * Get daily cost estimate
 */
export async function getDailyCostEstimate(
  db: D1Database,
  date: string
): Promise<{ totalCents: number; byOperation: Array<{ service: string; operation: string; cost: number }> }> {
  const result = await db.prepare(
    `SELECT service, operation, COALESCE(SUM(estimated_cost_cents), 0) as cost
     FROM ai_usage_tracking
     WHERE date LIKE ?
     GROUP BY service, operation
     ORDER BY cost DESC`
  ).bind(`${date}%`).all<{ service: string; operation: string; cost: number }>();

  const byOperation = result.results || [];
  const totalCents = byOperation.reduce((sum, item) => sum + item.cost, 0);

  return { totalCents, byOperation };
}

/**
 * Get hourly usage stats
 */
export async function getHourlyUsageStats(
  db: D1Database,
  hourPrefix: string
): Promise<{ requests: number; tokens: number; cost: number }> {
  const result = await db.prepare(
    `SELECT
       COALESCE(SUM(request_count), 0) as requests,
       COALESCE(SUM(total_tokens), 0) as tokens,
       COALESCE(SUM(estimated_cost_cents), 0) as cost
     FROM ai_usage_tracking
     WHERE date = ?`
  ).bind(hourPrefix).first<{ requests: number; tokens: number; cost: number }>();

  return result || { requests: 0, tokens: 0, cost: 0 };
}

/**
 * Check if daily budget is exceeded
 */
export async function checkDailyBudget(
  db: D1Database,
  date: string,
  budgetCents: number = 10000 // $100 default
): Promise<{ exceeded: boolean; used: number; budget: number; percentage: number }> {
  const { totalCents } = await getDailyCostEstimate(db, date);
  const percentage = (totalCents / budgetCents) * 100;

  return {
    exceeded: totalCents >= budgetCents,
    used: totalCents,
    budget: budgetCents,
    percentage,
  };
}

/**
 * Create inbox alert for budget threshold
 */
export async function createBudgetAlert(
  db: D1Database,
  date: string,
  used: number,
  budget: number,
  percentage: number
): Promise<number | null> {
  try {
    const result = await db.prepare(
      `INSERT INTO inbox_items (title, body, severity, status, kind, date, metadata, created_at, updated_at)
       VALUES (?, ?, ?, 'open', 'ai_budget_alert', ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      `AI Budget Alert: ${percentage.toFixed(0)}% Used`,
      `Daily AI budget is at ${percentage.toFixed(1)}% (${used} / ${budget} cents). Consider reviewing AI usage patterns.`,
      percentage >= 100 ? 'critical' : 'warning',
      date,
      JSON.stringify({ used, budget, percentage })
    ).run();

    return result.meta.last_row_id || null;
  } catch (err: unknown) {
    // Ignore duplicate constraint errors
    const errMsg = String((err as Error)?.message || '');
    if (errMsg.includes('UNIQUE constraint failed')) {
      return null;
    }
    console.error('Failed to create budget alert:', err);
    return null;
  }
}
