import { describe, expect, it } from 'vitest';
import { isPublicToken } from './publicToken';

describe('isPublicToken', () => {
  const validToken = 'PublicTokenExample1234';

  it('accepts public tokens with letters and numbers', () => {
    expect(isPublicToken(validToken)).toBe(true);
  });

  it('rejects numeric IDs and short values', () => {
    expect(isPublicToken('12345')).toBe(false);
    expect(isPublicToken('12345678901234567890')).toBe(false);
    expect(isPublicToken('shortToken123')).toBe(false);
  });

  it('rejects non-alphanumeric tokens', () => {
    expect(isPublicToken('PublicToken_Example1234')).toBe(false);
    expect(isPublicToken('PublicToken-Example1234')).toBe(false);
  });
});
