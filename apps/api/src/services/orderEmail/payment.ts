import { Env } from '../../env';
import { sendEmail, getEmailTemplate, renderTemplate, EmailResult } from '../email';
import { escapeHtml } from '../../lib/html';
import { getOrderWithCustomer } from './data';
import { formatCurrency } from './formatters';

const buildPaymentFailedFallbackHtml = (
  customerName: string,
  orderNumber: string,
  totalAmount: string,
  retryUrl: string
): string => {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#333;border-bottom:2px solid #333;padding-bottom:8px;">お支払いに関するお知らせ</h2>
  <p>${escapeHtml(customerName)}様</p>
  <p>ご注文 #${escapeHtml(orderNumber)} のお支払い処理を完了できませんでした。</p>
  <table style="margin:16px 0;">
    <tr><td style="padding:4px 8px;font-weight:bold;">注文番号:</td><td style="padding:4px 8px;">#${escapeHtml(orderNumber)}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;">ご注文金額:</td><td style="padding:4px 8px;">&yen;${escapeHtml(totalAmount)}</td></tr>
  </table>
  <p>お手数ですが、以下のリンクからお支払いをお試しください。</p>
  <p style="margin:24px 0;">
    <a href="${retryUrl}" style="display:inline-block;background:#333;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">お支払いをやり直す</a>
  </p>
  <p style="font-size:14px;color:#666;">カード情報の確認や、別のお支払い方法をお試しいただくことで解決する場合がございます。</p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #ddd;">
  <p style="font-size:12px;color:#999;">このメールは自動送信されています。ご不明な点がございましたら、お気軽にお問い合わせください。</p>
</body>
</html>`;
};

const buildPaymentFailedFallbackText = (
  customerName: string,
  orderNumber: string,
  totalAmount: string,
  retryUrl: string
): string => {
  return [
    'お支払いに関するお知らせ',
    '',
    `${customerName}様`,
    '',
    `ご注文 #${orderNumber} のお支払い処理を完了できませんでした。`,
    '',
    `注文番号: #${orderNumber}`,
    `ご注文金額: ${totalAmount}円`,
    '',
    'お手数ですが、以下のリンクからお支払いをお試しください。',
    retryUrl,
    '',
    'カード情報の確認や、別のお支払い方法をお試しいただくことで解決する場合がございます。',
    '',
    '---',
    'このメールは自動送信されています。ご不明な点がございましたら、お気軽にお問い合わせください。',
  ].join('\n');
};

/**
 * Send payment failure notification email to customer.
 * Called when payment_intent.payment_failed event is received.
 * Does NOT expose raw Stripe error details to the customer.
 */
export const sendPaymentFailedEmail = async (
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

  const customerName = order.customer_name || 'お客様';
  const orderNumber = String(order.id);
  const totalAmount = formatCurrency(order.total_net, order.currency);
  const retryUrl = `${env.STOREFRONT_BASE_URL}/checkout`;

  const template = await getEmailTemplate(env, 'payment-failure-notification');

  if (template) {
    const rendered = renderTemplate(template, {
      customer_name: customerName,
      order_number: orderNumber,
      total_amount: totalAmount,
      retry_url: retryUrl,
    });

    return sendEmail(env, {
      to: order.customer_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  // Fallback: use built-in template when DB template is not configured
  const subject = `お支払いに関するお知らせ（注文 #${orderNumber}）`;
  const html = buildPaymentFailedFallbackHtml(customerName, orderNumber, totalAmount, retryUrl);
  const text = buildPaymentFailedFallbackText(customerName, orderNumber, totalAmount, retryUrl);

  return sendEmail(env, {
    to: order.customer_email,
    subject,
    html,
    text,
  });
};
