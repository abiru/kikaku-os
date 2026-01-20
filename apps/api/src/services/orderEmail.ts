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
      c.name as customer_name,
      c.email as customer_email
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE o.id = ?
  `).bind(orderId).first<OrderWithCustomer>();

  return result || null;
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

  const template = await getEmailTemplate(env, 'order-confirmation');
  if (!template) {
    return { success: false, error: 'Email template not found' };
  }

  const orderDate = formatDate(order.created_at);
  const totalAmount = formatCurrency(order.total_net, order.currency);

  const rendered = renderTemplate(template, {
    customer_name: order.customer_name || 'お客様',
    order_number: String(order.id),
    order_date: orderDate,
    total_amount: totalAmount,
  });

  return sendEmail(env, {
    to: order.customer_email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
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

  const template = await getEmailTemplate(env, 'shipping-notification');
  if (!template) {
    return { success: false, error: 'Email template not found' };
  }

  const rendered = renderTemplate(template, {
    customer_name: order.customer_name || 'お客様',
    order_number: String(order.id),
    carrier,
    tracking_number: trackingNumber,
  });

  return sendEmail(env, {
    to: order.customer_email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
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
