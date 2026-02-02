<!-- .claude/commands/feature.md -->

## 目的

新機能開発の完全ワークフローを実行する統合コマンド。
すべての機能開発に対して、一貫したプロセスを提供します。

## ワークフロー概要

1. **Plan** - planner agentで実装計画作成
2. **Worktree** - git worktree作成（main と分離、ポート衝突回避）
3. **Issue** - GitHub Issue作成（トラッキング）
4. **Exec** - 実装（TDD + code review）
5. **Typecheck** - 型チェック（API + Storefront）
6. **Test** - テスト実行（API + Storefront、80%+ coverage）
7. **PR** - Pull Request作成（包括的なサマリー）

## 使用方法

```bash
# 新機能開発を開始
/feature "product filtering for admin page"

# 既存のissueから再開
/feature --resume 142

# 特定のステップをスキップ（非推奨）
/feature "quick feature" --skip-plan
```

## 引数

- `$ARGUMENTS` - 機能の説明（必須）
- `--resume [number]` - 既存のissueから再開
- `--skip-plan` - 計画ステップをスキップ（明示的に指示された場合のみ）
- `--skip-worktree` - worktree作成をスキップ（既に存在する場合）

## 詳細ステップ

---

### ステップ1: Plan

**目的**: 実装計画を作成し、スコープと設計を明確にする

**実行内容**:

1. planner agentを起動:
   ```
   @planner <description>
   ```

2. Agentが以下を含む詳細計画を作成:
   - フェーズ分割
   - 変更対象ファイル
   - 依存関係
   - リスク
   - 実装アプローチ

3. 計画は `.claude/plans/feature-{timestamp}.md` に保存

4. ユーザーに計画を表示し、承認を待つ:
   ```
   Plan created at .claude/plans/feature-20260202-143022.md

   ## Summary
   [Plan summary here]

   Proceed to Step 2: Worktree creation?
   ```

**スキップ条件**:
- `--skip-plan` が指定されている
- ユーザーが "skip planning, I already have a design" と明示

**エラーハンドリング**:
- planner agentが利用不可: エラー表示、手動計画を提案
- 計画が不完全: ユーザーに追加情報を求める

---

### ステップ2: Worktree Cleanup & Create

**目的**: 分離された開発環境を作成し、main branchとの衝突を回避

#### 2.1: Cleanup Phase

1. 既存worktreeをチェック:
   ```bash
   git worktree list
   ```

2. 古い/マージ済みworktreeを特定:
   - 作成から7日以上経過
   - ブランチがマージ済み
   - ブランチが削除済み

3. クリーンアップを提案:
   ```
   Found old worktrees:
   - ../kikaku-os-110 (feat/issue-110-settings, merged 10 days ago)
   - ../kikaku-os-111 (feat/issue-111-google-ads, deleted)

   Remove them? (y/n)
   ```

4. ユーザーが承認したら削除:
   ```bash
   git worktree remove ../kikaku-os-110
   git worktree remove ../kikaku-os-111
   ```

#### 2.2: Create Phase

1. 最新のmainを取得:
   ```bash
   git fetch origin
   # mainブランチにいる場合のみ
   git pull origin main
   ```

2. Issue番号を決定:
   - `--resume [number]` が指定されていればそれを使用
   - そうでなければ、次のステップ（Issue作成）後に決定

3. Worktreeを作成:
   ```bash
   # Issue番号が分かっている場合
   git worktree add ../kikaku-os-{number} -b feat/issue-{number}-{slug}

   # Issue番号が未定の場合（Step 3の後に作成）
   # このステップは一時的にスキップし、Issue作成後に戻る
   ```

4. 依存関係をインストール:
   ```bash
   cd ../kikaku-os-{number}
   pnpm install
   ```

5. 確認メッセージ:
   ```
   ✓ Worktree created at ../kikaku-os-142
   ✓ Branch: feat/issue-142-product-filtering
   ✓ Dependencies installed

   Dev servers will use:
   - API: http://localhost:8788
   - Storefront: http://localhost:4322
   ```

**スキップ条件**:
- `--skip-worktree` が指定されている
- Worktreeが既に存在する（`--resume` 使用時）

**エラーハンドリング**:
- Worktreeパスが既に存在: 削除提案 or 別名使用
- pnpm installが失敗: エラー表示、ユーザーに手動実行を促す
- Gitリポジトリでない: エラー表示、終了

---

### ステップ3: Issue

**目的**: GitHub Issueを作成し、作業をトラッキング

**実行内容**:

1. `create-issue` コマンドを内部的に呼び出す

2. Issueの内容を計画から抽出:
   - **Title**: `feat: [description]`（50文字以内）
   - **Body**: 計画のサマリー + Acceptance Criteria
   - **Labels**: `enhancement`, `priority:normal`

3. GitHub CLIで作成:
   ```bash
   gh issue create \
     --title "feat: product filtering for admin page" \
     --body "[Plan summary and acceptance criteria]" \
     --label "enhancement,priority:normal"
   ```

4. Issue番号をキャプチャ:
   ```
   ✓ Issue created: #142
   URL: https://github.com/user/repo/issues/142
   ```

5. Issue番号を使ってWorktreeを作成（Step 2がスキップされていた場合）

**スキップ条件**:
- `--resume [number]` でIssue番号が既知
- Issue #[number] が既に存在

**エラーハンドリング**:
- GitHub CLI未認証: `gh auth login` を促す
- Issue作成失敗: エラー表示、手動作成を提案

---

### ステップ4: Exec

**目的**: 機能を実装し、コードレビューを実施

**実行内容**:

1. `exec-issue` コマンドを内部的に呼び出す:
   ```bash
   /exec-issue 142
   ```

2. exec-issueが以下を実行:
   - Worktreeに移動
   - Dev serversを起動（API: 8788, Storefront: 4322）
   - 実装ガイダンスを提供
   - TDD アプローチを促進:
     1. テストを書く（RED）
     2. 実装する（GREEN）
     3. リファクタリング（IMPROVE）

3. 実装完了後、code-reviewerを自動起動:
   ```
   @code-reviewer
   ```

4. レビュー結果を評価:
   - **CRITICAL/HIGH issues**: ブロック、修正を要求
   - **MEDIUM issues**: 警告、修正を推奨
   - **LOW issues**: 情報提供のみ

5. コミット:
   ```bash
   git add [changed files]
   git commit -m "feat: [description]

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
   ```

6. 確認メッセージ:
   ```
   ✓ Implementation complete
   ✓ Code review passed
   ✓ Changes committed

   Proceeding to Step 5: Typecheck...
   ```

**エラーハンドリング**:
- Dev server起動失敗（ポート使用中）: 別ポートを提案
- Code review失敗（CRITICAL issues）: 修正を要求、再レビュー
- コミット失敗: エラー表示、ユーザーに手動実行を促す

---

### ステップ5: Typecheck

**目的**: TypeScriptの型エラーをチェック

**実行内容**:

1. APIの型チェック:
   ```bash
   pnpm -C apps/api typecheck
   ```

2. Storefrontの型チェック:
   ```bash
   pnpm -C apps/storefront exec astro check
   ```

3. 結果を評価:
   - **エラーなし**: 次のステップへ進む
   - **エラーあり**: エラーを表示、修正を要求

4. エラー時の対応:
   ```
   ✗ Typecheck failed with 3 errors:

   apps/api/src/routes/products.ts:45:12
   - Type 'string' is not assignable to type 'number'

   apps/storefront/src/pages/admin/products.astro:23:5
   - Property 'price' does not exist on type 'Product'

   [More errors...]

   Please fix these errors and I'll retry the typecheck.
   ```

5. 修正後、再チェック:
   - ユーザーが修正を完了したら、再度typecheckを実行
   - すべてのエラーが解消されるまで繰り返す

6. 成功時:
   ```
   ✓ API typecheck passed
   ✓ Storefront typecheck passed

   Proceeding to Step 6: Tests...
   ```

**スキップ条件**:
- NEVER（型チェックは必須）

**エラーハンドリング**:
- pnpm未インストール: エラー表示、インストールを促す
- package.jsonが存在しない: エラー表示、worktreeの状態を確認
- typescriptスクリプトが未定義: エラー表示、package.jsonを確認

---

### ステップ6: Test

**目的**: テストを実行し、カバレッジを確認

**実行内容**:

1. APIのテスト:
   ```bash
   pnpm -C apps/api test
   ```

2. Storefrontのテスト（存在する場合）:
   ```bash
   pnpm -C apps/storefront test
   ```

3. カバレッジを評価:
   - **新規コード**: 80%+ カバレッジを要求
   - **既存テスト**: すべてパスする必要がある
   - **リグレッション**: 許可しない

4. 結果を評価:
   - **すべてパス**: 次のステップへ進む
   - **失敗あり**: 失敗を表示、修正を要求

5. 失敗時の対応:
   ```
   ✗ Tests failed:

   FAIL apps/api/src/routes/products.test.ts
     ● products › should filter by category
       Expected: 3
       Received: 0

   FAIL apps/api/src/services/inventory.test.ts
     ● inventory › should update stock
       TypeError: Cannot read property 'quantity' of undefined

   Coverage: 65% (target: 80%)

   Please fix these failures and add tests to improve coverage.
   ```

6. 修正後、再テスト:
   - ユーザーが修正を完了したら、再度testを実行
   - すべてのテストがパスし、カバレッジが80%+になるまで繰り返す

7. 成功時:
   ```
   ✓ API tests passed (127 tests)
   ✓ Storefront tests passed (43 tests)
   ✓ Coverage: 87% (target: 80%)

   Proceeding to Step 7: PR creation...
   ```

**スキップ条件**:
- NEVER（テストは必須）

**エラーハンドリング**:
- テストが存在しない: 警告、テスト作成を強く推奨
- pnpm test未定義: エラー表示、package.jsonを確認
- テストが無限ループ: タイムアウト、ユーザーに通知

---

### ステップ7: PR

**目的**: 包括的なPull Requestを作成

**実行内容**:

1. コミット履歴を分析:
   ```bash
   git log main..HEAD --oneline
   ```

2. 差分を分析:
   ```bash
   git diff main...HEAD --stat
   ```

3. PRタイトルを作成:
   - フォーマット: `feat: [description]`
   - 長さ制限: 70文字以内
   - 例: `feat: add product filtering to admin page`

4. PRボディを作成:
   ```markdown
   ## Summary
   - Added product filtering UI to admin page
   - Implemented filter by category, price range, and stock status
   - Added tests for all filter combinations

   ## Test plan
   - [ ] Navigate to /admin/products
   - [ ] Apply category filter, verify results
   - [ ] Apply price range filter, verify results
   - [ ] Apply stock status filter, verify results
   - [ ] Combine multiple filters, verify results
   - [ ] Clear filters, verify all products shown

   Closes #142

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```

5. PRを作成:
   ```bash
   gh pr create \
     --title "feat: add product filtering to admin page" \
     --body "[body content]"
   ```

6. PR URLをキャプチャして表示:
   ```
   ✓ Pull Request created: #143
   URL: https://github.com/user/repo/pull/143

   Next steps:
   - Review the PR
   - Wait for CI to pass
   - Request reviews from team
   - Merge when approved
   ```

7. Worktree cleanup guidance:
   ```
   After merging, clean up the worktree:
   git worktree remove ../kikaku-os-142
   ```

**スキップ条件**:
- ユーザーが "I'll create the PR manually" と明示

**エラーハンドリング**:
- GitHub CLI未認証: `gh auth login` を促す
- PR作成失敗: エラー表示、手動作成を提案
- コミットがpushされていない: 自動push or ユーザーにpushを促す

---

## 状態検知（ステートレス）

各ステップの前に、既に完了しているかをチェック:

### Worktree存在チェック
```bash
git worktree list | grep "kikaku-os-{number}"
```
- 存在する: Step 2をスキップ
- 存在しない: Step 2を実行

### Issue存在チェック
```bash
gh issue view {number} 2>/dev/null
```
- 存在する: Step 3をスキップ、Issue番号を使用
- 存在しない: Step 3を実行

### Branch存在チェック
```bash
git branch -a | grep "feat/issue-{number}"
```
- 存在する: Branchを使用
- 存在しない: Branchを作成

### Commits存在チェック
```bash
git log main..feat/issue-{number} --oneline
```
- コミットあり: Step 4をスキップ（実装済み）
- コミットなし: Step 4を実行

---

## エラーハンドリング

### Prerequisites Validation

各ステップの前に前提条件を検証:

- **Plan**: planner agentが利用可能か
- **Worktree**: Gitリポジトリか、競合するworktreeがないか
- **Issue**: GitHub CLI認証済みか（`gh auth status`）
- **Exec**: Worktreeが存在するか、Dev serverがすでに起動していないか
- **Typecheck**: pnpmがインストールされているか、package.jsonが存在するか
- **Test**: pnpmがインストールされているか、テストが存在するか
- **PR**: すべてのコミットがpushされているか、typecheck/testがパスしているか

### Error Messages

明確でアクションable なエラーメッセージを表示:

```
✗ Error: GitHub CLI not authenticated

To fix this issue:
1. Run: gh auth login
2. Follow the authentication flow
3. Retry this command

Would you like me to guide you through authentication?
```

### Retry Mechanism

エラーが修正可能な場合、リトライを提供:

- Typecheck errors: 修正後に再チェック
- Test failures: 修正後に再テスト
- GitHub authentication: 認証後に再試行

---

## ユーザー確認ポイント

以下のポイントでユーザー確認を取る:

1. **ワークフロー開始前**:
   ```
   I'll guide you through the feature workflow for: [description]
   This will involve 7 steps: Plan, Worktree, Issue, Exec, Typecheck, Test, PR.
   Proceed? (y/n)
   ```

2. **計画作成後**:
   ```
   Plan created at .claude/plans/feature-20260202.md
   [Plan summary]
   Approve and proceed to Step 2? (y/n)
   ```

3. **Worktreeクリーンアップ前**:
   ```
   Found old worktrees: X, Y, Z
   Remove them? (y/n)
   ```

4. **Typecheck成功後**:
   ```
   ✓ Typecheck passed
   Proceed to Step 6: Tests? (y/n)
   ```

5. **Test成功後**:
   ```
   ✓ Tests passed (87% coverage)
   Proceed to Step 7: PR creation? (y/n)
   ```

---

## 再開機能

中断したワークフローを再開:

### 使用例
```bash
/feature --resume 142
```

### 動作
1. Issue #142の存在を確認
2. Worktree `../kikaku-os-142` の存在を確認
3. Branch `feat/issue-142-*` の存在を確認
4. コミット履歴を確認
5. 完了済みステップをスキップ
6. 次のステップから再開

### 例
```
User: /feature --resume 142

Claude: Detected existing state for Issue #142:
✓ Worktree exists: ../kikaku-os-142
✓ Issue exists: #142
✓ Branch exists: feat/issue-142-product-filtering
✓ Implementation committed

Skipping Steps 1-4.
Starting Step 5: Typecheck...
```

---

## 完了後の表示

すべてのステップが完了したら、サマリーを表示:

```
✅ Feature Workflow Complete!

Summary:
- Plan: .claude/plans/feature-20260202-143022.md
- Issue: #142 (https://github.com/user/repo/issues/142)
- Worktree: ../kikaku-os-142
- Branch: feat/issue-142-product-filtering
- Commits: 5 commits
- PR: #143 (https://github.com/user/repo/pull/143)

Next Steps:
1. Review the PR on GitHub
2. Wait for CI checks to pass
3. Request reviews from team members
4. Merge when approved
5. Clean up worktree: git worktree remove ../kikaku-os-142

Great work! 🎉
```

---

## トラブルシューティング

### Port Already in Use

```
Error: Port 8788 already in use

Solution:
1. Check if another dev server is running: lsof -i :8788
2. Stop the conflicting process: kill <PID>
3. Or use a different port: --port 8789
```

### Worktree Already Exists

```
Error: Worktree already exists at ../kikaku-os-142

Solution:
1. Remove existing worktree: git worktree remove ../kikaku-os-142
2. Or use --resume flag to continue existing work
```

### GitHub CLI Not Authenticated

```
Error: gh: Not authenticated

Solution:
1. Run: gh auth login
2. Choose: GitHub.com
3. Choose: HTTPS
4. Authenticate via browser
5. Retry this command
```

---

## 関連コマンド

- `/create-issue` - Issueの作成のみ（Step 3）
- `/exec-issue [number]` - 実装のみ（Step 4）
- `/code-review` - コードレビューのみ
- `@planner` - 計画作成のみ（Step 1）

---

## カスタマイズ

### ステップをスキップ

ユーザーが明示的に指示した場合のみ:

```bash
# 計画をスキップ（非推奨）
/feature "quick feature" --skip-plan

# Worktreeをスキップ（既に存在する場合）
/feature "feature" --skip-worktree
```

**重要**: Typecheck と Test ステップは絶対にスキップしない。

### ポート番号のカスタマイズ

デフォルトはAPI=8788, Storefront=4322だが、衝突する場合は変更可能:

```bash
# exec-issue内で環境変数を設定
API_PORT=8789 STOREFRONT_PORT=4323 /feature "feature"
```

---

## ベストプラクティス

1. **計画は詳細に**: 実装前に時間をかけて計画を練る
2. **小さなPR**: 1つのPRで1つの機能、大きすぎる場合は分割
3. **テストファースト**: TDDアプローチに従う
4. **頻繁にコミット**: 小さな変更を頻繁にコミット
5. **定期的にクリーンアップ**: 古いworktreeを定期的に削除
6. **CI/CDを信頼**: ローカルのtypecheck/testがパスしてもCIを確認

---

## 参考資料

- `.claude/rules/feature-workflow.md` - ワークフロー強制ルール
- `.claude/commands/create-issue.md` - Issue作成コマンド
- `.claude/commands/exec-issue.md` - 実装コマンド
- `.claude/rules/git-workflow.md` - Git ワークフローガイドライン
- `CLAUDE.md` - プロジェクト全体のドキュメント
