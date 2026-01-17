import { describe, it, expect } from 'vitest';
import { computeStripeSignature, parseStripeSignature, verifyStripeSignature } from './stripe';

describe('stripe signature helpers', () => {
  it('parses signature header', () => {
    const parsed = parseStripeSignature('t=123,v1=abc,v1=def');
    expect(parsed?.timestamp).toBe('123');
    expect(parsed?.signatures).toEqual(['abc', 'def']);
  });

  it('verifies signature', async () => {
    const payload = '{"id":"evt_123"}';
    const secret = 'whsec_test';
    const timestamp = '1700000000';
    const sig = await computeStripeSignature(payload, secret, timestamp);
    const header = `t=${timestamp},v1=${sig}`;
    const valid = await verifyStripeSignature(payload, header, secret);
    expect(valid).toBe(true);
  });

  it('accepts timestamp within tolerance', async () => {
    const payload = '{"id":"evt_456"}';
    const secret = 'whsec_test';
    const timestamp = '1700000000';
    const sig = await computeStripeSignature(payload, secret, timestamp);
    const header = `t=${timestamp},v1=${sig}`;
    const nowMs = 1700000000 * 1000 + 200 * 1000;
    const valid = await verifyStripeSignature(payload, header, secret, { toleranceSeconds: 300, nowMs });
    expect(valid).toBe(true);
  });

  it('rejects timestamp outside tolerance', async () => {
    const payload = '{"id":"evt_789"}';
    const secret = 'whsec_test';
    const timestamp = '1700000000';
    const sig = await computeStripeSignature(payload, secret, timestamp);
    const header = `t=${timestamp},v1=${sig}`;
    const pastMs = 1700000000 * 1000 - 301 * 1000;
    const futureMs = 1700000000 * 1000 + 301 * 1000;
    const pastValid = await verifyStripeSignature(payload, header, secret, { toleranceSeconds: 300, nowMs: pastMs });
    const futureValid = await verifyStripeSignature(payload, header, secret, { toleranceSeconds: 300, nowMs: futureMs });
    expect(pastValid).toBe(false);
    expect(futureValid).toBe(false);
  });
});
