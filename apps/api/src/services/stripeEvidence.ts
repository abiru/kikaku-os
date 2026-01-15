import { Env } from '../env';

export type StripeEvidence = {
  payments: Array<{ id: number; amount: number; fee: number; created_at: string; method: string | null; provider: string | null }>;
  refunds: Array<{ id: number; amount: number; created_at: string; reason: string | null }>;
};

export const generateStripeEvidence = async (env: Env['Bindings'], date: string): Promise<StripeEvidence> => {
  const payments = await env.DB.prepare(
    `SELECT id, amount, fee, created_at, method, provider FROM payments WHERE status='succeeded' AND substr(created_at,1,10)=? ORDER BY created_at`
  ).bind(date).all<StripeEvidence['payments'][number]>();

  const refunds = await env.DB.prepare(
    `SELECT id, amount, created_at, reason FROM refunds WHERE status='succeeded' AND substr(created_at,1,10)=? ORDER BY created_at`
  ).bind(date).all<StripeEvidence['refunds'][number]>();

  return { payments: payments.results || [], refunds: refunds.results || [] };
};
