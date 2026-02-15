import { describe, it, expect } from 'vitest';
import { signEmailToken, verifyEmailToken } from '../../lib/token';

describe('signEmailToken', () => {
  it('generates a valid signed token', async () => {
    const email = 'test@example.com';
    const secret = 'test-secret';

    const token = await signEmailToken(email, secret);

    expect(token).toBeTruthy();
    expect(token).toContain(':');
    expect(token.split(':').length).toBe(2);
  });

  it('generates different signatures for different emails', async () => {
    const secret = 'test-secret';
    const token1 = await signEmailToken('user1@example.com', secret);
    const token2 = await signEmailToken('user2@example.com', secret);

    expect(token1).not.toBe(token2);
  });

  it('generates different signatures for different secrets', async () => {
    const email = 'test@example.com';
    const token1 = await signEmailToken(email, 'secret1');
    const token2 = await signEmailToken(email, 'secret2');

    expect(token1).not.toBe(token2);
  });
});

describe('verifyEmailToken', () => {
  it('verifies valid token and returns email', async () => {
    const email = 'test@example.com';
    const secret = 'test-secret';

    const token = await signEmailToken(email, secret);
    const verified = await verifyEmailToken(token, secret);

    expect(verified).toBe(email);
  });

  it('rejects token with wrong secret', async () => {
    const email = 'test@example.com';
    const token = await signEmailToken(email, 'correct-secret');
    const verified = await verifyEmailToken(token, 'wrong-secret');

    expect(verified).toBeNull();
  });

  it('rejects tampered token', async () => {
    const email = 'test@example.com';
    const secret = 'test-secret';

    const token = await signEmailToken(email, secret);
    const tamperedToken = token.replace(/.$/, 'X'); // Change last character

    const verified = await verifyEmailToken(tamperedToken, secret);

    expect(verified).toBeNull();
  });

  it('rejects malformed token without colon', async () => {
    const verified = await verifyEmailToken('malformed-token', 'test-secret');

    expect(verified).toBeNull();
  });

  it('rejects empty token', async () => {
    const verified = await verifyEmailToken('', 'test-secret');

    expect(verified).toBeNull();
  });

  it('rejects token with invalid base64', async () => {
    const verified = await verifyEmailToken('!!!:???', 'test-secret');

    expect(verified).toBeNull();
  });

  it('handles emails with special characters', async () => {
    const email = 'user+tag@example.com';
    const secret = 'test-secret';

    const token = await signEmailToken(email, secret);
    const verified = await verifyEmailToken(token, secret);

    expect(verified).toBe(email);
  });
});
