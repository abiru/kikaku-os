import type { D1Database } from '@cloudflare/workers-types';

export type AuditLogParams = {
  actor: string;
  action: string;
  target: string;
  targetId?: number | string | null;
  metadata?: Record<string, unknown> | string;
};

/**
 * Insert audit log entry
 * Non-throwing - logs error and continues on failure
 *
 * @example
 * await logAuditEvent(c.env.DB, {
 *   actor: getActor(c),
 *   action: 'create_product',
 *   target: 'product',
 *   targetId: productId,
 *   metadata: { title: 'New Product' }
 * });
 */
export const logAuditEvent = async (
  db: D1Database,
  params: AuditLogParams
): Promise<void> => {
  try {
    const metadataStr = typeof params.metadata === 'string'
      ? params.metadata
      : JSON.stringify(params.metadata ?? {});

    await db
      .prepare(
        'INSERT INTO audit_logs (actor, action, target, target_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
      )
      .bind(
        params.actor,
        params.action,
        params.target,
        params.targetId ?? null,
        metadataStr
      )
      .run();
  } catch (err) {
    console.error('Failed to log audit event:', err);
    // Non-blocking - don't throw
  }
};
