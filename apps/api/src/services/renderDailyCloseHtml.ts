import { DailyReport } from './dailyReport';
import { StripeEvidence } from './stripeEvidence';

export const renderDailyCloseHtml = (report: DailyReport, evidence: StripeEvidence) => {
  const style = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; background:#f8fafc; color:#0f172a; margin:0; padding:32px; }
    .card { background:#fff; border:1px solid #e4e4e7; border-radius:20px; padding:24px; box-shadow:0 10px 30px rgba(0,0,0,0.04); margin-bottom:16px; }
    .title { font-size:20px; font-weight:700; margin:0 0 6px; }
    .muted { color:#6b7280; font-size:13px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
    .pill { display:inline-flex; padding:6px 12px; border-radius:9999px; font-size:12px; font-weight:600; }
    .ok { background:#dcfce7; color:#166534; }
    .warn { background:#fef9c3; color:#854d0e; }
    .crit { background:#fee2e2; color:#b91c1c; }
    table { width:100%; border-collapse:collapse; }
    th, td { text-align:left; padding:8px 6px; border-bottom:1px solid #e5e7eb; font-size:13px; }
  `;

  const anomalyClass = report.anomalies.level === 'critical' ? 'crit' : report.anomalies.level === 'warning' ? 'warn' : 'ok';

  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Daily Close ${report.date}</title><style>${style}</style></head>
<body>
  <div class="card">
    <div class="title">Daily Close ${report.date}</div>
    <div class="muted">Snapshotted KPI & evidence</div>
    <div class="pill ${anomalyClass}" style="margin-top:10px;">${report.anomalies.message}</div>
  </div>
  <div class="grid">
    <div class="card"><div class="muted">Orders</div><div class="title">¥${report.orders.totalNet.toLocaleString('ja-JP')}</div><div class="muted">count ${report.orders.count} / fee ¥${report.orders.totalFee.toLocaleString('ja-JP')}</div></div>
    <div class="card"><div class="muted">Payments</div><div class="title">¥${report.payments.totalAmount.toLocaleString('ja-JP')}</div><div class="muted">count ${report.payments.count} / fee ¥${report.payments.totalFee.toLocaleString('ja-JP')}</div></div>
    <div class="card"><div class="muted">Refunds</div><div class="title">¥${report.refunds.totalAmount.toLocaleString('ja-JP')}</div><div class="muted">count ${report.refunds.count}</div></div>
  </div>
  <div class="card">
    <div class="title">Payments</div>
    <table><thead><tr><th>ID</th><th>Amount</th><th>Fee</th><th>Method</th><th>Provider</th><th>Created</th></tr></thead><tbody>
      ${evidence.payments
        .map(
          (p) =>
            `<tr><td>${p.id}</td><td>¥${p.amount.toLocaleString('ja-JP')}</td><td>¥${p.fee.toLocaleString('ja-JP')}</td><td>${p.method || ''}</td><td>${p.provider || ''}</td><td>${p.created_at}</td></tr>`
        )
        .join('')}
    </tbody></table>
  </div>
  <div class="card">
    <div class="title">Refunds</div>
    <table><thead><tr><th>ID</th><th>Amount</th><th>Reason</th><th>Created</th></tr></thead><tbody>
      ${evidence.refunds.map(r => `<tr><td>${r.id}</td><td>¥${r.amount.toLocaleString('ja-JP')}</td><td>${r.reason||''}</td><td>${r.created_at}</td></tr>`).join('')}
    </tbody></table>
  </div>
</body></html>`;
};
