import { describe, it, expect } from 'vitest';
import { AppError } from '../../lib/errors';

describe('AppError', () => {
  it('creates error with default values', () => {
    const err = new AppError('test');
    expect(err.message).toBe('test');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.name).toBe('AppError');
    expect(err instanceof Error).toBe(true);
  });

  it('creates error with custom status and code', () => {
    const err = new AppError('bad', { statusCode: 400, code: 'INVALID' });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('INVALID');
  });

  it('creates badRequest error', () => {
    const err = AppError.badRequest('invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('creates notFound error', () => {
    const err = AppError.notFound('not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('creates unauthorized error', () => {
    const err = AppError.unauthorized('no auth');
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('creates conflict error', () => {
    const err = AppError.conflict('conflict');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});
