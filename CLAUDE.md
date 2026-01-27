# CLAUDE.md

See @README.md for project overview.

## 開発コマンド

```bash
# 開発サーバー起動（API + Storefront + Stripe Webhook を一括起動）
pnpm dev

# テスト実行
pnpm -C apps/api test

# データベースマイグレーション（ローカル）
pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
```

## コード規約

### API (Hono)
- レスポンス: `jsonOk()`, `jsonError()` ヘルパーを使用（独自実装）
- 認証: `x-admin-key` ヘッダー（管理者API）
- D1はプリペアドステートメントで操作

### Storefront (Astro)
- i18n: `src/i18n/ja.json` + `t()` ヘルパー関数で日本語化

## 主要な設計方針（重要）

1. **Cloudflareスタック固定** - Workers, D1, R2を使用、変更不可
2. **AIは信頼しない** - AI出力は必ず人間承認（Inboxパターン）
3. **Stripeが正** - 財務データはStripeをソースとし、Webhookで同期
4. **証跡保存** - レシート等はR2に、監査ログはD1に保存

## 環境変数

ローカル開発: `.dev.vars` に秘密情報を配置（gitignore済み）
本番環境: `wrangler.toml` で設定
