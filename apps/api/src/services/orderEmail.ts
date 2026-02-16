import { Env } from '../env';
import { sendEmail, getEmailTemplate, renderTemplate, EmailResult } from './email';
import { escapeHtml } from '../lib/html';

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

/**
 * Send bank transfer instructions email to customer.
 * Called when payment_intent.requires_action event is received.
 */
export const sendOrderCancellationEmail = async (
  env: Env['Bindings'],
  orderId: number,
  reason: string,
  refundAmount?: number
): Promise<EmailResult> => {
  const order = await getOrderWithCustomer(env, orderId);

  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  if (!order.customer_email) {
    return { success: false, error: 'Customer email not found' };
  }

  const items = await getOrderItems(env, orderId);

  const customerName = order.customer_name || 'お客様';
  const orderNumber = String(order.id);
  const totalAmount = formatCurrency(order.total_net, order.currency);
  const itemsHtml = buildOrderItemsHtml(items, order.currency);
  const itemsText = buildOrderItemsText(items, order.currency);
  const refundAmountStr = refundAmount !== undefined
    ? formatCurrency(refundAmount, order.currency)
    : totalAmount;

  const template = await getEmailTemplate(env, 'order-cancellation');

  if (template) {
    const rendered = renderTemplate(template, {
      customer_name: customerName,
      order_number: orderNumber,
      reason,
      total_amount: totalAmount,
      refund_amount: refundAmountStr,
      items_html: itemsHtml,
      items_text: itemsText,
    });

    return sendEmail(env, {
      to: order.customer_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  const subject = `ご注文キャンセルのお知らせ #${orderNumber}`;
  const html = buildCancellationFallbackHtml(
    customerName, orderNumber, reason, refundAmountStr, itemsHtml
  );
  const text = buildCancellationFallbackText(
    customerName, orderNumber, reason, refundAmountStr, itemsText
  );

  return sendEmail(env, {
    to: order.customer_email,
    subject,
    html,
    text,
  });
};

export const sendRefundNotificationEmail = async (
  env: Env['Bindings'],
  orderId: number,
  refundAmount: number,
  currency: string
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
  const refundAmountStr = formatCurrency(refundAmount, currency);

  const template = await getEmailTemplate(env, 'refund-notification');

  if (template) {
    const rendered = renderTemplate(template, {
      customer_name: customerName,
      order_number: orderNumber,
      refund_amount: refundAmountStr,
    });

    return sendEmail(env, {
      to: order.customer_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  const subject = `ご返金のお知らせ #${orderNumber}`;
  const html = buildRefundFallbackHtml(customerName, orderNumber, refundAmountStr);
  const text = buildRefundFallbackText(customerName, orderNumber, refundAmountStr);

  return sendEmail(env, {
    to: order.customer_email,
    subject,
    html,
    text,
  });
};

const buildCancellationFallbackHtml = (
  customerName: string,
  orderNumber: string,
  reason: string,
  refundAmount: string,
  itemsHtml: string
): string => {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#333;border-bottom:2px solid #333;padding-bottom:8px;">ご注文キャンセルのお知らせ</h2>
  <p>${escapeHtml(customerName)}様</p>
  <p>ご注文のキャンセルが完了いたしました。</p>
  <table style="margin:16px 0;">
    <tr><td style="padding:4px 8px;font-weight:bold;">注文番号:</td><td style="padding:4px 8px;">#${escapeHtml(orderNumber)}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;">キャンセル理由:</td><td style="padding:4px 8px;">${escapeHtml(reason)}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;">返金予定額:</td><td style="padding:4px 8px;">&yen;${escapeHtml(refundAmount)}</td></tr>
  </table>
  ${itemsHtml}
  <p>返金はお支払い方法に応じて、通常5〜10営業日以内に処理されます。</p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #ddd;">
  <p style="font-size:12px;color:#999;">このメールは自動送信されています。ご不明な点がございましたら、お気軽にお問い合わせください。</p>
</body>
</html>`;
};

const buildCancellationFallbackText = (
  customerName: string,
  orderNumber: string,
  reason: string,
  refundAmount: string,
  itemsText: string
): string => {
  const parts = [
    'ご注文キャンセルのお知らせ',
    '',
    `${customerName}様`,
    '',
    'ご注文のキャンセルが完了いたしました。',
    '',
    `注文番号: #${orderNumber}`,
    `キャンセル理由: ${reason}`,
    `返金予定額: ${refundAmount}円`,
  ];

  if (itemsText) {
    parts.push('', '--- 商品一覧 ---', itemsText);
  }

  parts.push(
    '',
    '返金はお支払い方法に応じて、通常5〜10営業日以内に処理されます。',
    '',
    '---',
    'このメールは自動送信されています。ご不明な点がございましたら、お気軽にお問い合わせください。'
  );

  return parts.join('\n');
};

const buildRefundFallbackHtml = (
  customerName: string,
  orderNumber: string,
  refundAmount: string
): string => {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#333;border-bottom:2px solid #333;padding-bottom:8px;">ご返金のお知らせ</h2>
  <p>${escapeHtml(customerName)}様</p>
  <p>以下のご注文について返金処理が完了いたしました。</p>
  <table style="margin:16px 0;">
    <tr><td style="padding:4px 8px;font-weight:bold;">注文番号:</td><td style="padding:4px 8px;">#${escapeHtml(orderNumber)}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;">返金額:</td><td style="padding:4px 8px;">&yen;${escapeHtml(refundAmount)}</td></tr>
  </table>
  <p>返金はお支払い方法に応じて、通常5〜10営業日以内にお客様の口座に反映されます。</p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #ddd;">
  <p style="font-size:12px;color:#999;">このメールは自動送信されています。ご不明な点がございましたら、お気軽にお問い合わせください。</p>
</body>
</html>`;
};

const buildRefundFallbackText = (
  customerName: string,
  orderNumber: string,
  refundAmount: string
): string => {
  return [
    'ご返金のお知らせ',
    '',
    `${customerName}様`,
    '',
    '以下のご注文について返金処理が完了いたしました。',
    '',
    `注文番号: #${orderNumber}`,
    `返金額: ${refundAmount}円`,
    '',
    '返金はお支払い方法に応じて、通常5〜10営業日以内にお客様の口座に反映されます。',
    '',
    '---',
    'このメールは自動送信されています。ご不明な点がございましたら、お気軽にお問い合わせください。',
  ].join('\n');
};

export const sendBankTransferInstructionsEmail = async (
  env: Env['Bindings'],
  params: {
    customerEmail: string;
    orderId: number;
    amount: number;
    currency: string;
    bankTransferInstructions: {
      type?: string;
      financial_addresses?: Array<{
        type: string;
        zengin?: {
          bank_name?: string;
          branch_name?: string;
          account_type?: string;
          account_number?: string;
          account_holder_name?: string;
        };
      }>;
      hosted_instructions_url?: string;
    };
  }
): Promise<void> => {
  const { customerEmail, orderId, amount, currency, bankTransferInstructions } = params;

  // Extract zengin (Japanese bank) details
  const zenginAddr = bankTransferInstructions.financial_addresses?.find(
    (addr) => addr.type === 'zengin'
  )?.zengin;

  const bankDetails = zenginAddr
    ? `<table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr><td style="padding:8px;border:1px solid #e5e5e5;background:#f9f9f9;font-weight:600;">銀行名</td><td style="padding:8px;border:1px solid #e5e5e5;">${zenginAddr.bank_name || '-'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e5e5;background:#f9f9f9;font-weight:600;">支店名</td><td style="padding:8px;border:1px solid #e5e5e5;">${zenginAddr.branch_name || '-'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e5e5;background:#f9f9f9;font-weight:600;">口座種別</td><td style="padding:8px;border:1px solid #e5e5e5;">${zenginAddr.account_type === 'futsu' ? '普通' : zenginAddr.account_type || '-'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e5e5;background:#f9f9f9;font-weight:600;">口座番号</td><td style="padding:8px;border:1px solid #e5e5e5;">${zenginAddr.account_number || '-'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e5e5;background:#f9f9f9;font-weight:600;">口座名義</td><td style="padding:8px;border:1px solid #e5e5e5;">${zenginAddr.account_holder_name || '-'}</td></tr>
      </table>`
    : '<p>振込先情報はStripeから提供される案内ページをご確認ください。</p>';

  const formattedAmount = new Intl.NumberFormat('ja-JP', { style: 'currency', currency }).format(amount);

  const hostedUrl = bankTransferInstructions.hosted_instructions_url;
  const hostedLink = hostedUrl
    ? `<p style="margin-top:16px;"><a href="${hostedUrl}" style="color:#0071e3;">振込先の詳細はこちら</a></p>`
    : '';

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1d1d1f;">
      <h2 style="font-size:20px;font-weight:600;">銀行振込のご案内</h2>
      <p>ご注文ありがとうございます。以下の口座にお振込みをお願いいたします。</p>

      <p style="margin:16px 0;"><strong>注文番号:</strong> #${orderId}</p>
      <p><strong>お振込金額:</strong> ${formattedAmount}</p>

      <h3 style="font-size:16px;font-weight:600;margin-top:24px;">振込先口座情報</h3>
      ${bankDetails}
      ${hostedLink}

      <p style="margin-top:24px;color:#86868b;font-size:13px;">
        お振込みの確認後、自動的に注文が確定されます。<br>
        ご不明な点がございましたら、お問い合わせください。
      </p>
    </div>
  `;

  const text = `銀行振込のご案内

ご注文ありがとうございます。以下の口座にお振込みをお願いいたします。

注文番号: #${orderId}
お振込金額: ${formattedAmount}

${zenginAddr ? `振込先口座情報:
銀行名: ${zenginAddr.bank_name || '-'}
支店名: ${zenginAddr.branch_name || '-'}
口座種別: ${zenginAddr.account_type === 'futsu' ? '普通' : zenginAddr.account_type || '-'}
口座番号: ${zenginAddr.account_number || '-'}
口座名義: ${zenginAddr.account_holder_name || '-'}` : '振込先情報はStripeの案内ページをご確認ください。'}

${hostedUrl ? `振込先の詳細: ${hostedUrl}` : ''}

お振込みの確認後、自動的に注文が確定されます。
ご不明な点がございましたら、お問い合わせください。`;

  await sendEmail(env, {
    to: customerEmail,
    subject: `【Led Kikaku】銀行振込のご案内（注文 #${orderId}）`,
    html,
    text,
  });
};

