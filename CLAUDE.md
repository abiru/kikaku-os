# CLAUDE.md

See @README.md for project overview.

## 開発コマンド

```bash
# 初回セットアップ
pnpm install
pnpm env:setup          # .dev.vars と .env をテンプレートからコピー
pnpm db:migrate         # ローカルD1にスキーマ適用

# 開発サーバー起動（推奨: 両方同時起動）
pnpm dev                # API + Storefront を並列起動

# 個別起動
pnpm dev:api            # API: http://localhost:8787
pnpm dev:store          # Store + Admin: http://localhost:4321

# テスト・ビルド
pnpm test               # APIテスト実行
pnpm build              # 全アプリビルド

# シードデータ投入（DEV_MODE=true時のみ）
pnpm db:seed
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
