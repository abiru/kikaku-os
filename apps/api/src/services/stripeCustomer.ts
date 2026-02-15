import type { D1Database } from '@cloudflare/workers-types';
import { AppError } from '../lib/errors';

export type CustomerInfo = {
  id: number;
  email: string | null;
  stripe_customer_id: string | null;
};

type StripeCustomerResponse = {
  id: string;
  object: string;
};

/**
 * Ensures a Stripe Customer exists and is associated with local customer.
 * Idempotent: Multiple calls return same Stripe Customer ID.
 *
 * @param db - D1 database instance
 * @param stripeKey - Stripe secret key
 * @param customerId - Local customer ID
 * @param email - Customer email (may be null)
 * @returns Stripe Customer ID (cus_xxxxx)
 */
export const ensureStripeCustomer = async (
  db: D1Database,
  stripeKey: string,
  customerId: number,
  email: string | null
): Promise<string> => {
  // 1. Check if local customer already has stripe_customer_id
  const customer = await db
    .prepare(`SELECT id, email, stripe_customer_id FROM customers WHERE id = ?`)
    .bind(customerId)
    .first<CustomerInfo>();

  if (!customer) {
    throw AppError.notFound(`Customer ${customerId} not found`);
  }

  // 2. Return existing Stripe Customer ID if already set (idempotent)
  if (customer.stripe_customer_id) {
    // Verify that the customer still exists in Stripe
    try {
      const verifyRes = await fetch(`https://api.stripe.com/v1/customers/${customer.stripe_customer_id}`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${stripeKey}`
        }
      });

      if (verifyRes.ok) {
        // Customer exists, return it
        return customer.stripe_customer_id;
      }

      // Customer doesn't exist (404 or other error), create a new one
      console.warn(`[StripeCustomer] Customer ${customer.stripe_customer_id} not found in Stripe, creating new one`);
    } catch (err) {
      console.error(`[StripeCustomer] Error verifying customer:`, err);
      // Continue to create new customer
    }
  }

  // 3. Create new Stripe Customer
  const params = new URLSearchParams();
  if (email) {
    params.set('email', email);
  }
  params.set('metadata[local_customer_id]', String(customerId));

  // Set customer address for bank transfer availability (Japan)
  params.set('address[country]', 'JP');

  const response = await fetch('https://api.stripe.com/v1/customers', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${stripeKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    const statusCode = response.status >= 500 ? 502 : 400;
    throw new AppError(`Failed to create Stripe Customer: ${text}`, {
      statusCode,
      code: 'STRIPE_CUSTOMER_ERROR'
    });
  }

  const stripeCustomer = (await response.json()) as StripeCustomerResponse;

  // 4. Update local database with stripe_customer_id
  await db
    .prepare(
      `UPDATE customers SET stripe_customer_id = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(stripeCustomer.id, customerId)
    .run();

  return stripeCustomer.id;
};
