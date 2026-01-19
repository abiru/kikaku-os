# Led Kikaku OS v1

脱Shopify運用OSの最小実装。Cloudflare Workers + Hono API と Astro SSR（ストア + 管理画面）で日次締め・証跡・仕訳ドラフト・Inbox を提供します。

## スタック
- Cloudflare Workers + Hono (TypeScript)
- Cloudflare D1 (SQLite)
- Cloudflare R2
- Storefront + Admin: Astro SSR

## ローカル開発
依存は pnpm を推奨します。

### 共通
- 環境変数: Wrangler は `.dev.vars` を参照（ローカルでのみ使用・コミットしない）
- 最低限必要な変数:
  - `ADMIN_API_KEY`
  - `DEV_MODE`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STOREFRONT_BASE_URL`
- API: http://localhost:8787
- Storefront + Admin: http://localhost:4321
- CORS origin: http://localhost:4321 / http://127.0.0.1:4321
- ローカルseed: `DEV_MODE=true` のときのみ `/dev/seed` が有効

### API
```bash
pnpm install --prefix apps/api
# .dev.vars を作成（例）
cat <<'EOF' > .dev.vars
ADMIN_API_KEY=CHANGE_ME
DEV_MODE=true
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STOREFRONT_BASE_URL=http://localhost:4321
EOF
pnpm -C apps/api dev -- --port 8787

# 初回スキーマ適用 (ローカル D1)
pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
```
Note: If the API shows up on 8788 (or smoke/dev seems odd), it usually means double-boot: another dev server is already listening on 8787.
Check: `lsof -nP -iTCP:8787 -sTCP:LISTEN` then `kill <PID>`.

### Storefront
```bash
pnpm install --prefix apps/storefront
cp apps/storefront/.env.example apps/storefront/.env
pnpm -C apps/storefront dev
```
環境変数: `PUBLIC_API_BASE`（デフォルトは http://localhost:8787）

## 主要エンドポイント

* GET /reports/daily?date=YYYY-MM-DD
* POST /daily-close/:date/artifacts
* GET /daily-close/:date/documents
* GET /r2?key=...
* GET /ledger-entries?date=YYYY-MM-DD
* GET /inbox?status=open&severity=&limit=
* POST /inbox/:id/approve / POST /inbox/:id/reject
* GET /inventory/low?limit=
* POST /inventory/thresholds
* POST /dev/seed (DEV_MODE=trueのみ)
* POST /checkout/session
* POST /webhooks/stripe / POST /stripe/webhook
* GET /store/products / GET /store/products/:id

## Seed API

```bash
curl -X POST http://localhost:8787/dev/seed \
  -H "x-admin-key: CHANGE_ME" \
  -H "content-type: application/json" \
  -d '{"date":"2026-01-13","orders":5,"refunds":1}'
```

## 管理画面（/admin/*）

* /admin/inbox: Open items の詳細と Approve/Reject
* /admin/orders: 注文一覧・詳細（payments/refunds/events）
* /admin/events: Stripe webhook ログ
* /admin/products: 商品一覧
* /admin/reports: 日次締めレポート
* /admin/ledger: 仕訳一覧

## 動作確認手順（curl例）

```bash
curl -X POST http://localhost:8787/dev/seed \
  -H "x-admin-key: CHANGE_ME" \
  -H "content-type: application/json" \
  -d '{"date":"2026-01-13","orders":5,"refunds":1}'

curl "http://localhost:8787/reports/daily?date=2026-01-13" \
  -H "x-admin-key: CHANGE_ME"

curl -X POST "http://localhost:8787/daily-close/2026-01-13/artifacts" \
  -H "x-admin-key: CHANGE_ME"

curl "http://localhost:8787/ledger-entries?date=2026-01-13" \
  -H "x-admin-key: CHANGE_ME"

curl -v "http://localhost:8787/r2?key=daily-close/2026-01-13/report.html" \
  -H "x-admin-key: CHANGE_ME"
```

## Storefront checkout（ローカル）

Stripe CLI で Webhook を転送:
```bash
stripe listen --forward-to http://localhost:8787/webhooks/stripe
```

Checkout Session 作成（例）:
```bash
curl -X POST http://localhost:8787/checkout/session \
  -H "content-type: application/json" \
  -d '{"variantId":1,"quantity":1,"email":"test@example.com"}'
```

## Daily Close Cron（ローカル）
```bash
# wrangler dev を起動後、scheduled を手動トリガー
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```

異常検知（warning/critical）の場合、Cron 実行時に Inbox へ自動起票されます。
