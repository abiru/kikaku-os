import type { D1Database } from '@cloudflare/workers-types';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Check if record exists in table by ID
 * Returns the record if found, null otherwise
 *
 * @example
 * const product = await findById(db, 'products', 123);
 * if (!product) {
 *   return jsonError(c, 'Product not found', 404);
 * }
 */
export const findById = async <T = Record<string, unknown>>(
  db: D1Database,
  table: string,
  id: number | string,
  columns: string = '*'
): Promise<T | null> => {
  const result = await db
    .prepare(`SELECT ${columns} FROM ${table} WHERE id = ?`)
    .bind(id)
    .first<T>();
  return result ?? null;
};

/**
 * Check if record exists and throw NotFoundError if not found
 *
 * @example
 * try {
 *   const product = await findByIdOrThrow(db, 'products', id);
 *   // product exists, continue...
 * } catch (err) {
 *   if (err instanceof NotFoundError) {
 *     return jsonError(c, err.message, 404);
 *   }
 *   throw err;
 * }
 */
export const findByIdOrThrow = async <T = Record<string, unknown>>(
  db: D1Database,
  table: string,
  id: number | string,
  columns: string = '*',
  errorMessage?: string
): Promise<T> => {
  const result = await findById<T>(db, table, id, columns);
  if (!result) {
    const message = errorMessage ?? `${table} with id ${id} not found`;
    throw new NotFoundError(message);
  }
  return result;
};

/**
 * Count records matching a condition
 *
 * @example
 * const orderCount = await countWhere(db, 'orders', 'customer_id = ?', [customerId]);
 */
export const countWhere = async (
  db: D1Database,
  table: string,
  whereClause: string,
  bindings: unknown[]
): Promise<number> => {
  const result = await db
    .prepare(`SELECT COUNT(*) as count FROM ${table} WHERE ${whereClause}`)
    .bind(...bindings)
    .first<{ count: number }>();
  return result?.count ?? 0;
};
