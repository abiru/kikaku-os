import { describe, it, expect, beforeEach } from 'vitest';
import { findById, findByIdOrThrow, countWhere, NotFoundError } from '../helpers/dbHelpers';

describe('DB Helpers', () => {
  let mockDb: D1Database;

  beforeEach(() => {
    mockDb = {
      prepare: (sql: string) => ({
        bind: (...params: any[]) => ({
          first: async () => {
            if (sql.includes('WHERE id = ?') && params[0] === 1) {
              return { id: 1, name: 'Test' };
            }
            if (sql.includes('COUNT(*)')) {
              return { count: 5 };
            }
            return null;
          },
        }),
      }),
    } as unknown as D1Database;
  });

  describe('findById', () => {
    it('should return record when found', async () => {
      const result = await findById(mockDb, 'products', 1);
      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should return null when not found', async () => {
      const result = await findById(mockDb, 'products', 999);
      expect(result).toBeNull();
    });

    it('should support custom columns', async () => {
      const result = await findById(mockDb, 'products', 1, 'id, name');
      expect(result).toBeDefined();
    });
  });

  describe('findByIdOrThrow', () => {
    it('should return record when found', async () => {
      const result = await findByIdOrThrow(mockDb, 'products', 1);
      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should throw NotFoundError when not found', async () => {
      await expect(
        findByIdOrThrow(mockDb, 'products', 999)
      ).rejects.toThrow(NotFoundError);
    });

    it('should include table name in error message', async () => {
      await expect(
        findByIdOrThrow(mockDb, 'products', 999)
      ).rejects.toThrow('products');
    });
  });

  describe('countWhere', () => {
    it('should return count', async () => {
      const count = await countWhere(mockDb, 'products', 'status = ?', ['active']);
      expect(count).toBe(5);
    });

    it('should return 0 when no results', async () => {
      const emptyDb = {
        prepare: () => ({
          bind: () => ({
            first: async () => ({ count: 0 }),
          }),
        }),
      } as unknown as D1Database;

      const count = await countWhere(emptyDb, 'products', 'status = ?', ['inactive']);
      expect(count).toBe(0);
    });
  });

  describe('NotFoundError', () => {
    it('should be instance of Error', () => {
      const error = new NotFoundError('Test not found');
      expect(error).toBeInstanceOf(Error);
    });

    it('should have correct name', () => {
      const error = new NotFoundError('Test not found');
      expect(error.name).toBe('NotFoundError');
    });

    it('should preserve message', () => {
      const error = new NotFoundError('Custom message');
      expect(error.message).toBe('Custom message');
    });
  });
});
