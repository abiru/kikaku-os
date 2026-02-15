import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../env';
import { AppError } from '../../lib/errors';

/**
 * Tests that error responses do not leak sensitive information.
 *
 * The app's global error handler:
 * - For AppError with 5xx status: Returns generic "Internal Server Error" message
 * - For AppError with 4xx status: Returns the error message
 * - For unknown errors: Returns generic "Internal Server Error"
 * - Never exposes stack traces, internal paths, or database details
 */
describe('Error information disclosure prevention', () => {
  const createApp = () => {
    const app = new Hono<Env>();

    // Replicate the global error handler from index.ts
    app.onError((err, c) => {
      if (err instanceof AppError) {
        const allowedStatuses = new Set([400, 401, 403, 404, 409, 500, 501, 502, 503]);
        const status = allowedStatuses.has(err.statusCode) ? err.statusCode : 500;
        const isServerError = status >= 500;

        const message = isServerError ? 'Internal Server Error' : err.message;
        const code = isServerError ? 'INTERNAL_ERROR' : err.code;

        return c.json(
          { ok: false, message, code },
          status as 400 | 401 | 403 | 404 | 409 | 500 | 501 | 502 | 503
        );
      }

      return c.json(
        { ok: false, message: 'Internal Server Error' },
        500
      );
    });

    // Routes that throw different types of errors
    app.get('/throw-internal', () => {
      throw new AppError('Database connection pool exhausted', { statusCode: 500 });
    });
    app.get('/throw-unknown', () => {
      throw new Error('Unexpected: SELECT * FROM users WHERE id = 1');
    });
    app.get('/throw-type-error', () => {
      throw new TypeError("Cannot read properties of undefined (reading 'id')");
    });
    app.get('/throw-bad-request', () => {
      throw AppError.badRequest('Invalid email format');
    });
    app.get('/throw-not-found', () => {
      throw AppError.notFound('Product not found');
    });
    app.get('/throw-unauthorized', () => {
      throw AppError.unauthorized('Invalid credentials');
    });

    return app;
  };

  describe('server errors (5xx)', () => {
    it('hides internal error details for 500 AppError', async () => {
      const app = createApp();
      const res = await app.request('/throw-internal');

      expect(res.status).toBe(500);
      const body = await res.json() as { ok: boolean; message: string; code: string };
      expect(body.ok).toBe(false);
      expect(body.message).toBe('Internal Server Error');
      expect(body.code).toBe('INTERNAL_ERROR');
      // Must NOT contain the actual error message
      expect(JSON.stringify(body)).not.toContain('Database connection pool');
    });

    it('hides SQL details in unknown errors', async () => {
      const app = createApp();
      const res = await app.request('/throw-unknown');

      expect(res.status).toBe(500);
      const body = await res.json() as { ok: boolean; message: string };
      expect(body.message).toBe('Internal Server Error');
      // Must NOT contain SQL or table names
      expect(JSON.stringify(body)).not.toContain('SELECT');
      expect(JSON.stringify(body)).not.toContain('users');
    });

    it('hides internal state in TypeError', async () => {
      const app = createApp();
      const res = await app.request('/throw-type-error');

      expect(res.status).toBe(500);
      const body = await res.json() as { ok: boolean; message: string };
      expect(body.message).toBe('Internal Server Error');
      // Must NOT contain implementation details
      expect(JSON.stringify(body)).not.toContain('undefined');
      expect(JSON.stringify(body)).not.toContain('reading');
    });

    it('does not include stack traces in response', async () => {
      const app = createApp();
      const res = await app.request('/throw-unknown');

      const body = await res.json() as Record<string, unknown>;
      expect(body).not.toHaveProperty('stack');
      expect(body).not.toHaveProperty('error');
      expect(JSON.stringify(body)).not.toContain('at ');
      expect(JSON.stringify(body)).not.toContain('.ts:');
    });
  });

  describe('client errors (4xx)', () => {
    it('returns descriptive message for bad request', async () => {
      const app = createApp();
      const res = await app.request('/throw-bad-request');

      expect(res.status).toBe(400);
      const body = await res.json() as { ok: boolean; message: string; code: string };
      expect(body.ok).toBe(false);
      expect(body.message).toBe('Invalid email format');
      expect(body.code).toBe('BAD_REQUEST');
    });

    it('returns descriptive message for not found', async () => {
      const app = createApp();
      const res = await app.request('/throw-not-found');

      expect(res.status).toBe(404);
      const body = await res.json() as { ok: boolean; message: string; code: string };
      expect(body.ok).toBe(false);
      expect(body.message).toBe('Product not found');
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns descriptive message for unauthorized', async () => {
      const app = createApp();
      const res = await app.request('/throw-unauthorized');

      expect(res.status).toBe(401);
      const body = await res.json() as { ok: boolean; message: string; code: string };
      expect(body.ok).toBe(false);
      expect(body.message).toBe('Invalid credentials');
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('response format consistency', () => {
    it('always returns JSON for server errors', async () => {
      const app = createApp();
      const res = await app.request('/throw-unknown');
      const contentType = res.headers.get('Content-Type');
      expect(contentType).toContain('application/json');
    });

    it('always includes ok: false for errors', async () => {
      const app = createApp();

      const endpoints = [
        '/throw-internal',
        '/throw-unknown',
        '/throw-bad-request',
        '/throw-not-found',
        '/throw-unauthorized',
      ];

      for (const endpoint of endpoints) {
        const res = await app.request(endpoint);
        const body = await res.json() as { ok: boolean };
        expect(body.ok).toBe(false);
      }
    });

    it('maps unrecognized status codes to 500', async () => {
      const app = new Hono<Env>();
      app.onError((err, c) => {
        if (err instanceof AppError) {
          const allowedStatuses = new Set([400, 401, 403, 404, 409, 500, 501, 502, 503]);
          const status = allowedStatuses.has(err.statusCode) ? err.statusCode : 500;
          const isServerError = status >= 500;
          const message = isServerError ? 'Internal Server Error' : err.message;
          return c.json({ ok: false, message }, status as 500);
        }
        return c.json({ ok: false, message: 'Internal Server Error' }, 500);
      });

      app.get('/throw-418', () => {
        throw new AppError('I am a teapot', { statusCode: 418 });
      });

      const res = await app.request('/throw-418');
      expect(res.status).toBe(500);
      const body = await res.json() as { message: string };
      expect(body.message).toBe('Internal Server Error');
    });
  });
});
