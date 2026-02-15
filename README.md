# Led Kikaku OS v1

脱Shopify運用OSの最小実装。Cloudflare Workers + Hono API と Astro SSR（ストア + 管理画面）で日次締め・証跡・仕訳ドラフト・Inbox を提供します。

## スタック
- Cloudflare Workers + Hono (TypeScript)
- Cloudflare D1 (SQLite)
- Cloudflare R2
- Storefront + Admin: Astro SSR

## 主要機能

### 決済システム
- **Stripe Elements**: 埋め込み型チェックアウト（PaymentIntent API）
- **銀行振込**: `ENABLE_BANK_TRANSFER`で有効化（Stripe jp_bank_transfer）
- **カート**: LocalStorage永続化、複数商品対応

### 日本対応
- **消費税計算**: 税率マスタ（標準10%・軽減8%）、税込表示
- **i18n**: 日本語UI（`src/i18n/ja.json`）

### 運用機能
- **Daily Close**: 日次売上集計・証跡生成・仕訳ドラフト
- **Inbox**: 異常検知・承認フロー
- **在庫管理**: しきい値アラート・入出庫記録

### AI機能（オプション）
- **Claude API統合**: コンテンツ生成・Inboxトリアージ・顧客対応下書き
- **Cloudflare AI Gateway**: キャッシング・コスト削減・モニタリング・自動フォールバック
- **Inboxパターン**: AI出力は必ず人間承認（信頼しない設計）

## 本番デプロイ

本番環境へのデプロイ手順は **[DEPLOYMENT.md](./DEPLOYMENT.md)** を参照してください。

**クイックスタート**:
```bash
# 1. インフラ作成
wrangler d1 create ledkikaku-os
wrangler r2 bucket create ledkikaku-artifacts

# 2. マイグレーション適用
wrangler d1 migrations apply ledkikaku-os --remote

# 3. GitHub Secretsを設定（docs/GITHUB_SECRETS.md参照）

# 4. デプロイ
git push origin main
```

**ドキュメント**:
- [デプロイガイド](./DEPLOYMENT.md) - 完全な本番デプロイ手順
- [GitHub Secrets設定](./docs/GITHUB_SECRETS.md) - 必須シークレットの設定
- [Stripe Webhook設定](./docs/STRIPE_WEBHOOK_SETUP.md) - Webhook設定手順
- [カスタムドメイン設定](./docs/CUSTOM_DOMAIN_SETUP.md) - 独自ドメイン設定
- [検証チェックリスト](./docs/VERIFICATION_CHECKLIST.md) - デプロイ後の確認
- [ロールバック手順](./docs/ROLLBACK_PROCEDURES.md) - 緊急時の手順

## ローカル開発
依存は pnpm を推奨します。

### 共通
- 環境変数: Wrangler は `.dev.vars` を参照（ローカルでのみ使用・コミットしない）
- 最低限必要な変数:
  - `ADMIN_API_KEY`
  - `DEV_MODE`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PUBLISHABLE_KEY`（Embedded Checkout用）
  - `STRIPE_WEBHOOK_SECRET`
  - `STOREFRONT_BASE_URL`
- オプション変数:
  - `CLAUDE_API_KEY`（AI機能用・Anthropic APIキー）
  - `AI_GATEWAY_ACCOUNT_ID`（Cloudflare AI Gateway経由でClaude API呼び出し）
  - `AI_GATEWAY_ID`（Cloudflare AI Gateway経由でClaude API呼び出し）
  - `ENABLE_BANK_TRANSFER`（銀行振込決済の有効化）
  - `SHIPPING_FEE_AMOUNT`（送料、円）
  - `FREE_SHIPPING_THRESHOLD`（送料無料閾値、円）
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

### チェックアウト・決済
* POST /checkout/session - Stripeチェックアウトセッション作成
* POST /payments/create-intent - PaymentIntent作成（Embedded Checkout）
* POST /payments/confirm - 支払い確定
* GET /payments/:id - 支払い詳細取得
* POST /webhooks/stripe - Stripeウェブフック

### ストアフロント
* GET /store/products - 商品一覧（ページネーション対応）
* GET /store/products/:id - 商品詳細
* GET /store/cart - カート情報取得
* POST /store/cart - カート操作

### レポート・会計
* GET /reports/daily?date=YYYY-MM-DD - 日次売上レポート
* POST /daily-close/:date/artifacts - 日次締め帳票生成
* GET /daily-close/:date/documents - 日次ドキュメント取得
* GET /ledger-entries?date=YYYY-MM-DD - 仕訳一覧
* GET /r2?key=... - R2ファイル取得

### 管理API
* GET /inbox?status=open&severity=&limit= - インボックス一覧
* POST /inbox/:id/approve / POST /inbox/:id/reject - 承認/却下
* GET /inventory/low?limit= - 在庫不足一覧
* POST /inventory/thresholds - 在庫閾値設定
* GET/POST/PUT/DELETE /admin/tax-rates - 税率管理

### 開発用
* POST /dev/seed (DEV_MODE=trueのみ) - テストデータ投入

## Seed API

```bash
curl -X POST http://localhost:8787/dev/seed \
  -H "x-admin-key: CHANGE_ME" \
  -H "content-type: application/json" \
  -d '{"date":"2026-01-13","orders":5,"refunds":1,"withImages":true}'
```

## Playwright UI/UX E2E

Seedデータ投入後のブラウザ挙動（ホーム表示、商品一覧、モバイルメニュー）を自動確認できます。

```bash
pnpm test:e2e:seed-ui
```

初回のみブラウザが未インストールの場合:

```bash
pnpm exec playwright install chromium
```

## 管理画面（/admin/*）

* /admin/inbox: Open items の詳細と Approve/Reject
* /admin/orders: 注文一覧・詳細（payments/refunds/events/fulfillments）
* /admin/events: Stripe webhook ログ
* /admin/products: 商品一覧・詳細（バリアント・価格・在庫管理）
* /admin/inventory: 在庫管理・しきい値設定
* /admin/tax-rates: 消費税率管理（標準10%・軽減8%）
* /admin/reports: 日次締めレポート
* /admin/ledger: 仕訳一覧
* /admin/customers: 顧客管理

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

### Embedded Checkout（Stripe Elements）
ストアフロントの `/checkout` ページで埋め込み型決済フォームを表示。
PaymentIntent APIを使用し、カード決済・銀行振込に対応。

### Legacy: Checkout Session 作成（例）
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
