import { Env } from '../env';

export type NotificationPayload = {
  inboxItemId: number;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  kind: string;
  date: string;
};

export type NotificationResult = {
  success: boolean;
  error?: string;
};

type SlackMessage = {
  text: string;
  blocks: Array<{
    type: string;
    text?: { type: string; text: string };
    elements?: Array<{ type: string; text: string }>;
  }>;
};

export const buildSlackMessage = (payload: NotificationPayload): SlackMessage => {
  const emoji = payload.severity === 'critical' ? '🚨' : '⚠️';
  const bodyText = typeof payload.body === 'string' ? payload.body : '';

  return {
    text: `${emoji} ${payload.title}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${emoji} ${payload.title}*\n${bodyText.slice(0, 500)}`
        }
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Kind: \`${payload.kind}\` | Date: ${payload.date} | Severity: ${payload.severity}` }
        ]
      }
    ]
  };
};

export const sendSlackNotification = async (
  env: Env['Bindings'],
  payload: NotificationPayload
): Promise<NotificationResult> => {
  const webhookUrl = env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return { success: false, error: 'SLACK_WEBHOOK_URL not configured' };
  }

  const message = buildSlackMessage(payload);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      await env.DB.prepare(
        `INSERT INTO notifications (channel, inbox_item_id, status, payload, response)
         VALUES ('slack', ?, 'failed', ?, ?)`
      ).bind(payload.inboxItemId, JSON.stringify(message), `HTTP ${response.status}: ${errorText}`).run();

      return { success: false, error: `HTTP ${response.status}` };
    }

    await env.DB.prepare(
      `INSERT INTO notifications (channel, inbox_item_id, status, payload, sent_at)
       VALUES ('slack', ?, 'sent', ?, datetime('now'))`
    ).bind(payload.inboxItemId, JSON.stringify(message)).run();

    return { success: true };
  } catch (err: any) {
    const errorMessage = String(err?.message || err);

    await env.DB.prepare(
      `INSERT INTO notifications (channel, inbox_item_id, status, payload, response)
       VALUES ('slack', ?, 'failed', ?, ?)`
    ).bind(payload.inboxItemId, JSON.stringify(message), errorMessage).run();

    return { success: false, error: errorMessage };
  }
};
