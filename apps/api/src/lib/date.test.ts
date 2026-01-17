import { describe, it, expect } from 'vitest';
import { ensureDate, jstYesterdayStringFromMs } from './date';

describe('ensureDate', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(ensureDate('2026-01-13')).toBe('2026-01-13');
  });

  it('rejects invalid format', () => {
    expect(ensureDate('2026/01/13')).toBeNull();
    expect(ensureDate('2026-1-13')).toBeNull();
    expect(ensureDate('')).toBeNull();
  });

  it('computes JST yesterday from early morning JST', () => {
    const nowMs = Date.parse('2026-01-15T15:30:00Z');
    expect(jstYesterdayStringFromMs(nowMs)).toBe('2026-01-15');
  });

  it('computes JST yesterday from daytime JST', () => {
    const nowMs = Date.parse('2026-01-16T01:00:00Z');
    expect(jstYesterdayStringFromMs(nowMs)).toBe('2026-01-15');
  });
});
