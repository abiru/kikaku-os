import { describe, expect, it } from 'vitest';
import { isPublicToken } from './publicToken';

describe('isPublicToken', () => {
  it('accepts public tokens with letters and numbers', () => {
    expect(isPublicToken('AbC123def456GhI789jKl012')).toBe(true);
  });

  it('rejects numeric IDs and short values', () => {
    expect(isPublicToken('12345')).toBe(false);
    expect(isPublicToken('12345678901234567890')).toBe(false);
    expect(isPublicToken('shortToken123')).toBe(false);
  });

  it('rejects non-alphanumeric tokens', () => {
    expect(isPublicToken('AbC123def456GhI_789jKl012')).toBe(false);
    expect(isPublicToken('AbC123def456GhI-789jKl012')).toBe(false);
  });
});
