import type { Env } from '../env';

/**
 * Alert severity levels
 */
export type AlertLevel = 'info' | 'warning' | 'critical';

/**
 * Send alert notification to configured channels (Slack, email, etc.)
 * Skips sending in dev mode - logs to console instead.
 */
export const sendAlert = async (
  env: Env['Bindings'],
  level: AlertLevel,
  message: string,
  details?: any
): Promise<void> => {
  // Don't send alerts in dev mode - just log
  if (env.DEV_MODE === 'true') {
    console.warn('Alert (dev mode):', level, message, details);
    return;
  }

  // Send to Slack if configured
  if (env.SLACK_WEBHOOK_URL) {
    const emoji = level === 'critical' ? '🚨' : level === 'warning' ? '⚠️' : 'ℹ️';

    try {
      await fetch(env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${emoji} ${level.toUpperCase()}: ${message}`,
          attachments: details ? [{
            text: JSON.stringify(details, null, 2),
            color: level === 'critical' ? 'danger' : level === 'warning' ? 'warning' : 'good'
          }] : []
        })
      });
    } catch (error) {
      console.error('Failed to send alert to Slack:', error);
    }
  }

  // Future: Add email notifications via Resend if configured
  // if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) { ... }
};
