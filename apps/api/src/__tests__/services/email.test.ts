import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendEmail,
  renderTemplate,
  EmailPayload,
  EmailTemplate,
  TemplateVariables,
} from '../../services/email';

// Mock Resend
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(),
    },
  })),
}));

import { Resend } from 'resend';

const createMockDB = () => {
  const insertedNotifications: any[] = [];
  const insertedInboxItems: any[] = [];

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: any[]) => ({
        run: vi.fn(async () => {
          if (sql.includes('INSERT INTO notifications')) {
            insertedNotifications.push({
              channel: 'email',
              status: sql.includes("'sent'") ? 'sent' : 'failed',
              payload: args[0],
              response: args[1],
            });
          }
          if (sql.includes('INSERT INTO inbox_items')) {
            insertedInboxItems.push({
              title: args[0],
              body: args[1],
              severity: 'warning',
              kind: 'email_failure',
            });
          }
          return { success: true, meta: { changes: 1 } };
        }),
        first: vi.fn(),
      })),
    })),
    getInsertedNotifications: () => insertedNotifications,
    getInsertedInboxItems: () => insertedInboxItems,
  };
};

describe('sendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when RESEND_API_KEY is not configured', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB, RESEND_API_KEY: undefined };
    const payload: EmailPayload = {
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    };

    const result = await sendEmail(env as any, payload);

    expect(result.success).toBe(false);
    expect(result.error).toBe('RESEND_API_KEY not configured');
  });

  it('sends email successfully and records notification', async () => {
    const mockDB = createMockDB();
    const env = {
      DB: mockDB,
      RESEND_API_KEY: 'test-api-key',
      RESEND_FROM_EMAIL: 'noreply@test.com',
    };
    const payload: EmailPayload = {
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    };

    // Mock successful send
    const mockResendInstance = new (Resend as any)();
    mockResendInstance.emails.send.mockResolvedValue({
      data: { id: 'msg_123' },
      error: null,
    });
    vi.mocked(Resend).mockImplementation(() => mockResendInstance);

    const result = await sendEmail(env as any, payload);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg_123');

    const notifications = mockDB.getInsertedNotifications();
    expect(notifications.length).toBe(1);
    expect(notifications[0].status).toBe('sent');
  });

  it('records failure and creates inbox alert on Resend error', async () => {
    const mockDB = createMockDB();
    const env = {
      DB: mockDB,
      RESEND_API_KEY: 'test-api-key',
      RESEND_FROM_EMAIL: 'noreply@test.com',
    };
    const payload: EmailPayload = {
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    };

    // Mock error from Resend
    const mockResendInstance = new (Resend as any)();
    mockResendInstance.emails.send.mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key' },
    });
    vi.mocked(Resend).mockImplementation(() => mockResendInstance);

    const result = await sendEmail(env as any, payload);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid API key');

    const notifications = mockDB.getInsertedNotifications();
    expect(notifications.length).toBe(1);
    expect(notifications[0].status).toBe('failed');

    const inboxItems = mockDB.getInsertedInboxItems();
    expect(inboxItems.length).toBe(1);
    expect(inboxItems[0].title).toContain('メール送信失敗');
    expect(inboxItems[0].severity).toBe('warning');
    expect(inboxItems[0].kind).toBe('email_failure');
  });

  it('handles exception from Resend SDK', async () => {
    const mockDB = createMockDB();
    const env = {
      DB: mockDB,
      RESEND_API_KEY: 'test-api-key',
      RESEND_FROM_EMAIL: 'noreply@test.com',
    };
    const payload: EmailPayload = {
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    };

    // Mock exception
    const mockResendInstance = new (Resend as any)();
    mockResendInstance.emails.send.mockRejectedValue(new Error('Network error'));
    vi.mocked(Resend).mockImplementation(() => mockResendInstance);

    const result = await sendEmail(env as any, payload);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');

    const inboxItems = mockDB.getInsertedInboxItems();
    expect(inboxItems.length).toBe(1);
  });

  it('uses default from email when RESEND_FROM_EMAIL is not set', async () => {
    const mockDB = createMockDB();
    const env = {
      DB: mockDB,
      RESEND_API_KEY: 'test-api-key',
    };
    const payload: EmailPayload = {
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    };

    const mockResendInstance = new (Resend as any)();
    mockResendInstance.emails.send.mockResolvedValue({
      data: { id: 'msg_123' },
      error: null,
    });
    vi.mocked(Resend).mockImplementation(() => mockResendInstance);

    await sendEmail(env as any, payload);

    expect(mockResendInstance.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@example.com',
      })
    );
  });
});

describe('renderTemplate', () => {
  const createMockTemplate = (overrides?: Partial<EmailTemplate>): EmailTemplate => ({
    id: 1,
    slug: 'test-template',
    name: 'Test Template',
    subject: 'Order {{order_number}} Confirmed',
    body_html: '<p>Hello {{customer_name}}, your order #{{order_number}} is confirmed.</p>',
    body_text: 'Hello {{customer_name}}, your order #{{order_number}} is confirmed.',
    variables: '["customer_name", "order_number"]',
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    ...overrides,
  });

  it('replaces variables in subject, html, and text', () => {
    const template = createMockTemplate();
    const variables: TemplateVariables = {
      customer_name: '田中太郎',
      order_number: '12345',
    };

    const result = renderTemplate(template, variables);

    expect(result.subject).toBe('Order 12345 Confirmed');
    expect(result.html).toContain('田中太郎');
    expect(result.html).toContain('#12345');
    expect(result.text).toContain('田中太郎');
    expect(result.text).toContain('#12345');
  });

  it('escapes HTML entities in HTML body', () => {
    const template = createMockTemplate({
      body_html: '<p>Hello {{customer_name}}</p>',
    });
    const variables: TemplateVariables = {
      customer_name: '<script>alert("xss")</script>',
    };

    const result = renderTemplate(template, variables);

    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;');
  });

  it('does not escape HTML in plain text body', () => {
    const template = createMockTemplate({
      body_text: 'Hello {{customer_name}}',
    });
    const variables: TemplateVariables = {
      customer_name: 'John & Jane',
    };

    const result = renderTemplate(template, variables);

    expect(result.text).toBe('Hello John & Jane');
  });

  it('leaves unmatched variables as-is', () => {
    const template = createMockTemplate({
      subject: 'Order {{order_number}} - {{missing_var}}',
    });
    const variables: TemplateVariables = {
      order_number: '12345',
    };

    const result = renderTemplate(template, variables);

    expect(result.subject).toBe('Order 12345 - {{missing_var}}');
  });

  it('handles numeric variables', () => {
    const template = createMockTemplate({
      subject: 'Total: {{total_amount}}円',
    });
    const variables: TemplateVariables = {
      total_amount: 10000,
    };

    const result = renderTemplate(template, variables);

    expect(result.subject).toBe('Total: 10000円');
  });
});
