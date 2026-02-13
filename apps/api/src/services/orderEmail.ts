import { Env } from '../env';
import { sendEmail, getEmailTemplate, renderTemplate, EmailResult } from './email';

type OrderWithCustomer = {
  id: number;
  status: string;
  total_net: number;
  currency: string;
  created_at: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  metadata: string | null;
};

export type OrderItem = {
  product_title: string;
  variant_title: string;
  quantity: number;
  unit_price: number;
};

type ShippingAddress = {
  name?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  phone?: string;
};

export const getOrderWithCustomer = async (
  env: Env['Bindings'],
  orderId: number
): Promise<OrderWithCustomer | null> => {
  const result = await env.DB.prepare(`
    SELECT
      o.id,
      o.status,
      o.total_net,
      o.currency,
      o.created_at,
      o.customer_id,
      o.metadata,
      c.name as customer_name,
      c.email as customer_email
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE o.id = ?
  `).bind(orderId).first<OrderWithCustomer>();

  return result || null;
};

export const getOrderItems = async (
  env: Env['Bindings'],
  orderId: number
): Promise<OrderItem[]> => {
  const result = await env.DB.prepare(`
    SELECT
      p.title as product_title,
      v.title as variant_title,
      oi.quantity,
      oi.unit_price
    FROM order_items oi
    LEFT JOIN variants v ON v.id = oi.variant_id
    LEFT JOIN products p ON p.id = v.product_id
    WHERE oi.order_id = ?
  `).bind(orderId).all<OrderItem>();

  return result.results || [];
};

const parseShippingAddress = (metadata: string | null): ShippingAddress | null => {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    return parsed.shipping || null;
  } catch {
    return null;
  }
};

export const buildOrderItemsHtml = (
  items: OrderItem[],
  currency: string
): string => {
  if (items.length === 0) return '';

  const rows = items.map((item) => {
    const title = item.variant_title !== 'Default'
      ? `${item.product_title} - ${item.variant_title}`
      : item.product_title;
    const subtotal = item.unit_price * item.quantity;
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(title)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">&yen;${formatCurrency(item.unit_price, currency)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">&yen;${formatCurrency(subtotal, currency)}</td>
    </tr>`;
  });

  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <thead>
      <tr style="background:#f8f8f8;">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd;">商品名</th>
        <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #ddd;">数量</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd;">単価</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd;">小計</th>
      </tr>
    </thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
};

export const buildOrderItemsText = (
  items: OrderItem[],
  currency: string
): string => {
  if (items.length === 0) return '';

  const lines = items.map((item) => {
    const title = item.variant_title !== 'Default'
      ? `${item.product_title} - ${item.variant_title}`
      : item.product_title;
    const subtotal = item.unit_price * item.quantity;
    return `- ${title} x${item.quantity} ... ${formatCurrency(subtotal, currency)}円`;
  });

  return lines.join('\n');
};

export const buildShippingAddressHtml = (shipping: ShippingAddress): string => {
  const parts: string[] = [];
  if (shipping.name) parts.push(escapeHtml(shipping.name));
  if (shipping.address) {
    const addr = shipping.address;
    if (addr.postal_code) parts.push(`〒${escapeHtml(addr.postal_code)}`);
    const addressLine = [addr.state, addr.city, addr.line1, addr.line2]
      .filter(Boolean)
      .map((s) => escapeHtml(s!))
      .join(' ');
    if (addressLine) parts.push(addressLine);
  }
  if (shipping.phone) parts.push(`TEL: ${escapeHtml(shipping.phone)}`);

  return parts.length > 0
    ? `<div style="margin:16px 0;padding:12px;background:#f8f8f8;border-radius:4px;">
        <strong>配送先:</strong><br>${parts.join('<br>')}
      </div>`
    : '';
};

export const buildShippingAddressText = (shipping: ShippingAddress): string => {
  const parts: string[] = [];
  if (shipping.name) parts.push(shipping.name);
  if (shipping.address) {
    const addr = shipping.address;
    if (addr.postal_code) parts.push(`〒${addr.postal_code}`);
    const addressLine = [addr.state, addr.city, addr.line1, addr.line2]
      .filter(Boolean)
      .join(' ');
    if (addressLine) parts.push(addressLine);
  }
  if (shipping.phone) parts.push(`TEL: ${shipping.phone}`);

  return parts.length > 0
    ? `配送先:\n${parts.join('\n')}`
    : '';
};

const buildFallbackHtml = (
  customerName: string,
  orderNumber: string,
  orderDate: string,
  totalAmount: string,
  itemsHtml: string,
  shippingHtml: string
): string => {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#333;border-bottom:2px solid #333;padding-bottom:8px;">ご注文確認</h2>
  <p>${escapeHtml(customerName)}様</p>
  <p>この度はご注文いただきありがとうございます。以下の内容でご注文を承りました。</p>
  <table style="margin:16px 0;">
    <tr><td style="padding:4px 8px;font-weight:bold;">注文番号:</td><td style="padding:4px 8px;">#${escapeHtml(orderNumber)}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;">注文日:</td><td style="padding:4px 8px;">${escapeHtml(orderDate)}</td></tr>
  </table>
  ${itemsHtml}
  <p style="font-size:18px;font-weight:bold;text-align:right;margin:16px 0;">合計: &yen;${escapeHtml(totalAmount)}</p>
  ${shippingHtml}
  <hr style="margin:24px 0;border:none;border-top:1px solid #ddd;">
  <p style="font-size:12px;color:#999;">このメールは自動送信されています。ご不明な点がございましたら、お気軽にお問い合わせください。</p>
</body>
</html>`;
};

const buildFallbackText = (
  customerName: string,
  orderNumber: string,
  orderDate: string,
  totalAmount: string,
  itemsText: string,
  shippingText: string
): string => {
  const parts = [
    `ご注文確認`,
    ``,
    `${customerName}様`,
    ``,
    `この度はご注文いただきありがとうございます。`,
    `以下の内容でご注文を承りました。`,
    ``,
    `注文番号: #${orderNumber}`,
    `注文日: ${orderDate}`,
  ];

  if (itemsText) {
    parts.push('', '--- 商品一覧 ---', itemsText);
  }

  parts.push('', `合計: ${totalAmount}円`);

  if (shippingText) {
    parts.push('', shippingText);
  }

  parts.push(
    '',
    '---',
    'このメールは自動送信されています。ご不明な点がございましたら、お気軽にお問い合わせください。'
  );

  return parts.join('\n');
};

export const sendOrderConfirmationEmail = async (
  env: Env['Bindings'],
  orderId: number
): Promise<EmailResult> => {
  const order = await getOrderWithCustomer(env, orderId);

  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  if (!order.customer_email) {
    return { success: false, error: 'Customer email not found' };
  }

  const items = await getOrderItems(env, orderId);
  const shipping = parseShippingAddress(order.metadata);

  const customerName = order.customer_name || 'お客様';
  const orderNumber = String(order.id);
  const orderDate = formatDate(order.created_at);
  const totalAmount = formatCurrency(order.total_net, order.currency);
  const itemsHtml = buildOrderItemsHtml(items, order.currency);
  const itemsText = buildOrderItemsText(items, order.currency);
  const shippingHtml = shipping ? buildShippingAddressHtml(shipping) : '';
  const shippingText = shipping ? buildShippingAddressText(shipping) : '';

  const template = await getEmailTemplate(env, 'order-confirmation');

  if (template) {
    const rendered = renderTemplate(template, {
      customer_name: customerName,
      order_number: orderNumber,
      order_date: orderDate,
      total_amount: totalAmount,
      items_html: itemsHtml,
      items_text: itemsText,
      shipping_html: shippingHtml,
      shipping_text: shippingText,
    });

    return sendEmail(env, {
      to: order.customer_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  // Fallback: use built-in template when DB template is not configured
  const subject = `ご注文確認 #${orderNumber}`;
  const html = buildFallbackHtml(
    customerName, orderNumber, orderDate, totalAmount, itemsHtml, shippingHtml
  );
  const text = buildFallbackText(
    customerName, orderNumber, orderDate, totalAmount, itemsText, shippingText
  );

  return sendEmail(env, {
    to: order.customer_email,
    subject,
    html,
    text,
  });
};

export const sendShippingNotificationEmail = async (
  env: Env['Bindings'],
  orderId: number,
  carrier: string,
  trackingNumber: string
): Promise<EmailResult> => {
  const order = await getOrderWithCustomer(env, orderId);

  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  if (!order.customer_email) {
    return { success: false, error: 'Customer email not found' };
  }

  const customerName = order.customer_name || 'お客様';
  const orderNumber = String(order.id);

  const template = await getEmailTemplate(env, 'shipping-notification');

  if (template) {
    const rendered = renderTemplate(template, {
      customer_name: customerName,
      order_number: orderNumber,
      carrier,
      tracking_number: trackingNumber,
    });

    return sendEmail(env, {
      to: order.customer_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  // Fallback: use built-in template when DB template is not configured
  const subject = `発送のお知らせ #${orderNumber}`;
  const html = buildShippingFallbackHtml(customerName, orderNumber, carrier, trackingNumber);
  const text = buildShippingFallbackText(customerName, orderNumber, carrier, trackingNumber);

  return sendEmail(env, {
    to: order.customer_email,
    subject,
    html,
    text,
  });
};

const buildShippingFallbackHtml = (
  customerName: string,
  orderNumber: string,
  carrier: string,
  trackingNumber: string
): string => {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#333;border-bottom:2px solid #333;padding-bottom:8px;">発送のお知らせ</h2>
  <p>${escapeHtml(customerName)}様</p>
  <p>ご注文いただいた商品を発送いたしました。</p>
  <table style="margin:16px 0;">
    <tr><td style="padding:4px 8px;font-weight:bold;">注文番号:</td><td style="padding:4px 8px;">#${escapeHtml(orderNumber)}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;">配送業者:</td><td style="padding:4px 8px;">${escapeHtml(carrier)}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;">追跡番号:</td><td style="padding:4px 8px;">${escapeHtml(trackingNumber)}</td></tr>
  </table>
  <p>お届けまでしばらくお待ちください。</p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #ddd;">
  <p style="font-size:12px;color:#999;">このメールは自動送信されています。ご不明な点がございましたら、お気軽にお問い合わせください。</p>
</body>
</html>`;
};

const buildShippingFallbackText = (
  customerName: string,
  orderNumber: string,
  carrier: string,
  trackingNumber: string
): string => {
  return [
    '発送のお知らせ',
    '',
    `${customerName}様`,
    '',
    'ご注文いただいた商品を発送いたしました。',
    '',
    `注文番号: #${orderNumber}`,
    `配送業者: ${carrier}`,
    `追跡番号: ${trackingNumber}`,
    '',
    'お届けまでしばらくお待ちください。',
    '',
    '---',
    'このメールは自動送信されています。ご不明な点がございましたら、お気軽にお問い合わせください。',
  ].join('\n');
};

const formatDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const formatCurrency = (amount: number, currency: string): string => {
  if (currency === 'JPY') {
    return amount.toLocaleString('ja-JP');
  }
  return `${amount.toLocaleString()} ${currency}`;
};

const escapeHtml = (text: string): string => {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
};
