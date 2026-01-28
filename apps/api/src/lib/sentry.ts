import type { Env } from '../env';

/**
 * Capture exception for error tracking.
 * Logs structured error data in production (can be extended to send to Sentry).
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

  console.error('Exception captured:', errorData);

  // Future: Send to Sentry if SENTRY_DSN configured
  // if (context.env.SENTRY_DSN) {
  //   // Use Sentry SDK to capture exception
  //   // await Sentry.captureException(error, { extra: errorData });
  // }
};
