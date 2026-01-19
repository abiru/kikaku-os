import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendSlackNotification, buildSlackMessage, type NotificationPayload } from './notifications';

const createMockPayload = (overrides?: Partial<NotificationPayload>): NotificationPayload => ({
  inboxItemId: 1,
  title: 'Test Alert',
  body: 'Test body content',
  severity: 'warning',
  kind: 'test_kind',
  date: '2025-01-15',
  ...overrides
});

const createMockDB = () => {
  const insertedNotifications: any[] = [];

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: any[]) => ({
        run: vi.fn(async () => {
          if (sql.includes('INSERT INTO notifications')) {
            // SQL: INSERT INTO notifications (channel, inbox_item_id, status, payload, sent_at/response)
            // For sent: VALUES ('slack', ?, 'sent', ?, datetime('now')) -> bind(inbox_item_id, payload)
            // For failed: VALUES ('slack', ?, 'failed', ?, ?) -> bind(inbox_item_id, payload, response)
            const isSent = sql.includes("'sent'");
            insertedNotifications.push({
              channel: 'slack',
              inbox_item_id: args[0],
              status: isSent ? 'sent' : 'failed',
              payload: args[1],
              response: isSent ? undefined : args[2]
            });
          }
          return { success: true, meta: { changes: 1 } };
        })
      }))
    })),
    getInsertedNotifications: () => insertedNotifications
  };
};

describe('buildSlackMessage', () => {
  it('builds message with warning emoji for warning severity', () => {
    const payload = createMockPayload({ severity: 'warning' });
    const message = buildSlackMessage(payload);

    expect(message.text).toContain('⚠️');
    expect(message.text).toContain('Test Alert');
    expect(message.blocks[0].text?.text).toContain('⚠️');
  });

  it('builds message with critical emoji for critical severity', () => {
    const payload = createMockPayload({ severity: 'critical' });
    const message = buildSlackMessage(payload);

    expect(message.text).toContain('🚨');
    expect(message.blocks[0].text?.text).toContain('🚨');
  });

  it('includes kind and date in context', () => {
    const payload = createMockPayload({ kind: 'low_stock', date: '2025-01-20' });
    const message = buildSlackMessage(payload);

    const contextText = message.blocks[1].elements?.[0].text || '';
    expect(contextText).toContain('low_stock');
    expect(contextText).toContain('2025-01-20');
  });

  it('truncates long body text', () => {
    const longBody = 'x'.repeat(1000);
    const payload = createMockPayload({ body: longBody });
    const message = buildSlackMessage(payload);

    const bodyText = message.blocks[0].text?.text || '';
    expect(bodyText.length).toBeLessThan(600); // 500 chars + emoji + title
  });
});

describe('sendSlackNotification', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('returns error when SLACK_WEBHOOK_URL is not configured', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB, SLACK_WEBHOOK_URL: undefined };
    const payload = createMockPayload();

    const result = await sendSlackNotification(env as any, payload);

    expect(result.success).toBe(false);
    expect(result.error).toBe('SLACK_WEBHOOK_URL not configured');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns error when SLACK_WEBHOOK_URL is empty string', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB, SLACK_WEBHOOK_URL: '' };
    const payload = createMockPayload();

    const result = await sendSlackNotification(env as any, payload);

    expect(result.success).toBe(false);
    expect(result.error).toBe('SLACK_WEBHOOK_URL not configured');
  });

  it('sends notification and records success', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB, SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test' };
    const payload = createMockPayload();

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200
    });

    const result = await sendSlackNotification(env as any, payload);

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/test',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const notifications = mockDB.getInsertedNotifications();
    expect(notifications.length).toBe(1);
    expect(notifications[0].status).toBe('sent');
    expect(notifications[0].channel).toBe('slack');
  });

  it('records failure when HTTP request fails', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB, SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test' };
    const payload = createMockPayload();

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Internal Server Error')
    });

    const result = await sendSlackNotification(env as any, payload);

    expect(result.success).toBe(false);
    expect(result.error).toBe('HTTP 500');

    const notifications = mockDB.getInsertedNotifications();
    expect(notifications.length).toBe(1);
    expect(notifications[0].status).toBe('failed');
  });

  it('records failure when fetch throws exception', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB, SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test' };
    const payload = createMockPayload();

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const result = await sendSlackNotification(env as any, payload);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');

    const notifications = mockDB.getInsertedNotifications();
    expect(notifications.length).toBe(1);
    expect(notifications[0].status).toBe('failed');
    expect(notifications[0].response).toBe('Network error');
  });
});
