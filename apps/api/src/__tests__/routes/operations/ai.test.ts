import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import ai, { validateSql, extractTableNames, hasSubquery } from '../../../routes/operations/ai';

const createMockDb = (options: {
  queryResults?: any[];
  shouldLogFail?: boolean;
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM events') || sql.includes('FROM audit_logs')) {
            return { results: [] };
          }
          return { results: options.queryResults || [] };
        }),
        run: vi.fn(async () => {
          if (options.shouldLogFail && sql.includes('audit_logs')) {
            throw new Error('Audit log failed');
          }
          return { success: true };
        })
      })),
      all: vi.fn(async () => ({ results: options.queryResults || [] }))
    }))
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/', ai);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db } as any)
  };
};

describe('AI SQL Security', () => {
  describe('validateSql', () => {
    describe('SELECT validation', () => {
      it('allows valid SELECT queries', () => {
        const result = validateSql('SELECT * FROM products');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.sql).toContain('SELECT * FROM products');
        }
      });

      it('blocks INSERT statements', () => {
        const result = validateSql('INSERT INTO products VALUES (1, 2, 3)');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks UPDATE statements', () => {
        const result = validateSql('UPDATE products SET price = 0');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks DELETE statements', () => {
        const result = validateSql('DELETE FROM products');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });
    });

    describe('Dangerous keyword blocking', () => {
      it('blocks DROP statements', () => {
        const result = validateSql('DROP TABLE products');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks ALTER statements', () => {
        const result = validateSql('ALTER TABLE products ADD COLUMN price INT');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks CREATE statements', () => {
        const result = validateSql('CREATE TABLE evil (id INT)');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks TRUNCATE statements', () => {
        const result = validateSql('TRUNCATE TABLE orders');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks REPLACE statements', () => {
        const result = validateSql('REPLACE INTO products VALUES (1)');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks PRAGMA statements', () => {
        const result = validateSql('PRAGMA table_info(products)');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks ATTACH statements', () => {
        const result = validateSql('ATTACH DATABASE evil AS db');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks DETACH statements', () => {
        const result = validateSql('DETACH DATABASE main');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks VACUUM statements', () => {
        const result = validateSql('VACUUM');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks GRANT statements', () => {
        const result = validateSql('GRANT ALL ON products TO user');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks REVOKE statements', () => {
        const result = validateSql('REVOKE ALL ON products FROM user');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('blocks INTO keyword (for INSERT/SELECT INTO)', () => {
        const result = validateSql('SELECT * INTO backup FROM products');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('prohibited SQL keywords');
        }
      });
    });

    describe('SQL injection protection', () => {
      it('blocks semicolons', () => {
        const result = validateSql('SELECT * FROM products; DROP TABLE orders');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Semicolons are not allowed');
        }
      });

      it('blocks SQL comments (--)', () => {
        const result = validateSql('SELECT * FROM products -- comment');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('prohibited SQL keywords');
        }
      });

      it('blocks block comments (/* */)', () => {
        const result = validateSql('SELECT * FROM products /* comment */');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('prohibited SQL keywords');
        }
      });
    });

    describe('UNION blocking', () => {
      it('blocks UNION queries', () => {
        const result = validateSql('SELECT * FROM products UNION SELECT * FROM orders');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('UNION queries are not allowed');
        }
      });

      it('blocks UNION ALL queries', () => {
        const result = validateSql('SELECT id FROM products UNION ALL SELECT id FROM customers');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('UNION queries are not allowed');
        }
      });
    });

    describe('Subquery detection', () => {
      it('blocks subqueries in WHERE clause', () => {
        const result = validateSql('SELECT * FROM products WHERE id IN (SELECT product_id FROM orders)');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Subqueries are not allowed');
        }
      });

      it('blocks subqueries in FROM clause', () => {
        const result = validateSql('SELECT * FROM (SELECT * FROM products) AS p');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Subqueries are not allowed');
        }
      });

      it('allows simple SELECT', () => {
        const result = validateSql('SELECT * FROM products WHERE price > 1000');
        expect(result.ok).toBe(true);
      });
    });

    describe('Table whitelist', () => {
      it('allows whitelisted tables', () => {
        const allowedTables = [
          'products', 'variants', 'prices', 'orders', 'order_items',
          'customers', 'payments', 'refunds', 'inventory_movements',
          'events', 'coupons', 'coupon_usages', 'categories',
          'product_categories', 'product_images', 'product_reviews',
          'ledger_entries', 'ledger_accounts', 'fulfillments',
          'tax_rates', 'documents'
        ];

        for (const table of allowedTables) {
          const result = validateSql(`SELECT * FROM ${table}`);
          expect(result.ok).toBe(true);
        }
      });

      it('blocks unknown tables', () => {
        const result = validateSql('SELECT * FROM evil_table');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain("Access to table 'evil_table' is not allowed");
        }
      });

      it('blocks system tables', () => {
        const result = validateSql('SELECT * FROM sqlite_master');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain("Access to table 'sqlite_master' is not allowed");
        }
      });

      it('allows JOINs with whitelisted tables', () => {
        const result = validateSql('SELECT * FROM products JOIN variants ON products.id = variants.product_id');
        expect(result.ok).toBe(true);
      });

      it('blocks JOINs with non-whitelisted tables', () => {
        const result = validateSql('SELECT * FROM products JOIN evil_table ON products.id = evil_table.id');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain("Access to table 'evil_table' is not allowed");
        }
      });

      it('blocks comma joins with non-whitelisted tables', () => {
        const result = validateSql('SELECT * FROM products, sqlite_master');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain("Access to table 'sqlite_master' is not allowed");
        }
      });

      it('validates all tables in complex JOINs', () => {
        const result = validateSql(
          'SELECT * FROM orders ' +
          'JOIN order_items ON orders.id = order_items.order_id ' +
          'JOIN products ON order_items.product_id = products.id'
        );
        expect(result.ok).toBe(true);
      });
    });

    describe('LIMIT enforcement', () => {
      it('adds LIMIT 200 when missing', () => {
        const result = validateSql('SELECT * FROM products');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.sql).toContain('LIMIT 200');
        }
      });

      it('preserves LIMIT when <= 200', () => {
        const result = validateSql('SELECT * FROM products LIMIT 50');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.sql).toContain('LIMIT 50');
        }
      });

      it('caps LIMIT at 200 when > 200', () => {
        const result = validateSql('SELECT * FROM products LIMIT 1000');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.sql).toContain('LIMIT 200');
          expect(result.sql).not.toContain('LIMIT 1000');
        }
      });

      it('handles LIMIT case-insensitively', () => {
        const result = validateSql('SELECT * FROM products limit 150');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.sql).toMatch(/LIMIT 150/i);
        }
      });

      it('rejects negative LIMIT values', () => {
        const result = validateSql('SELECT * FROM products LIMIT -1');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('LIMIT clause must use non-negative integer values');
        }
      });

      it('caps LIMIT while preserving OFFSET', () => {
        const result = validateSql('SELECT * FROM products LIMIT 1000 OFFSET 10');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.sql).toContain('LIMIT 200 OFFSET 10');
        }
      });
    });

    describe('Edge cases', () => {
      it('requires at least one table reference', () => {
        const result = validateSql('SELECT 1');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('No valid table reference found');
        }
      });

      it('handles empty strings', () => {
        const result = validateSql('');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('Only SELECT statements are allowed');
        }
      });

      it('normalizes whitespace', () => {
        const result = validateSql('SELECT  *   FROM    products   WHERE  id  =  1');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.sql).toContain('SELECT * FROM products WHERE id = 1');
        }
      });

      it('is case-insensitive for keywords', () => {
        const result = validateSql('select * from products');
        expect(result.ok).toBe(true);
      });
    });
  });

  describe('extractTableNames', () => {
    it('extracts single table from FROM clause', () => {
      const tables = extractTableNames('SELECT * FROM products');
      expect(tables).toEqual(['products']);
    });

    it('extracts tables from JOIN clauses', () => {
      const tables = extractTableNames(
        'SELECT * FROM products JOIN variants ON products.id = variants.product_id'
      );
      expect(tables).toContain('products');
      expect(tables).toContain('variants');
    });

    it('handles multiple JOIN types', () => {
      const tables = extractTableNames(
        'SELECT * FROM orders ' +
        'INNER JOIN customers ON orders.customer_id = customers.id ' +
        'LEFT JOIN payments ON orders.id = payments.order_id ' +
        'RIGHT JOIN refunds ON payments.id = refunds.payment_id'
      );
      expect(tables).toContain('orders');
      expect(tables).toContain('customers');
      expect(tables).toContain('payments');
      expect(tables).toContain('refunds');
    });

    it('returns lowercase table names', () => {
      const tables = extractTableNames('SELECT * FROM Products JOIN Variants');
      expect(tables).toEqual(['products', 'variants']);
    });

    it('extracts tables from comma joins', () => {
      const tables = extractTableNames('SELECT * FROM products, variants');
      expect(tables).toContain('products');
      expect(tables).toContain('variants');
    });
  });

  describe('hasSubquery', () => {
    it('detects subqueries in WHERE clause', () => {
      expect(hasSubquery('SELECT * FROM products WHERE id IN (SELECT product_id FROM orders)')).toBe(true);
    });

    it('detects subqueries in FROM clause', () => {
      expect(hasSubquery('SELECT * FROM (SELECT * FROM products) AS p')).toBe(true);
    });

    it('returns false for simple queries', () => {
      expect(hasSubquery('SELECT * FROM products WHERE price > 1000')).toBe(false);
    });

    it('ignores SELECT in string literals', () => {
      expect(hasSubquery("SELECT * FROM products WHERE name = 'SELECT me'")).toBe(false);
    });
  });

  describe('API Endpoints', () => {
    describe('POST /sql', () => {
      it('generates dummy SQL', async () => {
        const db = createMockDb({});
        const { fetch } = createApp(db);

        const response = await fetch('/sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'show me paid orders' })
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.ok).toBe(true);
        expect(data.sql).toContain('SELECT');
        expect(data.notes).toContain('review');
      });
    });

    describe('POST /query', () => {
      it('executes valid SQL queries', async () => {
        const db = createMockDb({
          queryResults: [
            { id: 1, name: 'Product 1' },
            { id: 2, name: 'Product 2' }
          ]
        });
        const { fetch } = createApp(db);

        const response = await fetch('/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: 'SELECT * FROM products LIMIT 10' })
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.ok).toBe(true);
        expect(data.rows).toHaveLength(2);
      });

      it('rejects empty SQL', async () => {
        const db = createMockDb({});
        const { fetch } = createApp(db);

        const response = await fetch('/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: '' })
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.ok).toBe(false);
        expect(data.message).toContain('SQL query is required');
      });

      it('rejects dangerous SQL', async () => {
        const db = createMockDb({});
        const { fetch } = createApp(db);

        const response = await fetch('/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: 'DROP TABLE products' })
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.ok).toBe(false);
      });

      it('logs to events table', async () => {
        const db = createMockDb({ queryResults: [] });
        const { fetch } = createApp(db);

        await fetch('/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sql: 'SELECT * FROM products',
            prompt: 'show products'
          })
        });

        // Verify INSERT INTO events was called
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO events')
        );
      });

      it('logs to audit_logs', async () => {
        const db = createMockDb({ queryResults: [] });
        const { fetch } = createApp(db);

        await fetch('/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: 'SELECT * FROM products' })
        });

        // Verify INSERT INTO audit_logs was called
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO audit_logs')
        );
      });

      it('logs blocked queries to audit_logs', async () => {
        const db = createMockDb({});
        const { fetch } = createApp(db);

        await fetch('/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: 'DROP TABLE products' })
        });

        // Verify audit log was called for blocked query
        expect(db.prepare).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO audit_logs')
        );
      });

      it('handles audit log failures gracefully', async () => {
        const db = createMockDb({
          queryResults: [],
          shouldLogFail: true
        });
        const { fetch } = createApp(db);

        const response = await fetch('/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: 'SELECT * FROM products' })
        });

        // Should still succeed even if audit logging fails
        expect(response.status).toBe(200);
      });
    });
  });
});
