/**
 * Order status calculation logic
 * Determines order status based on refund amounts
 */

export type OrderStatusInput = {
  status: string;
  total_net: number;
  refunded_amount: number;
};

export type OrderStatus = 'pending' | 'paid' | 'partially_refunded' | 'refunded';

/**
 * Calculate the appropriate order status based on payment and refund state
 *
 * Rules:
 * - pending: Order not yet paid
 * - paid: Paid with no refunds
 * - partially_refunded: Some amount refunded but not full
 * - refunded: Full amount refunded
 */
export function calculateOrderStatus(order: OrderStatusInput): OrderStatus {
  // If order is still pending, don't change it
  if (order.status === 'pending') {
    return 'pending';
  }

  // No refunds = paid
  if (order.refunded_amount === 0) {
    return 'paid';
  }

  // Full refund (>= total) = refunded
  if (order.refunded_amount >= order.total_net) {
    return 'refunded';
  }

  // Partial refund
  return 'partially_refunded';
}

/**
 * Determine the reason string for status history tracking
 */
export function getStatusChangeReason(newStatus: OrderStatus): string {
  switch (newStatus) {
    case 'paid':
      return 'payment_succeeded';
    case 'partially_refunded':
      return 'refund_partial';
    case 'refunded':
      return 'refund_full';
    default:
      return 'unknown';
  }
}
