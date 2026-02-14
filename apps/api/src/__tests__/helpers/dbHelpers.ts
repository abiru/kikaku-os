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
 * NOTE: Test-only helper. Table/column names are not parameterized
 * and must never be used with untrusted input.
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
 * NOTE: Test-only helper.
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
 * NOTE: Test-only helper.
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
