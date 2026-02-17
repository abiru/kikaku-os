import { Env } from '../../env';
import { sendEmail, getEmailTemplate, renderTemplate, EmailResult } from '../email';
import { escapeHtml } from '../../lib/html';
import { getOrderWithCustomer } from './data';

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
