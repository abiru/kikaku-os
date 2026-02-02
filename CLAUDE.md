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

## Feature Development Workflow

すべての機能開発は標準ワークフローに従います。

```bash
/feature "機能の説明"
```

7ステップを自動実行（各ステップでユーザー確認）：
1. Plan - 実装計画作成
2. Worktree - 分離環境作成
3. Issue - GitHub Issue作成
4. Exec - 実装（TDD）
5. Typecheck - 型チェック（エラー時は自動修正試行）
6. Test - テスト実行（失敗時は自動修正試行）
7. PR - Pull Request作成

詳細: `.claude/commands/feature.md`

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

## AI機能（Claude API）

### Cloudflare AI Gateway統合

Claude API呼び出しはCloudflare AI Gateway経由で実行され、以下の機能を提供：

- **キャッシング**: 重複リクエストのコスト削減
- **モニタリング**: トークン使用量・コストのリアルタイム追跡
- **レート制限**: Cloudflare側での追加制限
- **フォールバック**: Gateway障害時は直接API呼び出しに自動切替

### セットアップ手順

1. **Cloudflare Dashboard**でAI Gatewayを作成:
   - https://dash.cloudflare.com/?to=/:account/ai/ai-gateway
   - Gateway名を設定（例: `ledkikaku-ai-gateway`）
   - `account_id` と `gateway_id` をコピー

2. **環境変数を設定**:
   ```bash
   # .dev.vars (ローカル開発)
   CLAUDE_API_KEY=sk-ant-xxx
   AI_GATEWAY_ACCOUNT_ID=your_cloudflare_account_id
   AI_GATEWAY_ID=your_ai_gateway_id
   ```

3. **本番環境**では GitHub Secrets または `wrangler secret put` で設定

**注意**: AI Gateway設定がない場合は、自動的に直接API呼び出しにフォールバックします。

## 環境変数

ローカル開発: `.dev.vars` に秘密情報を配置（gitignore済み）
本番環境: `wrangler.toml` で設定
