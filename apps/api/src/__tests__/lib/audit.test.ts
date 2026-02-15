import { describe, it, expect, vi } from 'vitest';
import { logAuditEvent } from '../../lib/audit';

describe('Audit Logger', () => {
  describe('logAuditEvent', () => {
    it('should log audit event successfully', async () => {
      const mockDb = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn(async () => ({ meta: { changes: 1 } })),
          })),
        })),
      } as unknown as D1Database;

      await logAuditEvent(mockDb, {
        actor: 'user@example.com',
        action: 'create_product',
        target: 'product',
        targetId: 123,
        metadata: { title: 'Test Product' },
      });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs')
      );
    });

    it('should handle metadata as string', async () => {
      const mockDb = {
        prepare: () => ({
          bind: (...params: any[]) => {
            expect(params[4]).toBe('{"custom":"data"}');
            return {
              run: async () => ({ meta: { changes: 1 } }),
            };
          },
        }),
      } as unknown as D1Database;

      await logAuditEvent(mockDb, {
        actor: 'user@example.com',
        action: 'test',
        target: 'test',
        metadata: '{"custom":"data"}',
      });
    });

    it('should handle metadata as object', async () => {
      const mockDb = {
        prepare: () => ({
          bind: (...params: any[]) => {
            expect(params[4]).toBe('{"foo":"bar"}');
            return {
              run: async () => ({ meta: { changes: 1 } }),
            };
          },
        }),
      } as unknown as D1Database;

      await logAuditEvent(mockDb, {
        actor: 'user@example.com',
        action: 'test',
        target: 'test',
        metadata: { foo: 'bar' },
      });
    });

    it('should handle undefined metadata', async () => {
      const mockDb = {
        prepare: () => ({
          bind: (...params: any[]) => {
            expect(params[4]).toBe('{}');
            return {
              run: async () => ({ meta: { changes: 1 } }),
            };
          },
        }),
      } as unknown as D1Database;

      await logAuditEvent(mockDb, {
        actor: 'user@example.com',
        action: 'test',
        target: 'test',
      });
    });

    it('should handle targetId as null', async () => {
      const mockDb = {
        prepare: () => ({
          bind: (...params: any[]) => {
            expect(params[3]).toBeNull();
            return {
              run: async () => ({ meta: { changes: 1 } }),
            };
          },
        }),
      } as unknown as D1Database;

      await logAuditEvent(mockDb, {
        actor: 'user@example.com',
        action: 'test',
        target: 'test',
        targetId: null,
      });
    });

    it('should not throw on database error', async () => {
      const mockDb = {
        prepare: () => ({
          bind: () => ({
            run: async () => {
              throw new Error('DB error');
            },
          }),
        }),
      } as unknown as D1Database;

      // Should not throw
      await expect(
        logAuditEvent(mockDb, {
          actor: 'user@example.com',
          action: 'test',
          target: 'test',
        })
      ).resolves.not.toThrow();
    });

    it('should log console error on failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockDb = {
        prepare: () => ({
          bind: () => ({
            run: async () => {
              throw new Error('DB error');
            },
          }),
        }),
      } as unknown as D1Database;

      await logAuditEvent(mockDb, {
        actor: 'user@example.com',
        action: 'test',
        target: 'test',
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to log audit event')
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
