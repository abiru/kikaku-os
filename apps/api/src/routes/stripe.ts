import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { jsonError, jsonOk } from '../lib/http';
import { verifyStripeSignature } from '../lib/stripe';
import { handleStripeEvent } from '../services/stripeEventHandlers';
import {
  recordStripeEvent,
  updateStripeEventStatus
} from '../lib/stripeData';

const stripe = new Hono<Env>();

const handleWebhook = async (c: Context<Env>) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  const signature = c.req.header('stripe-signature') ?? null;
  const payload = await c.req.text();

  // Skip signature verification in local dev if secret is not configured
  if (secret) {
    const valid = await verifyStripeSignature(payload, signature, secret, {
      toleranceSeconds: 300
    });
    if (!valid) return jsonError(c, 'Invalid signature', 400);
  } else {
    console.warn(
      '⚠️  STRIPE_WEBHOOK_SECRET not set - skipping signature verification (DEV ONLY)'
    );
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return jsonError(c, 'Invalid payload', 400);
  }
  if (!event?.id || typeof event.id !== 'string') {
    return jsonError(c, 'Invalid payload', 400);
  }

  try {
    // Phase 1: イベントを保存（冪等性チェック）
    const recorded = await recordStripeEvent(c.env, event, payload);
    if (recorded.duplicate) {
      return jsonOk(c, { received: true, duplicate: true });
    }

    // Phase 2: イベントを処理
    try {
      const result = await handleStripeEvent(c.env, event);
      await updateStripeEventStatus(c.env, event.id, 'completed');
      return jsonOk(c, result);
    } catch (processingError: any) {
      // 処理失敗時はエラーを記録
      const errorMessage = processingError?.message || String(processingError);
      await updateStripeEventStatus(c.env, event.id, 'failed', errorMessage);
      throw processingError;
    }
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to process webhook');
  }
};

stripe.post('/webhooks/stripe', handleWebhook);
stripe.post('/stripe/webhook', handleWebhook);

export default stripe;
