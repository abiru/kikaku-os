import { describe, expect, it } from 'vitest';
import {
  checkStockAvailability,
  releaseStockReservationForOrder,
  reserveStockForOrder
} from '../../services/inventoryCheck';

type Reservation = {
  orderId: number;
  reservationId: string;
  variantId: number;
  quantity: number;
  state: 'reservation' | 'sale' | 'released';
};

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

describe('inventoryCheck', () => {
  it('aggregates duplicated variant quantities when checking stock', async () => {
    const db = createMockDb({ 10: 5 });

    const result = await checkStockAvailability(db, [
      { variantId: 10, quantity: 3 },
      { variantId: 10, quantity: 3 }
    ]);

    expect(result.available).toBe(false);
    expect(result.insufficientItems).toEqual([
      { variantId: 10, requested: 6, available: 5 }
    ]);
  });

  it('prevents oversell by failing second reservation and can release reservation', async () => {
    const db = createMockDb({ 10: 5 });

    const first = await reserveStockForOrder(db, 1, [{ variantId: 10, quantity: 3 }]);
    const second = await reserveStockForOrder(db, 2, [{ variantId: 10, quantity: 3 }]);

    expect(first.reserved).toBe(true);
    expect(second.reserved).toBe(false);
    expect(second.insufficientItems[0]?.variantId).toBe(10);

    const releasedRows = await releaseStockReservationForOrder(db, 1);
    expect(releasedRows).toBeGreaterThan(0);

    const third = await reserveStockForOrder(db, 3, [{ variantId: 10, quantity: 3 }]);
    expect(third.reserved).toBe(true);
  });
});
