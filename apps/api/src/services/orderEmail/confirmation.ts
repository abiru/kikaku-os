import { Env } from '../../env';
import { sendEmail, getEmailTemplate, renderTemplate, EmailResult } from '../email';
import { escapeHtml } from '../../lib/html';
import { getOrderWithCustomer } from './data';
import { getOrderItems } from './data';
import { parseShippingAddress, formatDate, formatCurrency } from './formatters';
import { buildOrderItemsHtml, buildOrderItemsText, buildShippingAddressHtml, buildShippingAddressText } from './builders';

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
