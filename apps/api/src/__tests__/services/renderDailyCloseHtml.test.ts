import { describe, it, expect } from 'vitest';
import { renderDailyCloseHtml } from '../../services/renderDailyCloseHtml';
import type { DailyReport } from '../../services/dailyReport';
import type { StripeEvidence } from '../../services/stripeEvidence';

const createMockReport = (overrides: Partial<DailyReport> = {}): DailyReport => ({
  date: '2026-01-15',
  orders: { count: 10, totalNet: 50000, totalFee: 1500 },
  payments: { count: 8, totalAmount: 48000, totalFee: 1440 },
  refunds: { count: 1, totalAmount: 5000 },
  anomalies: { level: 'ok', diff: -2000, message: 'OK diff: -2000' },
  ...overrides,
});

const createMockEvidence = (overrides: Partial<StripeEvidence> = {}): StripeEvidence => ({
  payments: [
    { id: 101, amount: 10000, fee: 300, created_at: '2026-01-15T10:00:00Z', method: 'card', provider: 'stripe' },
    { id: 102, amount: 38000, fee: 1140, created_at: '2026-01-15T11:00:00Z', method: 'card', provider: 'stripe' },
  ],
  refunds: [
    { id: 201, amount: 5000, created_at: '2026-01-15T14:00:00Z', reason: 'customer_request' },
  ],
  ...overrides,
});

describe('renderDailyCloseHtml', () => {
  it('returns a valid HTML string', () => {
    const html = renderDailyCloseHtml(createMockReport(), createMockEvidence());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('</html>');
  });

  it('includes the report date in title', () => {
    const html = renderDailyCloseHtml(createMockReport(), createMockEvidence());
    expect(html).toContain('Daily Close 2026-01-15');
  });

  it('includes order summary data', () => {
    const html = renderDailyCloseHtml(createMockReport(), createMockEvidence());
    expect(html).toContain('Orders');
    expect(html).toContain('50,000');
    expect(html).toContain('count 10');
  });

  it('includes payment summary data', () => {
    const html = renderDailyCloseHtml(createMockReport(), createMockEvidence());
    expect(html).toContain('Payments');
    expect(html).toContain('48,000');
    expect(html).toContain('count 8');
  });

  it('includes refund summary data', () => {
    const html = renderDailyCloseHtml(createMockReport(), createMockEvidence());
    expect(html).toContain('Refunds');
    expect(html).toContain('5,000');
    expect(html).toContain('count 1');
  });

  it('includes payment evidence table rows', () => {
    const html = renderDailyCloseHtml(createMockReport(), createMockEvidence());
    expect(html).toContain('101');
    expect(html).toContain('10,000');
    expect(html).toContain('card');
    expect(html).toContain('stripe');
  });

  it('includes refund evidence table rows', () => {
    const html = renderDailyCloseHtml(createMockReport(), createMockEvidence());
    expect(html).toContain('201');
    expect(html).toContain('customer_request');
  });

  it('applies correct CSS class for ok anomaly level', () => {
    const html = renderDailyCloseHtml(
      createMockReport({ anomalies: { level: 'ok', diff: 0, message: 'All good' } }),
      createMockEvidence()
    );
    expect(html).toContain('class="pill ok"');
  });

  it('applies correct CSS class for warning anomaly level', () => {
    const html = renderDailyCloseHtml(
      createMockReport({ anomalies: { level: 'warning', diff: 5000, message: 'WARNING diff: 5000' } }),
      createMockEvidence()
    );
    expect(html).toContain('class="pill warn"');
  });

  it('applies correct CSS class for critical anomaly level', () => {
    const html = renderDailyCloseHtml(
      createMockReport({ anomalies: { level: 'critical', diff: 50000, message: 'CRITICAL diff: 50000' } }),
      createMockEvidence()
    );
    expect(html).toContain('class="pill crit"');
  });

  it('escapes HTML in report data', () => {
    const html = renderDailyCloseHtml(
      createMockReport({ anomalies: { level: 'ok', diff: 0, message: '<script>alert("XSS")</script>' } }),
      createMockEvidence()
    );
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('handles empty payments evidence', () => {
    const html = renderDailyCloseHtml(
      createMockReport(),
      createMockEvidence({ payments: [] })
    );
    expect(html).toContain('Payments');
    expect(html).toContain('</table>');
  });

  it('handles empty refunds evidence', () => {
    const html = renderDailyCloseHtml(
      createMockReport(),
      createMockEvidence({ refunds: [] })
    );
    expect(html).toContain('Refunds');
    expect(html).toContain('</table>');
  });

  it('handles zero amounts in report', () => {
    const html = renderDailyCloseHtml(
      createMockReport({
        orders: { count: 0, totalNet: 0, totalFee: 0 },
        payments: { count: 0, totalAmount: 0, totalFee: 0 },
        refunds: { count: 0, totalAmount: 0 },
      }),
      createMockEvidence({ payments: [], refunds: [] })
    );
    expect(html).toContain('count 0');
  });
});
