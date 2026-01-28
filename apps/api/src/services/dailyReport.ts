import { Env } from '../env';

export type DailyReport = {
  date: string;
  orders: { count: number; totalNet: number; totalFee: number };
  payments: { count: number; totalAmount: number; totalFee: number };
  refunds: { count: number; totalAmount: number };
  anomalies: { level: 'ok' | 'warning' | 'critical'; diff: number; message: string };
};

export const generateDailyReport = async (env: Env['Bindings'], date: string): Promise<DailyReport> => {
  const ordersRow = await env.DB.prepare(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_net),0) as totalNet, COALESCE(SUM(total_fee),0) as totalFee
     FROM orders WHERE status IN ('paid','fulfilled','partially_refunded') AND substr(updated_at,1,10)=?`
  ).bind(date).first<{ count: number; totalNet: number; totalFee: number }>();

  const paymentsRow = await env.DB.prepare(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as totalAmount, COALESCE(SUM(fee),0) as totalFee
     FROM payments WHERE status='succeeded' AND substr(created_at,1,10)=?`
  ).bind(date).first<{ count: number; totalAmount: number; totalFee: number }>();

  const refundsRow = await env.DB.prepare(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as totalAmount
     FROM refunds WHERE status='succeeded' AND substr(created_at,1,10)=?`
  ).bind(date).first<{ count: number; totalAmount: number }>();

  const ordersTotal = ordersRow?.totalNet || 0;
  const paymentsTotal = paymentsRow?.totalAmount || 0;
  const diff = paymentsTotal - ordersTotal;
  const level = Math.abs(diff) > 10000 ? 'critical' : Math.abs(diff) > 1000 ? 'warning' : 'ok';

  return {
    date,
    orders: {
      count: ordersRow?.count || 0,
      totalNet: ordersTotal,
      totalFee: ordersRow?.totalFee || 0
    },
    payments: {
      count: paymentsRow?.count || 0,
      totalAmount: paymentsTotal,
      totalFee: paymentsRow?.totalFee || 0
    },
    refunds: {
      count: refundsRow?.count || 0,
      totalAmount: refundsRow?.totalAmount || 0
    },
    anomalies: {
      level,
      diff,
      message: `${level.toUpperCase()} diff: ${diff}`
    }
  };
};
