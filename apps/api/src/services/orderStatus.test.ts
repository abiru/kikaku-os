import { describe, it, expect } from 'vitest';
import {
  calculateOrderStatus,
  getStatusChangeReason,
  type OrderStatusInput,
  type OrderStatus
} from './orderStatus';

describe('orderStatus', () => {
  describe('calculateOrderStatus', () => {
    describe('pending orders', () => {
      it('returns pending when order status is pending regardless of amounts', () => {
        const order: OrderStatusInput = {
          status: 'pending',
          total_net: 10000,
          refunded_amount: 0
        };

        expect(calculateOrderStatus(order)).toBe('pending');
      });

      it('returns pending even if refunded_amount is non-zero but status is pending', () => {
        const order: OrderStatusInput = {
          status: 'pending',
          total_net: 10000,
          refunded_amount: 5000
        };

        expect(calculateOrderStatus(order)).toBe('pending');
      });

      it('returns pending for pending order with full refund amount', () => {
        const order: OrderStatusInput = {
          status: 'pending',
          total_net: 10000,
          refunded_amount: 10000
        };

        expect(calculateOrderStatus(order)).toBe('pending');
      });
    });

    describe('paid orders with no refunds', () => {
      it('returns paid when refunded_amount is zero', () => {
        const order: OrderStatusInput = {
          status: 'paid',
          total_net: 10000,
          refunded_amount: 0
        };

        expect(calculateOrderStatus(order)).toBe('paid');
      });

      it('returns paid for any non-pending status with zero refunds', () => {
        const order: OrderStatusInput = {
          status: 'completed',
          total_net: 25000,
          refunded_amount: 0
        };

        expect(calculateOrderStatus(order)).toBe('paid');
      });

      it('returns paid for zero total_net with zero refunds', () => {
        const order: OrderStatusInput = {
          status: 'paid',
          total_net: 0,
          refunded_amount: 0
        };

        expect(calculateOrderStatus(order)).toBe('paid');
      });
    });

    describe('fully refunded orders', () => {
      it('returns refunded when refund equals total', () => {
        const order: OrderStatusInput = {
          status: 'paid',
          total_net: 10000,
          refunded_amount: 10000
        };

        expect(calculateOrderStatus(order)).toBe('refunded');
      });

      it('returns refunded when refund exceeds total', () => {
        const order: OrderStatusInput = {
          status: 'paid',
          total_net: 10000,
          refunded_amount: 15000
        };

        expect(calculateOrderStatus(order)).toBe('refunded');
      });

      it('returns refunded for small amounts', () => {
        const order: OrderStatusInput = {
          status: 'paid',
          total_net: 100,
          refunded_amount: 100
        };

        expect(calculateOrderStatus(order)).toBe('refunded');
      });

      it('returns refunded for large amounts', () => {
        const order: OrderStatusInput = {
          status: 'paid',
          total_net: 1000000,
          refunded_amount: 1000000
        };

        expect(calculateOrderStatus(order)).toBe('refunded');
      });
    });

    describe('partially refunded orders', () => {
      it('returns partially_refunded when refund is less than total', () => {
        const order: OrderStatusInput = {
          status: 'paid',
          total_net: 10000,
          refunded_amount: 5000
        };

        expect(calculateOrderStatus(order)).toBe('partially_refunded');
      });

      it('returns partially_refunded for small partial refund', () => {
        const order: OrderStatusInput = {
          status: 'paid',
          total_net: 10000,
          refunded_amount: 1
        };

        expect(calculateOrderStatus(order)).toBe('partially_refunded');
      });

      it('returns partially_refunded when refund is just under total', () => {
        const order: OrderStatusInput = {
          status: 'paid',
          total_net: 10000,
          refunded_amount: 9999
        };

        expect(calculateOrderStatus(order)).toBe('partially_refunded');
      });

      it('returns partially_refunded for percentage-based refund', () => {
        const order: OrderStatusInput = {
          status: 'paid',
          total_net: 10000,
          refunded_amount: 2500 // 25% refund
        };

        expect(calculateOrderStatus(order)).toBe('partially_refunded');
      });
    });

    describe('edge cases', () => {
      it('handles decimal amounts correctly', () => {
        const order: OrderStatusInput = {
          status: 'paid',
          total_net: 9999,
          refunded_amount: 4999
        };

        expect(calculateOrderStatus(order)).toBe('partially_refunded');
      });

      it('handles status variations', () => {
        const statuses = ['paid', 'completed', 'shipped', 'delivered'];

        for (const status of statuses) {
          const order: OrderStatusInput = {
            status,
            total_net: 10000,
            refunded_amount: 5000
          };

          expect(calculateOrderStatus(order)).toBe('partially_refunded');
        }
      });
    });
  });

  describe('getStatusChangeReason', () => {
    it('returns payment_succeeded for paid status', () => {
      expect(getStatusChangeReason('paid')).toBe('payment_succeeded');
    });

    it('returns refund_partial for partially_refunded status', () => {
      expect(getStatusChangeReason('partially_refunded')).toBe('refund_partial');
    });

    it('returns refund_full for refunded status', () => {
      expect(getStatusChangeReason('refunded')).toBe('refund_full');
    });

    it('returns unknown for pending status', () => {
      expect(getStatusChangeReason('pending')).toBe('unknown');
    });

    it('returns unknown for any unrecognized status', () => {
      expect(getStatusChangeReason('invalid' as OrderStatus)).toBe('unknown');
    });

    describe('all valid statuses have reasons', () => {
      const validStatuses: OrderStatus[] = ['paid', 'partially_refunded', 'refunded'];

      it.each(validStatuses)('status "%s" has a non-unknown reason', (status) => {
        const reason = getStatusChangeReason(status);
        expect(reason).not.toBe('unknown');
        expect(reason.length).toBeGreaterThan(0);
      });
    });
  });

  describe('integration scenarios', () => {
    it('simulates order lifecycle: pending -> paid', () => {
      const pendingOrder: OrderStatusInput = {
        status: 'pending',
        total_net: 15000,
        refunded_amount: 0
      };

      expect(calculateOrderStatus(pendingOrder)).toBe('pending');

      const paidOrder: OrderStatusInput = {
        status: 'paid',
        total_net: 15000,
        refunded_amount: 0
      };

      const newStatus = calculateOrderStatus(paidOrder);
      expect(newStatus).toBe('paid');
      expect(getStatusChangeReason(newStatus)).toBe('payment_succeeded');
    });

    it('simulates order lifecycle: paid -> partially_refunded', () => {
      const paidOrder: OrderStatusInput = {
        status: 'paid',
        total_net: 20000,
        refunded_amount: 0
      };

      expect(calculateOrderStatus(paidOrder)).toBe('paid');

      const partialRefundOrder: OrderStatusInput = {
        status: 'paid',
        total_net: 20000,
        refunded_amount: 5000
      };

      const newStatus = calculateOrderStatus(partialRefundOrder);
      expect(newStatus).toBe('partially_refunded');
      expect(getStatusChangeReason(newStatus)).toBe('refund_partial');
    });

    it('simulates order lifecycle: partially_refunded -> refunded', () => {
      const partialRefundOrder: OrderStatusInput = {
        status: 'partially_refunded',
        total_net: 20000,
        refunded_amount: 10000
      };

      expect(calculateOrderStatus(partialRefundOrder)).toBe('partially_refunded');

      const fullRefundOrder: OrderStatusInput = {
        status: 'partially_refunded',
        total_net: 20000,
        refunded_amount: 20000
      };

      const newStatus = calculateOrderStatus(fullRefundOrder);
      expect(newStatus).toBe('refunded');
      expect(getStatusChangeReason(newStatus)).toBe('refund_full');
    });

    it('simulates direct full refund: paid -> refunded', () => {
      const paidOrder: OrderStatusInput = {
        status: 'paid',
        total_net: 30000,
        refunded_amount: 0
      };

      expect(calculateOrderStatus(paidOrder)).toBe('paid');

      const fullRefundOrder: OrderStatusInput = {
        status: 'paid',
        total_net: 30000,
        refunded_amount: 30000
      };

      const newStatus = calculateOrderStatus(fullRefundOrder);
      expect(newStatus).toBe('refunded');
      expect(getStatusChangeReason(newStatus)).toBe('refund_full');
    });
  });
});
