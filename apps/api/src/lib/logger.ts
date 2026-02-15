type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

interface Logger {
  debug: (msg: string, data?: Record<string, unknown>) => void
  info: (msg: string, data?: Record<string, unknown>) => void
  warn: (msg: string, data?: Record<string, unknown>) => void
  error: (msg: string, data?: Record<string, unknown>) => void
}

function log(
  level: LogLevel,
  msg: string,
  data: Record<string, unknown> | undefined,
  context: string | undefined,
  minLevel: LogLevel
): void {
  if (LEVELS[level] < LEVELS[minLevel]) return
  const entry = {
    level,
    msg,
    ...(context && { context }),
    ...(data && { data }),
    ts: new Date().toISOString(),
  }
  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  method(JSON.stringify(entry))
}

export function createLogger(context?: string, minLevel: LogLevel = 'debug'): Logger {
  return {
    debug: (msg: string, data?: Record<string, unknown>) => log('debug', msg, data, context, minLevel),
    info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data, context, minLevel),
    warn: (msg: string, data?: Record<string, unknown>) => log('warn', msg, data, context, minLevel),
    error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data, context, minLevel),
  }
}
