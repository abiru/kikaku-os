import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendOrderConfirmationEmail,
  sendShippingNotificationEmail,
  getOrderWithCustomer,
  getOrderItems,
  buildOrderItemsHtml,
  buildOrderItemsText,
  buildShippingAddressHtml,
  buildShippingAddressText,
  OrderItem,
} from '../../services/orderEmail';

// Mock the email service
vi.mock('../../services/email', () => ({
  sendEmail: vi.fn(),
  getEmailTemplate: vi.fn(),
  renderTemplate: vi.fn(),
}));

import { sendEmail, getEmailTemplate, renderTemplate } from '../../services/email';

const createMockDB = (options?: {
  orderItems?: OrderItem[];
  orderMetadata?: string | null;
}) => {
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
      metadata: options?.orderMetadata ?? null,
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
      metadata: null,
    },
  };

  const items = options?.orderItems ?? [];

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
        all: vi.fn(async () => {
          if (sql.includes('FROM order_items')) {
            return { results: items };
          }
          return { results: [] };
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

describe('getOrderItems', () => {
  it('returns order items', async () => {
    const items: OrderItem[] = [
      { product_title: 'LED照明', variant_title: 'Default', quantity: 2, unit_price: 3000 },
      { product_title: 'ケーブル', variant_title: '1m', quantity: 1, unit_price: 500 },
    ];
    const mockDB = createMockDB({ orderItems: items });
    const env = { DB: mockDB };

    const result = await getOrderItems(env as any, 1);

    expect(result).toHaveLength(2);
    expect(result[0].product_title).toBe('LED照明');
    expect(result[1].variant_title).toBe('1m');
  });

  it('returns empty array when no items', async () => {
    const mockDB = createMockDB({ orderItems: [] });
    const env = { DB: mockDB };

    const result = await getOrderItems(env as any, 1);

    expect(result).toHaveLength(0);
  });
});

describe('buildOrderItemsHtml', () => {
  it('renders items as HTML table', () => {
    const items: OrderItem[] = [
      { product_title: 'LED照明', variant_title: 'Default', quantity: 2, unit_price: 3000 },
      { product_title: 'ケーブル', variant_title: '1m', quantity: 1, unit_price: 500 },
    ];

    const html = buildOrderItemsHtml(items, 'JPY');

    expect(html).toContain('<table');
    expect(html).toContain('LED照明');
    expect(html).toContain('ケーブル - 1m');
    expect(html).toContain('商品名');
    expect(html).toContain('数量');
    expect(html).toContain('単価');
    expect(html).toContain('小計');
  });

  it('uses product title only when variant is Default', () => {
    const items: OrderItem[] = [
      { product_title: 'LED照明', variant_title: 'Default', quantity: 1, unit_price: 3000 },
    ];

    const html = buildOrderItemsHtml(items, 'JPY');

    expect(html).toContain('LED照明');
    expect(html).not.toContain('Default');
  });

  it('returns empty string for empty items', () => {
    const html = buildOrderItemsHtml([], 'JPY');
    expect(html).toBe('');
  });
});

describe('buildOrderItemsText', () => {
  it('renders items as plain text list', () => {
    const items: OrderItem[] = [
      { product_title: 'LED照明', variant_title: 'Default', quantity: 2, unit_price: 3000 },
      { product_title: 'ケーブル', variant_title: '1m', quantity: 1, unit_price: 500 },
    ];

    const text = buildOrderItemsText(items, 'JPY');

    expect(text).toContain('LED照明 x2');
    expect(text).toContain('ケーブル - 1m x1');
    expect(text).toContain('6,000円');
    expect(text).toContain('500円');
  });

  it('returns empty string for empty items', () => {
    const text = buildOrderItemsText([], 'JPY');
    expect(text).toBe('');
  });
});

describe('buildShippingAddressHtml', () => {
  it('renders full shipping address', () => {
    const shipping = {
      name: '田中太郎',
      address: {
        postal_code: '100-0001',
        state: '東京都',
        city: '千代田区',
        line1: '丸の内1-1-1',
        line2: 'ビル5F',
      },
      phone: '03-1234-5678',
    };

    const html = buildShippingAddressHtml(shipping);

    expect(html).toContain('配送先');
    expect(html).toContain('田中太郎');
    expect(html).toContain('〒100-0001');
    expect(html).toContain('東京都');
    expect(html).toContain('丸の内1-1-1');
    expect(html).toContain('TEL: 03-1234-5678');
  });

  it('handles partial address', () => {
    const shipping = { name: '田中太郎' };

    const html = buildShippingAddressHtml(shipping);

    expect(html).toContain('田中太郎');
    expect(html).not.toContain('〒');
  });
});

describe('buildShippingAddressText', () => {
  it('renders full shipping address as text', () => {
    const shipping = {
      name: '田中太郎',
      address: {
        postal_code: '100-0001',
        state: '東京都',
        city: '千代田区',
        line1: '丸の内1-1-1',
      },
      phone: '03-1234-5678',
    };

    const text = buildShippingAddressText(shipping);

    expect(text).toContain('配送先:');
    expect(text).toContain('田中太郎');
    expect(text).toContain('〒100-0001');
    expect(text).toContain('TEL: 03-1234-5678');
  });

  it('returns empty string for empty shipping', () => {
    const text = buildShippingAddressText({});
    expect(text).toBe('');
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

  it('sends email with DB template when available', async () => {
    const items: OrderItem[] = [
      { product_title: 'LED照明', variant_title: 'Default', quantity: 1, unit_price: 10000 },
    ];
    const mockDB = createMockDB({ orderItems: items });
    const env = { DB: mockDB };

    const mockTemplate = {
      id: 1,
      slug: 'order-confirmation',
      name: 'Order Confirmation',
      subject: 'ご注文確認 #{{order_number}}',
      body_html: '<p>{{customer_name}}様、ご注文ありがとうございます。{{items_html}}</p>',
      body_text: '{{customer_name}}様、ご注文ありがとうございます。{{items_text}}',
      variables: '["customer_name", "order_number", "items_html", "items_text"]',
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
    expect(renderTemplate).toHaveBeenCalledWith(
      mockTemplate,
      expect.objectContaining({
        customer_name: '田中太郎',
        order_number: '1',
        items_html: expect.stringContaining('LED照明'),
        items_text: expect.stringContaining('LED照明'),
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        to: 'tanaka@example.com',
        subject: 'ご注文確認 #1',
      })
    );
  });

  it('uses fallback template when DB template is not found', async () => {
    const items: OrderItem[] = [
      { product_title: 'LED照明', variant_title: 'Default', quantity: 2, unit_price: 3000 },
    ];
    const mockDB = createMockDB({ orderItems: items });
    const env = { DB: mockDB };

    vi.mocked(getEmailTemplate).mockResolvedValue(null);
    vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: 'msg_fallback' });

    const result = await sendOrderConfirmationEmail(env as any, 1);

    expect(result.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        to: 'tanaka@example.com',
        subject: 'ご注文確認 #1',
        html: expect.stringContaining('ご注文確認'),
        text: expect.stringContaining('ご注文確認'),
      })
    );
    // Verify fallback HTML includes items
    const callArgs = vi.mocked(sendEmail).mock.calls[0][1];
    expect(callArgs.html).toContain('LED照明');
    expect(callArgs.text).toContain('LED照明');
  });

  it('includes shipping address in fallback template', async () => {
    const shippingMetadata = JSON.stringify({
      shipping: {
        name: '田中太郎',
        address: {
          postal_code: '100-0001',
          state: '東京都',
          city: '千代田区',
          line1: '丸の内1-1-1',
        },
        phone: '03-1234-5678',
      },
    });
    const mockDB = createMockDB({
      orderItems: [],
      orderMetadata: shippingMetadata,
    });
    const env = { DB: mockDB };

    vi.mocked(getEmailTemplate).mockResolvedValue(null);
    vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: 'msg_ship' });

    const result = await sendOrderConfirmationEmail(env as any, 1);

    expect(result.success).toBe(true);
    const callArgs = vi.mocked(sendEmail).mock.calls[0][1];
    expect(callArgs.html).toContain('配送先');
    expect(callArgs.html).toContain('〒100-0001');
    expect(callArgs.text).toContain('配送先');
    expect(callArgs.text).toContain('東京都');
  });

  it('passes shipping data as template variables when using DB template', async () => {
    const shippingMetadata = JSON.stringify({
      shipping: {
        name: '田中太郎',
        address: { postal_code: '100-0001', state: '東京都', city: '千代田区', line1: '丸の内1-1-1' },
      },
    });
    const mockDB = createMockDB({
      orderItems: [],
      orderMetadata: shippingMetadata,
    });
    const env = { DB: mockDB };

    const mockTemplate = {
      id: 1,
      slug: 'order-confirmation',
      name: 'Order Confirmation',
      subject: 'ご注文確認 #{{order_number}}',
      body_html: '<p>{{shipping_html}}</p>',
      body_text: '{{shipping_text}}',
      variables: '[]',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    };

    vi.mocked(getEmailTemplate).mockResolvedValue(mockTemplate);
    vi.mocked(renderTemplate).mockReturnValue({
      subject: 'ご注文確認 #1',
      html: '<p>配送先あり</p>',
      text: '配送先あり',
    });
    vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: 'msg_tmpl' });

    await sendOrderConfirmationEmail(env as any, 1);

    expect(renderTemplate).toHaveBeenCalledWith(
      mockTemplate,
      expect.objectContaining({
        shipping_html: expect.stringContaining('配送先'),
        shipping_text: expect.stringContaining('配送先'),
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

  it('uses fallback template when DB template is not found', async () => {
    const mockDB = createMockDB();
    const env = { DB: mockDB };

    vi.mocked(getEmailTemplate).mockResolvedValue(null);
    vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: 'msg_fallback' });

    const result = await sendShippingNotificationEmail(env as any, 1, 'ヤマト運輸', '1234-5678-9012');

    expect(result.success).toBe(true);
    expect(getEmailTemplate).toHaveBeenCalledWith(env, 'shipping-notification');
    expect(sendEmail).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        to: 'tanaka@example.com',
        subject: '発送のお知らせ #1',
        html: expect.stringContaining('発送のお知らせ'),
        text: expect.stringContaining('発送のお知らせ'),
      })
    );
    const callArgs = vi.mocked(sendEmail).mock.calls[0][1];
    expect(callArgs.html).toContain('ヤマト運輸');
    expect(callArgs.html).toContain('1234-5678-9012');
    expect(callArgs.text).toContain('ヤマト運輸');
    expect(callArgs.text).toContain('1234-5678-9012');
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
