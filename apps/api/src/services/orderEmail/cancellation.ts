import { Env } from '../../env';
import { sendEmail, getEmailTemplate, renderTemplate, EmailResult } from '../email';
import { escapeHtml } from '../../lib/html';
import { getOrderWithCustomer, getOrderItems } from './data';
import { formatCurrency } from './formatters';
import { buildOrderItemsHtml, buildOrderItemsText } from './builders';

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
