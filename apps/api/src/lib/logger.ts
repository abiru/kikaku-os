type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

interface Logger {
  debug: (msg: string, data?: Record<string, unknown>) => void
  info: (msg: string, data?: Record<string, unknown>) => void
  warn: (msg: string, data?: Record<string, unknown>) => void
  error: (msg: string, data?: Record<string, unknown>) => void
}

// Keys whose values should be masked in log output
const SENSITIVE_KEYS = new Set([
  'email', 'customer_email', 'receipt_email',
  'password', 'secret', 'token', 'api_key', 'apiKey',
  'authorization', 'cookie',
  'stripe_customer_id', 'stripeCustomerId',
  'card_number', 'cvv', 'cvc',
  'phone',
])

function maskValue(key: string, value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value
  const lowerKey = key.toLowerCase()
  if (!SENSITIVE_KEYS.has(lowerKey) && !SENSITIVE_KEYS.has(key)) return value
  if (lowerKey.includes('email') && value.includes('@')) {
    const atIndex = value.indexOf('@')
    return `${value[0]}***@${value.slice(atIndex + 1)}`
  }
  if (value.length <= 4) return '***'
  return `${value.slice(0, 4)}***`
}

function maskData(data: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      masked[key] = maskData(value as Record<string, unknown>)
    } else {
      masked[key] = maskValue(key, value)
    }
  }
  return masked
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
    ...(data && { data: maskData(data) }),
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
