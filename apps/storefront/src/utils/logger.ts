/**
 * Structured logging utility for server-side Astro pages.
 *
 * - DEV: human-readable console.error with context
 * - PROD: structured JSON for observability tooling
 */

type LogContext = {
  page: string
  action?: string
  [key: string]: unknown
}

const isDev = import.meta.env.DEV

function formatError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack }
  }
  return { message: String(error) }
}

export function logError(context: LogContext, error: unknown): void {
  const errInfo = formatError(error)

  if (isDev) {
    console.error(`[${context.page}]${context.action ? ` ${context.action}:` : ':'}`, error)
  } else {
    console.error(
      JSON.stringify({
        level: 'error',
        ts: new Date().toISOString(),
        ...context,
        error: errInfo.message,
      })
    )
  }
}

export function logWarn(context: LogContext, message: string): void {
  if (isDev) {
    console.warn(`[${context.page}]${context.action ? ` ${context.action}:` : ':'}`, message)
  } else {
    console.warn(
      JSON.stringify({
        level: 'warn',
        ts: new Date().toISOString(),
        ...context,
        message,
      })
    )
  }
}
