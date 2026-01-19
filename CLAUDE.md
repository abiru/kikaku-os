# CLAUDE.md

このファイルはClaudeがこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

Led Kikaku OS - Cloudflareスタック上に構築されたECプラットフォーム。pnpmワークスペースによるモノレポ構成で、2つのアプリケーションから成る。

## アーキテクチャ

```
apps/
├── api/        # Hono + Cloudflare Workers バックエンドAPI
└── storefront/ # Astro SSR 公開ストア + 管理画面（/admin/*）
```

- **データベース**: Cloudflare D1 (SQLite)
- **ストレージ**: Cloudflare R2
- **決済**: Stripe (Webhook連携)

## 開発コマンド

### 依存関係インストール
```bash
pnpm install
```

### 開発サーバー起動
```bash
pnpm -C apps/api dev --port 8787        # API: http://localhost:8787
pnpm -C apps/storefront dev              # Store + Admin: http://localhost:4321
```

### テスト実行
```bash
pnpm -C apps/api test
```

### ビルド
```bash
pnpm -C apps/api build
pnpm -C apps/storefront build
```

### データベースマイグレーション（ローカル）
```bash
pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
```

## コード規約

### TypeScript
- strictモード有効、ES2020+ターゲット
- 型定義にはTypeScriptの型を使用（JSDocは不要）
- 変数・関数: camelCase、コンポーネント・型: PascalCase

### API (Hono)
- `routes/` にルートハンドラー、`services/` にビジネスロジック、`lib/` にユーティリティ
- D1はプリペアドステートメントで操作
- レスポンス: `jsonOk()`, `jsonError()` ヘルパーを使用
- 認証: `x-admin-key` ヘッダー（管理者API）

### Storefront (Astro)
- `.astro` ファイルでSSRページ
- クライアントJSはインライン `<script>` タグ
- コンポーネントは `src/components/` に配置

## テスト

- **テストフレームワーク**: Vitest
- **命名**: `*_test.ts` または `*.test.ts`

## 主要な設計方針

1. **Cloudflareスタック固定** - Workers, D1, R2を使用、変更不可
2. **AIは信頼しない** - AI出力は必ず人間承認（Inboxパターン）
3. **Stripeが正** - 財務データはStripeをソースとし、Webhookで同期
4. **証跡保存** - レシート等はR2に、監査ログはD1に保存

## 環境変数

`wrangler.toml` で設定:
- `ADMIN_API_KEY`: 管理者API認証キー
- `DEV_MODE`: 開発モードフラグ
- `STRIPE_SECRET_KEY`: Stripe秘密鍵
- `STRIPE_WEBHOOK_SECRET`: Stripeウェブフック署名検証用
- `STOREFRONT_BASE_URL`: ストアフロントURL

ローカル開発は `.dev.vars` に秘密情報を配置（gitignore済み）。

## ディレクトリ詳細

### migrations/
D1スキーママイグレーション（SQL）。`0001_init.sql` から順番に適用。

### Key API Endpoints
- `GET /reports/daily?date=YYYY-MM-DD` - 日次売上レポート
- `POST /daily-close/:date/artifacts` - 日次締め帳票生成
- `GET /ledger-entries?date=YYYY-MM-DD` - 仕訳一覧
- `GET /inbox?status=open` - 未処理インボックス
- `POST /checkout/session` - Stripeチェックアウト作成
- `POST /webhooks/stripe` - Stripeウェブフック
