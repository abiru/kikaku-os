import * as Sentry from '@sentry/cloudflare';
import type { Env } from '../env';

/**
 * Initialize Sentry for error tracking.
 * Only initializes if SENTRY_DSN is configured.
 */
export const initSentry = (env: Env['Bindings']): boolean => {
  if (!env.SENTRY_DSN) {
    return false;
  }

  // Sentry is initialized automatically by withSentry wrapper
  return true;
};

/**
 * Get Sentry configuration for withSentry wrapper.
 * Returns null if SENTRY_DSN is not configured.
 */
export const getSentryConfig = (env: Env['Bindings']): Sentry.CloudflareOptions | null => {
  if (!env.SENTRY_DSN) {
    return null;
  }

  const release = env.CF_VERSION_METADATA?.id ?? 'unknown';

  return {
    dsn: env.SENTRY_DSN,
    release,
    environment: env.DEV_MODE === 'true' ? 'development' : 'production',
    // Capture 100% of errors
    sampleRate: 1.0,
    // Capture 10% of transactions for performance monitoring
    tracesSampleRate: env.DEV_MODE === 'true' ? 1.0 : 0.1,
    // Send user IP and request headers
    sendDefaultPii: true,
    // Enable Sentry logs
    enableLogs: true,
    // Ignore expected errors
    ignoreErrors: [
      'Unauthorized',
      'Not found',
      'Bad Request',
    ],
    // Filter out 4xx errors from being reported
    beforeSend(event) {
      // Skip 4xx client errors (they're expected)
      const statusCode = event.contexts?.response?.status_code;
      if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
        return null;
      }
      return event;
    },
  };
};

/**
 * Capture exception for error tracking.
 * Uses Sentry SDK if configured, otherwise logs to console.
 */
export const captureException = (
  error: Error,
  context: {
    path: string;
    method: string;
    env: Env['Bindings'];
    userId?: string;
  }
): void => {
  // Skip in dev mode
  if (context.env.DEV_MODE === 'true') {
    return;
  }

  const errorData = {
    timestamp: new Date().toISOString(),
    error: error.message,
    stack: error.stack,
    path: context.path,
    method: context.method,
    userId: context.userId
  };

  // If Sentry is configured, use it
  if (context.env.SENTRY_DSN) {
    Sentry.captureException(error, {
      extra: {
        path: context.path,
        method: context.method,
        timestamp: errorData.timestamp
      },
      user: context.userId ? { id: context.userId } : undefined,
      tags: {
        path: context.path,
        method: context.method
      }
    });
  } else {
    // Fallback to structured logging
    console.error('Exception captured:', errorData);
  }
};

/**
 * Capture a message for logging to Sentry.
 */
export const captureMessage = (
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  extra?: Record<string, unknown>
): void => {
  Sentry.captureMessage(message, {
    level,
    extra
  });
};

/**
 * Set user context for Sentry.
 */
export const setUser = (user: { id: string; email?: string }): void => {
  Sentry.setUser(user);
};

/**
 * Add breadcrumb for debugging.
 */
export const addBreadcrumb = (breadcrumb: {
  category: string;
  message: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}): void => {
  Sentry.addBreadcrumb({
    ...breadcrumb,
    level: breadcrumb.level ?? 'info'
  });
};
