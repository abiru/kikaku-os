<!-- .claude/commands/exec-issue.md -->
`gh issue view $ARGUMENTS` でGitHub Issueの内容を確認し、タスクを遂行してください。

## 手順
1. Issueの内容を理解する
2. `git checkout main && git pull` で最新化
3. Issue内容からブランチ作成 (例: `feat/issue-123-add-login`)
4. 実装（下記の規約に従う）
5. テスト作成・実行 (`pnpm -C apps/api test`)
6. ビルド確認 (`pnpm -C apps/api build && pnpm -C apps/storefront build`)
7. 適切な粒度でコミット（Conventional Commits形式）
8. PRを作成（`gh pr create`）

## kikaku-os固有ルール

### ディレクトリ構成
- **Storefront (Astro SSR)**: `apps/storefront/src/`
  - ページ: `pages/`
  - コンポーネント: `components/`
  - 管理画面: `pages/admin/`
- **API (Hono + Workers)**: `apps/api/src/`
  - ルート: `routes/`
  - サービス: `services/`
  - ユーティリティ: `lib/`
- **DBマイグレーション**: `migrations/` (D1 SQL)

### コード規約
- D1はプリペアドステートメントで操作
- APIレスポンス: `jsonOk()`, `jsonError()` ヘルパー使用
- 管理者API認証: `x-admin-key` ヘッダー
- Immutableパターン（オブジェクトを変更しない）

### 開発コマンド
```bash
pnpm -C apps/api dev --port 8787        # API開発サーバー
pnpm -C apps/storefront dev              # Storefront開発サーバー
pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local  # マイグレーション
```

## 入力
$ARGUMENTS にIssue番号を指定（例: `123` または `#123`）
