import { createLogger } from './logger';

const logger = createLogger('r2');

type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
};

/**
 * Execute an async operation with exponential backoff retry.
 * Returns the result on success, or throws the last error after all retries are exhausted.
 */
export const withRetry = async <T>(
  operation: () => Promise<T>,
  label: string,
  options: RetryOptions = {}
): Promise<T> => {
  const { maxRetries, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      if (attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        logger.warn('R2 operation failed, retrying', {
          operation: label,
          attempt: attempt + 1,
          maxRetries,
          delayMs: delay,
          error: err instanceof Error ? err.message : String(err),
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

/**
 * Create an inbox alert for R2 failure.
 */
export const createR2FailureAlert = async (
  db: D1Database,
  operation: string,
  key: string,
  error: unknown
): Promise<void> => {
  try {
    await db.prepare(
      `INSERT INTO inbox_items (title, body, severity, status, kind, created_at, updated_at)
       VALUES (?, ?, 'critical', 'open', 'r2_failure', datetime('now'), datetime('now'))`
    ).bind(
      `R2 ${operation} failed: ${key}`,
      `R2 operation "${operation}" failed after retries for key "${key}". Error: ${error instanceof Error ? error.message : String(error)}`
    ).run();
  } catch {
    logger.error('Failed to create R2 failure alert in inbox', { operation, key });
  }
};

export const putJson = async (bucket: R2Bucket, key: string, data: unknown) => {
  await withRetry(
    () => bucket.put(key, JSON.stringify(data, null, 2), {
      httpMetadata: { contentType: 'application/json' }
    }),
    `putJson(${key})`
  );
};

export const putText = async (bucket: R2Bucket, key: string, text: string, contentType: string) => {
  await withRetry(
    () => bucket.put(key, text, { httpMetadata: { contentType } }),
    `putText(${key})`
  );
};

export const putImage = async (
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer | ReadableStream,
  contentType: string
) => {
  await withRetry(
    () => bucket.put(key, data, { httpMetadata: { contentType } }),
    `putImage(${key})`
  );
};

export const deleteKey = async (bucket: R2Bucket, key: string) => {
  await withRetry(
    () => bucket.delete(key),
    `deleteKey(${key})`
  );
};

/**
 * Store daily close report data in D1 as a fallback when R2 is unavailable.
 */
export const storeDailyReportFallback = async (
  db: D1Database,
  date: string,
  reportKey: string,
  reportData: unknown
): Promise<void> => {
  await db.prepare(
    `INSERT OR REPLACE INTO r2_fallback_store (r2_key, content, content_type, created_at)
     VALUES (?, ?, 'application/json', datetime('now'))`
  ).bind(reportKey, JSON.stringify(reportData)).run();

  logger.warn('Daily report stored in D1 fallback', { date, key: reportKey });
};
