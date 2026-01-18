# Led Kikaku OS v1

脱Shopify運用OSの最小実装。Cloudflare Workers + Hono API と React + Tailwind 管理画面で日次締め・証跡・仕訳ドラフト・Inbox を提供します。

## スタック
- Cloudflare Workers + Hono (TypeScript)
- Cloudflare D1 (SQLite)
- Cloudflare R2
- Admin: React + Tailwind (Vite)
- Storefront: Astro

## ローカル開発
依存は pnpm を推奨します。

### 共通
- 環境変数: `ADMIN_API_KEY` を wrangler.toml に設定
- API: http://localhost:8787
- Admin: http://localhost:5173
- Storefront: http://localhost:4321
- CORS origin: http://localhost:5173 / http://127.0.0.1:5173 / http://localhost:4321 / http://127.0.0.1:4321
- ローカルseed: `DEV_MODE=true` のときのみ `/dev/seed` が有効

### API
```bash
pnpm install --prefix apps/api
# ルートの .dev.vars.example を .dev.vars にコピー（wrangler.toml と同階層の .dev.vars が source-of-truth / apps/api/.dev.vars.example は参照用）
cp .dev.vars.example .dev.vars
pnpm -C apps/api dev -- --port 8787

# 初回スキーマ適用 (ローカル D1)
pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
```
Stripe: `STRIPE_SECRET_KEY`(sk*) はルートの `.dev.vars` に設定（`apps/api/.dev.vars.example` は参照用）。`STRIPE_WEBHOOK_SECRET`(whsec*) もルートの `.dev.vars` に設定（Webhook ルートのみ必要）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。Checkout で `STRIPE_PRICE_NOT_CONFIGURED` が返る場合は dev で `/dev/provision-stripe-prices` を実行し、variant に `provider_price_id` があることを確認。

### Admin
```bash
pnpm install --prefix apps/admin
pnpm -C apps/admin dev
```

### Storefront
```bash
pnpm install --prefix apps/storefront
cp apps/storefront/.env.example apps/storefront/.env
pnpm -C apps/storefront dev
```
環境変数: `PUBLIC_API_BASE`（デフォルトは http://localhost:8787）

Adminの起動確認（キャッシュが残る場合）:
```bash
rm -rf apps/admin/node_modules/.vite
pnpm -C apps/admin dev
```

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
* GET /store/products / GET /store/products/:id

## Seed API

```bash
curl -X POST http://localhost:8787/dev/seed \
  -H "x-admin-key: CHANGE_ME" \
  -H "content-type: application/json" \
  -d '{"date":"2026-01-13","orders":5,"refunds":1}'
```

## Admin 画面

* 日次締め: 日付選択、レポート表示、証跡作成、ドキュメント閲覧
* 仕訳: 日付別 ledger entries をテーブル表示
* Inbox: Open items の詳細と Approve/Reject

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
