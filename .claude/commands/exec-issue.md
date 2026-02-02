<!-- .claude/commands/exec-issue.md -->
<!-- Part of Feature Workflow: Step 4 (EXEC) -->
<!-- Previous: create-issue | Next: typecheck → test → pr -->

## このコマンドについて

このコマンドは **Feature Workflow の Step 4** です。
実行前に以下が完了していることを確認してください：
- Step 1: Plan（実装計画作成）
- Step 2: Worktree（分離環境作成）
- Step 3: Issue（GitHub Issue作成）

完全なワークフローを実行したい場合は `/feature` コマンドを使用してください。

---

`gh issue view $ARGUMENTS` でGitHub Issueの内容を確認し、タスクを遂行してください。

## 手順

1. Issueの内容を理解する

2. mainを最新化（現在のworktreeから）
```bash
   git fetch origin
   git checkout main
   git pull origin main
```

3. worktreeを作成してブランチ切り替え
```bash
   # Issue番号からブランチ名を生成（例: feat/issue-43-product-filter）
   git worktree add ../kikaku-os-$ARGUMENTS feat/issue-$ARGUMENTS-{概要}
   cd ../kikaku-os-$ARGUMENTS
```

4. 実装（下記の規約に従う）

5. テスト作成・実行
```bash
   pnpm -C apps/api test
```

6. ビルド確認
```bash
   pnpm -C apps/api build && pnpm -C apps/storefront build
```

7. 適切な粒度でコミット（Conventional Commits形式）

8. PRを作成
```bash
   gh pr create --fill
```

9. 完了後の案内を表示
```
   ✅ PR作成完了
   
   マージ後の動作確認:
     cd ../kikaku-os && git pull
   
   worktree削除（マージ後）:
     git worktree remove ../kikaku-os-$ARGUMENTS
```

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

### 開発コマンド（worktree内で実行）
```bash
pnpm install                              # 依存関係インストール（初回）
pnpm -C apps/api dev --port 8788          # API開発サーバー（ポート変更）
pnpm -C apps/storefront dev --port 4322   # Storefront（ポート変更）
pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
```

## 注意事項
- worktreeではmainと別ポートでサーバーを起動すること
- `pnpm install` はworktree作成後に必要
- マージ後は `git worktree remove` で削除

## 入力
$ARGUMENTS にIssue番号を指定（例: `43` または `#43`）

---

## 完了後の次のステップ（Feature Workflow）

このコマンドでの実装が完了したら、次のステップに進みます：

### Step 5: Typecheck（型チェック）
```bash
# API
pnpm -C apps/api typecheck

# Storefront
pnpm -C apps/storefront exec astro check
```
すべての型エラーを修正してから次に進んでください。

### Step 6: Test（テスト実行）
```bash
# API
pnpm -C apps/api test

# Storefront（存在する場合）
pnpm -C apps/storefront test
```
すべてのテストがパスし、新規コードのカバレッジが80%以上であることを確認してください。

### Step 7: PR（Pull Request作成）
```bash
# コミット履歴を確認
git log main..HEAD

# PRを作成
gh pr create --title "feat: [description]" --body "[summary and test plan]"
```

**ヒント**: 完全なワークフローを自動実行したい場合は、次回から `/feature` コマンドを使用してください。
