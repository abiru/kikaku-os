import { describe, it, expect } from 'vitest';
import { ensureDate } from './date';

describe('ensureDate', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(ensureDate('2026-01-13')).toBe('2026-01-13');
  });

  it('rejects invalid format', () => {
    expect(ensureDate('2026/01/13')).toBeNull();
    expect(ensureDate('2026-1-13')).toBeNull();
    expect(ensureDate('')).toBeNull();
  });
});
