import { describe, it, expect } from 'vitest';
import { AppError, generateErrorTrackingId } from '../../lib/errors';

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

describe('generateErrorTrackingId', () => {
  it('returns a string matching the ERR-{timestamp}-{random} format', () => {
    const id = generateErrorTrackingId();
    expect(id).toMatch(/^ERR-\d+-[a-z0-9]{4}$/);
  });

  it('generates unique IDs on successive calls', () => {
    const id1 = generateErrorTrackingId();
    const id2 = generateErrorTrackingId();
    expect(id1).not.toBe(id2);
  });

  it('starts with ERR- prefix', () => {
    const id = generateErrorTrackingId();
    expect(id.startsWith('ERR-')).toBe(true);
  });
});
