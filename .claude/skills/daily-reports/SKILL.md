---
name: daily-reports
description: 日次締めレポート・証跡生成・仕訳ドラフトの実装パターン
---

# 日次締め・会計機能

## アーキテクチャ

- **Daily Close Cron**: 毎日自動実行で日次締めを実施
- **証跡生成**: レシート・レポートをR2に保存（HTML/JSON）
- **仕訳ドラフト**: 会計仕訳をAI生成し、Inboxで人間承認
- **異常検知**: 売上急増・急減などを検知し、Inboxへ起票

## 主要エンドポイント

### レポート
- `GET /reports/daily?date=YYYY-MM-DD` - 日次売上レポート取得
- `POST /daily-close/:date/artifacts` - 日次締め帳票生成
- `GET /daily-close/:date/documents` - 日次ドキュメント一覧
- `GET /r2?key=daily-close/2026-01-13/report.html` - R2ファイル取得

### 仕訳
- `GET /ledger-entries?date=YYYY-MM-DD` - 仕訳一覧取得
- `POST /ledger-entries` - 仕訳作成（Inbox承認後）

## 日次締めフロー

### 1. Daily Close Cron実行
```typescript
// Cloudflare Workers Cron
export default {
  async scheduled(event, env, ctx) {
    const yesterday = getYesterday()
    await runDailyClose(yesterday, env)
  }
}
```

### 2. 日次レポート生成
```typescript
const report = await getDailySalesReport(date, env.DB)
// report = { totalSales, orderCount, refundCount, ... }
```

### 3. 証跡保存（R2）
```typescript
const html = generateReportHTML(report)
await env.R2.put(`daily-close/${date}/report.html`, html, {
  httpMetadata: { contentType: 'text/html' }
})

const json = JSON.stringify(report)
await env.R2.put(`daily-close/${date}/report.json`, json, {
  httpMetadata: { contentType: 'application/json' }
})
```

### 4. 異常検知
```typescript
const { anomalies, severity } = detectAnomalies(report, historicalData)
// severity: 'normal' | 'warning' | 'critical'

if (severity !== 'normal') {
  await createInboxItem({
    type: 'daily_close_anomaly',
    severity,
    metadata: { date, anomalies }
  })
}
```

### 5. 仕訳ドラフト生成（AI）
```typescript
const ledgerDraft = await generateLedgerEntries(report, env.CLAUDE_API_KEY)
await createInboxItem({
  type: 'ledger_approval',
  severity: 'info',
  metadata: { date, ledgerDraft }
})
```

## 異常検知ルール

- **売上急増**: 前日比+50%以上 → `warning`
- **売上急減**: 前日比-50%以上 → `warning`
- **返金過多**: 返金率20%以上 → `critical`
- **在庫不足**: 閾値以下の商品あり → `warning`

## 仕訳ドラフト

### AI生成パターン
```typescript
// Claude APIで仕訳を生成
const prompt = `
日次売上: ${report.totalSales}円
返金: ${report.refundAmount}円

以下の形式で仕訳を生成:
借方: 現金 / 貸方: 売上
借方: 売上 / 貸方: 現金（返金）
`

const response = await callClaudeAPI(prompt, apiKey)
const ledgerEntries = parseLedgerEntries(response)
```

### Inbox承認フロー
1. 仕訳ドラフトをInboxに起票
2. 人間が `/admin/inbox` で内容確認
3. `POST /inbox/:id/approve` で承認 → 仕訳確定
4. `POST /inbox/:id/reject` で却下 → 再生成

## ローカルテスト

### Cron手動トリガー
```bash
# wrangler dev 起動後
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```

### シードデータ投入
```bash
curl -X POST http://localhost:8787/dev/seed \
  -H "x-admin-key: CHANGE_ME" \
  -H "content-type: application/json" \
  -d '{"date":"2026-01-13","orders":5,"refunds":1}'
```

### 証跡確認
```bash
# 日次レポート取得
curl "http://localhost:8787/reports/daily?date=2026-01-13" \
  -H "x-admin-key: CHANGE_ME"

# 証跡生成
curl -X POST "http://localhost:8787/daily-close/2026-01-13/artifacts" \
  -H "x-admin-key: CHANGE_ME"

# R2ファイル取得
curl "http://localhost:8787/r2?key=daily-close/2026-01-13/report.html" \
  -H "x-admin-key: CHANGE_ME"
```

## 重要な設計ポイント

- **証跡保存**: レシート等はR2に保存し、改ざん防止
- **監査ログ**: 全ての帳票生成・承認をD1に記録
- **AI生成の人間承認**: 仕訳ドラフトは必ず人間が確認（Inboxパターン）
- **Stripeが正**: 財務データはStripeから取得し、D1は参照用
