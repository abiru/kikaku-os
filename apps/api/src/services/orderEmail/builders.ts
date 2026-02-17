import { escapeHtml } from '../../lib/html';
import type { OrderItem, ShippingAddress } from './types';
import { formatCurrency } from './formatters';

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
