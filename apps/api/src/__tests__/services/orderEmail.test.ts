import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendOrderConfirmationEmail,
  sendShippingNotificationEmail,
  getOrderWithCustomer,
} from '../../services/orderEmail';

// Mock the email service
vi.mock('../../services/email', () => ({
  sendEmail: vi.fn(),
  getEmailTemplate: vi.fn(),
  renderTemplate: vi.fn(),
}));

import { sendEmail, getEmailTemplate, renderTemplate } from '../../services/email';

const createMockDB = () => {
  const orders: Record<number, any> = {
    1: {
      id: 1,
      status: 'paid',
      total_net: 10000,
      currency: 'JPY',
      created_at: '2025-01-15T10:00:00Z',
      customer_id: 1,
      customer_name: '田中太郎',
      customer_email: 'tanaka@example.com',
    },
    2: {
      id: 2,
      status: 'paid',
      total_net: 5000,
      currency: 'JPY',
      created_at: '2025-01-16T10:00:00Z',
      customer_id: null,
      customer_name: null,
      customer_email: null,
    },
  };

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: any[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM orders o')) {
            const orderId = args[0];
            return orders[orderId] || null;
          }
          return null;
        }),
      })),
    })),
  };
};

describe('getOrderWithCustomer', () => {
  it('returns order with customer data', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB };
    const result = await getOrderWithCustomer(env as any, 1);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(1);
    expect(result?.customer_name).toBe('田中太郎');
    expect(result?.customer_email).toBe('tanaka@example.com');
  });

  it('returns null for non-existent order', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB };
    const result = await getOrderWithCustomer(env as any, 999);

    expect(result).toBeNull();
  });
});

describe('sendOrderConfirmationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when order is not found', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB };

    const result = await sendOrderConfirmationEmail(env as any, 999);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Order not found');
  });

  it('returns error when customer email is missing', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB };

    const result = await sendOrderConfirmationEmail(env as any, 2);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Customer email not found');
  });

  it('returns error when email template is not found', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB };

    vi.mocked(getEmailTemplate).mockResolvedValue(null);

    const result = await sendOrderConfirmationEmail(env as any, 1);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Email template not found');
    expect(getEmailTemplate).toHaveBeenCalledWith(env, 'order-confirmation');
  });

  it('sends order confirmation email successfully', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB };

    const mockTemplate = {
      id: 1,
      slug: 'order-confirmation',
      name: 'Order Confirmation',
      subject: 'ご注文確認 #{{order_number}}',
      body_html: '<p>{{customer_name}}様、ご注文ありがとうございます。</p>',
      body_text: '{{customer_name}}様、ご注文ありがとうございます。',
      variables: '["customer_name", "order_number"]',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    };

    vi.mocked(getEmailTemplate).mockResolvedValue(mockTemplate);
    vi.mocked(renderTemplate).mockReturnValue({
      subject: 'ご注文確認 #1',
      html: '<p>田中太郎様、ご注文ありがとうございます。</p>',
      text: '田中太郎様、ご注文ありがとうございます。',
    });
    vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: 'msg_123' });

    const result = await sendOrderConfirmationEmail(env as any, 1);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg_123');
    expect(sendEmail).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        to: 'tanaka@example.com',
        subject: 'ご注文確認 #1',
      })
    );
  });
});

describe('sendShippingNotificationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when order is not found', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB };

    const result = await sendShippingNotificationEmail(env as any, 999, 'ヤマト運輸', '1234-5678-9012');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Order not found');
  });

  it('returns error when customer email is missing', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB };

    const result = await sendShippingNotificationEmail(env as any, 2, 'ヤマト運輸', '1234-5678-9012');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Customer email not found');
  });

  it('returns error when email template is not found', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB };

    vi.mocked(getEmailTemplate).mockResolvedValue(null);

    const result = await sendShippingNotificationEmail(env as any, 1, 'ヤマト運輸', '1234-5678-9012');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Email template not found');
    expect(getEmailTemplate).toHaveBeenCalledWith(env, 'shipping-notification');
  });

  it('sends shipping notification email successfully', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB };

    const mockTemplate = {
      id: 2,
      slug: 'shipping-notification',
      name: 'Shipping Notification',
      subject: '発送のお知らせ #{{order_number}}',
      body_html: '<p>{{customer_name}}様、ご注文の商品を発送しました。配送業者: {{carrier}}</p>',
      body_text: '{{customer_name}}様、ご注文の商品を発送しました。配送業者: {{carrier}}',
      variables: '["customer_name", "order_number", "carrier", "tracking_number"]',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    };

    vi.mocked(getEmailTemplate).mockResolvedValue(mockTemplate);
    vi.mocked(renderTemplate).mockReturnValue({
      subject: '発送のお知らせ #1',
      html: '<p>田中太郎様、ご注文の商品を発送しました。配送業者: ヤマト運輸</p>',
      text: '田中太郎様、ご注文の商品を発送しました。配送業者: ヤマト運輸',
    });
    vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: 'msg_456' });

    const result = await sendShippingNotificationEmail(env as any, 1, 'ヤマト運輸', '1234-5678-9012');

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg_456');
    expect(renderTemplate).toHaveBeenCalledWith(
      mockTemplate,
      expect.objectContaining({
        carrier: 'ヤマト運輸',
        tracking_number: '1234-5678-9012',
      })
    );
  });
});
