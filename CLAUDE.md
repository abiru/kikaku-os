# CLAUDE.md

See @README.md for project overview.

## 開発コマンド

```bash
# 開発サーバー起動
pnpm -C apps/api dev --port 8787        # API: http://localhost:8787
pnpm -C apps/storefront dev              # Store + Admin: http://localhost:4321

# テスト実行
pnpm -C apps/api test

# データベースマイグレーション（ローカル）
pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
```

## Feature Development Workflow

すべての機能開発は標準ワークフローに従います。

### クイックスタート

```bash
/feature "機能の説明"
```

Claudeが自動的に以下の7ステップを実行します：

1. **Plan** - planner agentで実装計画作成
2. **Worktree** - git worktree作成（mainと分離、ポート衝突回避）
3. **Issue** - GitHub Issue作成（トラッキング）
4. **Exec** - 実装（TDD approach）
5. **Typecheck** - 型チェック（API + Storefront）
6. **Test** - テスト実行（80%+ coverage required）
7. **PR** - Pull Request作成（包括的なサマリー）

各ステップで確認を取りながら進みます。

### ワークフローの利点

- **一貫性**: すべての機能が同じ高品質プロセスに従う
- **品質**: 必須の型チェックとテストがリグレッションを防ぐ
- **文書化**: 計画、Issue、PRが完全なコンテキストを提供
- **分離**: Worktreeがmainブランチとの競合を防ぐ
- **自動化**: 認知負荷を減らし、ステップの漏れを防ぐ

### 個別コマンド（高度な使用）

完全なワークフローではなく、個別のステップのみを実行したい場合：

- `/create-issue` - Issue作成のみ（Step 3）
- `/exec-issue [番号]` - 実装のみ（Step 4）
- `/code-review` - コードレビューのみ

### 詳細

詳細なワークフロー説明は `.claude/commands/feature.md` を参照。
自動検知ルールは `.claude/rules/feature-workflow.md` を参照。

---

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
