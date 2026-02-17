import { describe, expect, it } from 'vitest';
import {
  checkStockAvailability,
  reserveStockForOrder,
  releaseStockReservationForOrder,
  getAvailableStock
} from '../../services/inventoryCheck';

type Reservation = {
  orderId: number;
  reservationId: string;
  variantId: number;
  quantity: number;
  state: 'reservation' | 'sale' | 'released';
};

/**
 * Creates a mock D1Database that simulates inventory_movements behavior.
 * The mock tracks stock levels via a Map and records reservation operations.
 */
const createMockDb = (initialStock: Record<number, number>): D1Database => {
  const stock = new Map<number, number>(
    Object.entries(initialStock).map(([variantId, qty]) => [Number(variantId), qty])
  );
  const reservations: Reservation[] = [];

  return {
    prepare: (sql: string) => {
      let boundArgs: any[] = [];
      const statement = {
        bind: (...args: any[]) => {
          boundArgs = args;
          return statement as any;
        },
        first: async <T>() => {
          if (sql.includes('SUM(delta)') && sql.includes('WHERE variant_id = ?')) {
            const variantId = Number(boundArgs[0]);
            return { onHand: stock.get(variantId) ?? 0 } as T;
          }
          return null as T;
        },
        all: async <T>() => {
          if (sql.includes('FROM inventory_movements')) {
            const variantIds = boundArgs.map((id) => Number(id));
            const results = variantIds.map((variantId) => ({
              variantId,
              onHand: stock.get(variantId) ?? 0
            }));
            return { results } as unknown as D1Result<T>;
          }
          return { results: [] } as unknown as D1Result<T>;
        },
        run: async () => {
          // Conditional reservation insert: only succeeds if stock >= requested
          if (
            sql.includes('INSERT INTO inventory_movements') &&
            sql.includes("SELECT ?, ?, 'reservation'")
          ) {
            const variantId = Number(boundArgs[0]);
            const requested = Math.abs(Number(boundArgs[1]));
            const metadata = JSON.parse(String(boundArgs[2])) as {
              order_id: number;
              reservation_id: string;
            };

            const onHand = stock.get(variantId) ?? 0;
            if (onHand < requested) {
              return { success: true, meta: { changes: 0 } } as D1Result;
            }

            stock.set(variantId, onHand - requested);
            reservations.push({
              orderId: metadata.order_id,
              reservationId: metadata.reservation_id,
              variantId,
              quantity: requested,
              state: 'reservation'
            });
            return { success: true, meta: { changes: 1 } } as D1Result;
          }

          // Release reservation by order_id
          if (
            sql.includes("SET delta = 0") &&
            sql.includes("json_extract(metadata, '$.order_id')")
          ) {
            const orderId = Number(boundArgs[0]);
            let changes = 0;
            for (const reservation of reservations) {
              if (reservation.orderId === orderId && reservation.state === 'reservation') {
                stock.set(
                  reservation.variantId,
                  (stock.get(reservation.variantId) ?? 0) + reservation.quantity
                );
                reservation.state = 'released';
                changes += 1;
              }
            }
            return { success: true, meta: { changes } } as D1Result;
          }

          // Release reservation by reservation_id
          if (
            sql.includes("SET delta = 0") &&
            sql.includes("json_extract(metadata, '$.reservation_id')")
          ) {
            const reservationId = String(boundArgs[0]);
            let changes = 0;
            for (const reservation of reservations) {
              if (
                reservation.reservationId === reservationId &&
                reservation.state === 'reservation'
              ) {
                stock.set(
                  reservation.variantId,
                  (stock.get(reservation.variantId) ?? 0) + reservation.quantity
                );
                reservation.state = 'released';
                changes += 1;
              }
            }
            return { success: true, meta: { changes } } as D1Result;
          }

          return { success: true, meta: { changes: 1 } } as D1Result;
        }
      };

      return statement as any;
    }
  } as D1Database;
};

describe('Inventory Concurrency', () => {
  describe('parallel requests for 1-stock item', () => {
    it('only one of multiple parallel reservations succeeds for a single unit', async () => {
      const db = createMockDb({ 100: 1 });

      // Simulate 5 concurrent checkout requests for the same 1-stock item
      const results = await Promise.all([
        reserveStockForOrder(db, 1, [{ variantId: 100, quantity: 1 }]),
        reserveStockForOrder(db, 2, [{ variantId: 100, quantity: 1 }]),
        reserveStockForOrder(db, 3, [{ variantId: 100, quantity: 1 }]),
        reserveStockForOrder(db, 4, [{ variantId: 100, quantity: 1 }]),
        reserveStockForOrder(db, 5, [{ variantId: 100, quantity: 1 }]),
      ]);

      const successCount = results.filter((r) => r.reserved).length;
      const failCount = results.filter((r) => !r.reserved).length;

      // Exactly one should succeed
      expect(successCount).toBe(1);
      // The rest should fail
      expect(failCount).toBe(4);
    });

    it('failed parallel reservations report correct available stock', async () => {
      const db = createMockDb({ 200: 1 });

      const results = await Promise.all([
        reserveStockForOrder(db, 10, [{ variantId: 200, quantity: 1 }]),
        reserveStockForOrder(db, 11, [{ variantId: 200, quantity: 1 }]),
        reserveStockForOrder(db, 12, [{ variantId: 200, quantity: 1 }]),
      ]);

      const failures = results.filter((r) => !r.reserved);
      for (const failure of failures) {
        expect(failure.insufficientItems.length).toBeGreaterThan(0);
        expect(failure.insufficientItems[0]?.variantId).toBe(200);
        expect(failure.insufficientItems[0]?.requested).toBe(1);
        // Available should be 0 because the first reservation consumed it
        expect(failure.insufficientItems[0]?.available).toBe(0);
      }
    });
  });

  describe('atomic stock reservation', () => {
    it('reservation is atomic: stock is fully reserved or not at all for multi-item orders', async () => {
      // 3 units of variant 300, 2 units of variant 301
      const db = createMockDb({ 300: 3, 301: 2 });

      // Order needs 2 of each
      const result = await reserveStockForOrder(db, 20, [
        { variantId: 300, quantity: 2 },
        { variantId: 301, quantity: 2 }
      ]);

      expect(result.reserved).toBe(true);

      // Now remaining stock should be 1 for 300 and 0 for 301
      const stock300 = await getAvailableStock(db, 300);
      const stock301 = await getAvailableStock(db, 301);
      expect(stock300).toBe(1);
      expect(stock301).toBe(0);
    });

    it('rolls back all reservations when one variant is insufficient', async () => {
      // 5 units of variant 400, but 0 units of variant 401
      const db = createMockDb({ 400: 5, 401: 0 });

      // Order needs both variants
      const result = await reserveStockForOrder(db, 30, [
        { variantId: 400, quantity: 2 },
        { variantId: 401, quantity: 1 }
      ]);

      expect(result.reserved).toBe(false);
      expect(result.insufficientItems[0]?.variantId).toBe(401);

      // Variant 400 should have its stock restored (rollback)
      const stock400 = await getAvailableStock(db, 400);
      expect(stock400).toBe(5);
    });

    it('sequential reservations correctly deduct stock', async () => {
      const db = createMockDb({ 500: 10 });

      const first = await reserveStockForOrder(db, 40, [{ variantId: 500, quantity: 3 }]);
      const second = await reserveStockForOrder(db, 41, [{ variantId: 500, quantity: 4 }]);
      const third = await reserveStockForOrder(db, 42, [{ variantId: 500, quantity: 3 }]);

      expect(first.reserved).toBe(true);
      expect(second.reserved).toBe(true);
      expect(third.reserved).toBe(true);

      const remaining = await getAvailableStock(db, 500);
      expect(remaining).toBe(0);
    });

    it('reservation fails when exact stock boundary is exceeded by 1', async () => {
      const db = createMockDb({ 600: 5 });

      const result = await reserveStockForOrder(db, 50, [{ variantId: 600, quantity: 6 }]);

      expect(result.reserved).toBe(false);
      expect(result.insufficientItems[0]?.available).toBe(5);
      expect(result.insufficientItems[0]?.requested).toBe(6);
    });

    it('reservation succeeds when requesting exactly available stock', async () => {
      const db = createMockDb({ 700: 5 });

      const result = await reserveStockForOrder(db, 60, [{ variantId: 700, quantity: 5 }]);

      expect(result.reserved).toBe(true);
      const remaining = await getAvailableStock(db, 700);
      expect(remaining).toBe(0);
    });
  });

  describe('stock never goes negative', () => {
    it('stock remains non-negative after multiple reservation attempts', async () => {
      const db = createMockDb({ 800: 3 });

      // Attempt multiple concurrent reservations that collectively exceed stock
      await Promise.all([
        reserveStockForOrder(db, 70, [{ variantId: 800, quantity: 2 }]),
        reserveStockForOrder(db, 71, [{ variantId: 800, quantity: 2 }]),
        reserveStockForOrder(db, 72, [{ variantId: 800, quantity: 2 }]),
        reserveStockForOrder(db, 73, [{ variantId: 800, quantity: 2 }]),
      ]);

      const remaining = await getAvailableStock(db, 800);
      expect(remaining).toBeGreaterThanOrEqual(0);
    });

    it('stock is exactly 0 after full reservation, never negative', async () => {
      const db = createMockDb({ 900: 1 });

      await reserveStockForOrder(db, 80, [{ variantId: 900, quantity: 1 }]);
      // Try to over-reserve
      await reserveStockForOrder(db, 81, [{ variantId: 900, quantity: 1 }]);

      const remaining = await getAvailableStock(db, 900);
      expect(remaining).toBe(0);
    });

    it('released reservations restore stock without going above initial level', async () => {
      const db = createMockDb({ 1000: 5 });

      // Reserve 3 then release
      const first = await reserveStockForOrder(db, 90, [{ variantId: 1000, quantity: 3 }]);
      expect(first.reserved).toBe(true);

      const released = await releaseStockReservationForOrder(db, 90);
      expect(released).toBeGreaterThan(0);

      const stockAfterRelease = await getAvailableStock(db, 1000);
      expect(stockAfterRelease).toBe(5);

      // Reserve 5 (all), release, verify
      const second = await reserveStockForOrder(db, 91, [{ variantId: 1000, quantity: 5 }]);
      expect(second.reserved).toBe(true);

      const stockDuringReservation = await getAvailableStock(db, 1000);
      expect(stockDuringReservation).toBe(0);

      await releaseStockReservationForOrder(db, 91);
      const stockAfterSecondRelease = await getAvailableStock(db, 1000);
      expect(stockAfterSecondRelease).toBe(5);
    });

    it('concurrent requests across multiple variants maintain non-negative stock', async () => {
      const db = createMockDb({ 1100: 2, 1101: 3, 1102: 1 });

      // Multiple concurrent orders trying to reserve across variants
      const results = await Promise.all([
        reserveStockForOrder(db, 100, [
          { variantId: 1100, quantity: 1 },
          { variantId: 1101, quantity: 2 }
        ]),
        reserveStockForOrder(db, 101, [
          { variantId: 1100, quantity: 1 },
          { variantId: 1102, quantity: 1 }
        ]),
        reserveStockForOrder(db, 102, [
          { variantId: 1100, quantity: 1 },
          { variantId: 1101, quantity: 2 }
        ]),
      ]);

      // Verify stock levels are non-negative for all variants
      const stock1100 = await getAvailableStock(db, 1100);
      const stock1101 = await getAvailableStock(db, 1101);
      const stock1102 = await getAvailableStock(db, 1102);

      expect(stock1100).toBeGreaterThanOrEqual(0);
      expect(stock1101).toBeGreaterThanOrEqual(0);
      expect(stock1102).toBeGreaterThanOrEqual(0);

      // Count successes and verify consistency
      const successCount = results.filter((r) => r.reserved).length;
      expect(successCount).toBeGreaterThanOrEqual(1);
      expect(successCount).toBeLessThanOrEqual(3);
    });

    it('checkStockAvailability returns false when stock is zero', async () => {
      const db = createMockDb({ 1200: 0 });

      const result = await checkStockAvailability(db, [
        { variantId: 1200, quantity: 1 }
      ]);

      expect(result.available).toBe(false);
      expect(result.insufficientItems).toEqual([
        { variantId: 1200, requested: 1, available: 0 }
      ]);
    });

    it('reservation for zero-stock item always fails', async () => {
      const db = createMockDb({ 1300: 0 });

      const results = await Promise.all([
        reserveStockForOrder(db, 110, [{ variantId: 1300, quantity: 1 }]),
        reserveStockForOrder(db, 111, [{ variantId: 1300, quantity: 1 }]),
      ]);

      const successCount = results.filter((r) => r.reserved).length;
      expect(successCount).toBe(0);

      const remaining = await getAvailableStock(db, 1300);
      expect(remaining).toBe(0);
    });
  });
});
