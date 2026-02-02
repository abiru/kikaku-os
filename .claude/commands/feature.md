<!-- .claude/commands/feature.md -->

## 目的

新機能開発の完全ワークフローを実行する統合コマンド。
7ステップのワークフローを自動化し、各ステップでユーザー確認を取りながら進みます。

## ⚠️ 重要: コマンド実行方針

**このコマンドを実行する際、Claude（あなた）は必ず以下を守ってください:**

1. **Bash toolを使って実際にコマンドを実行する**
   - 単なる指示やドキュメントを提供するだけではダメ
   - `git`, `pnpm`, `gh`, `tmux` などのコマンドを実際に実行する

2. **各コマンドの成功を確認してから次に進む**
   - 実行結果をチェックする
   - エラーが発生したら適切に対処する

3. **tmux automation**
   - tmuxセッション内であれば、自動的にウィンドウを作成し開発サーバーを起動する
   - tmuxを使用していない場合は、ユーザーに手動での起動を指示する

**❌ やってはいけないこと:**
- "以下のコマンドを実行してください" とユーザーに指示するだけ
- bash scriptファイルを作成してユーザーに実行させる
- 実行せずに次のステップに進む

**✅ やるべきこと:**
- Bash toolで実際にコマンドを実行
- 実行結果を確認して次のステップへ
- エラーが出たら原因を調べて修正

## 使用方法

```bash
# 新機能開発を開始（フルワークフロー）
/feature "product filtering for admin page"

# 既存issueから作業開始（簡潔な形式）
/feature 142

# 既存issueから再開（明示的な形式）
/feature --resume 142
```

## 引数

- `$ARGUMENTS` が文字列 → 新機能の説明（フルワークフロー）
- `$ARGUMENTS` が数字のみ → Issue番号（Plan/Issueスキップ、Execから開始）
- `--resume [number]` → Issue番号を明示的に指定（数字のみと同じ動作）

## ワークフロー概要

1. **Plan** - planner agentで実装計画作成 → ユーザー確認
2. **Worktree** - git worktree作成（クリーンアップ含む） → ユーザー確認
3. **Issue** - GitHub Issue作成
4. **Exec** - 実装（TDD + code review）
5. **Typecheck** - 型チェック（エラー時は自動修正試行）
6. **Test** - テスト実行（失敗時は自動修正試行）
7. **PR** - Pull Request作成 → ユーザー確認

## 前提条件チェック（必須）

**このコマンドを実行する前に、必ず以下をチェックしてください：**

### 1. メインworktreeで実行されているか

```bash
# 現在のディレクトリを確認
pwd

# メインworktreeのパスは通常: /home/user/Code/kikaku-os
# サブworktreeのパスは: /home/user/Code/kikaku-os-{number}
```

**もしサブworktree（例: kikaku-os-155）で実行しようとしている場合：**

```
❌ エラー: このコマンドはメインworktreeからのみ実行できます

現在: /home/user/Code/kikaku-os-155 (サブworktree)
必要: /home/user/Code/kikaku-os (メインworktree)

解決方法:
1. 新しいターミナルタブを開く
2. メインディレクトリに移動: cd /home/user/Code/kikaku-os
3. このコマンドを再実行

または、既存のworktreeで作業を続けたい場合:
cd /home/user/Code/kikaku-os-155
# 通常の開発フローに従ってください
```

### 2. mainブランチにいるか

```bash
# 現在のブランチを確認
git branch --show-current
# 出力: main （これが正しい）
```

**もしmainブランチでない場合：**

```
❌ エラー: このコマンドはmainブランチからのみ実行できます

現在のブランチ: feat/some-feature
必要なブランチ: main

解決方法:
git checkout main
git pull origin main

その後、このコマンドを再実行してください。
```

### 3. mainブランチが最新か

```bash
# リモートから最新を取得
git fetch origin
git pull origin main
```

### チェックスクリプト

以下のコマンドですべてをチェック：

```bash
# 前提条件を自動チェック
CURRENT_DIR=$(pwd)
CURRENT_BRANCH=$(git branch --show-current)
MAIN_WORKTREE=$(git worktree list | grep "\[main\]" | awk '{print $1}')

if [[ "$CURRENT_DIR" != "$MAIN_WORKTREE" ]]; then
  echo "❌ エラー: メインworktreeで実行してください"
  echo "現在: $CURRENT_DIR"
  echo "必要: $MAIN_WORKTREE"
  exit 1
fi

if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "❌ エラー: mainブランチで実行してください"
  echo "現在: $CURRENT_BRANCH"
  exit 1
fi

echo "✅ 前提条件OK: /feature コマンドを実行できます"
```

---

## 引数処理

**前提条件チェックに合格した後**、`$ARGUMENTS` を解析して動作モードを決定します：

### 新機能開発モード
```bash
/feature "add product filtering"
```
- `$ARGUMENTS` が文字列（非数字）
- フルワークフロー（Step 1-7）を実行
- Plan作成 → Worktree作成 → Issue作成 → Exec → Typecheck → Test → PR

### 既存Issue作業モード
```bash
/feature 142
# または
/feature --resume 142
```
- `$ARGUMENTS` が数字のみ、または `--resume [number]`
- Issue #142が既に存在することを確認
- Plan/Issueスキップ、Step 2（Worktree）から開始
- Worktree作成 → Exec → Typecheck → Test → PR

**検知ロジック**:
```javascript
if ($ARGUMENTS.match(/^\d+$/)) {
  // 数字のみ → 既存Issue作業モード
  issueNumber = $ARGUMENTS
  skipPlan = true
  skipIssue = true
} else if ($ARGUMENTS.startsWith("--resume ")) {
  // --resume フラグ → 既存Issue作業モード
  issueNumber = $ARGUMENTS.split(" ")[1]
  skipPlan = true
  skipIssue = true
} else {
  // 文字列 → 新機能開発モード
  description = $ARGUMENTS
  skipPlan = false
  skipIssue = false
}
```

## 実行フロー

### ステップ1: Plan

**スキップ条件**: Issue番号が指定された場合（`/feature 142`）はこのステップをスキップ

1. planner agentを起動:
   ```
   @planner <description>
   ```

2. 計画を `.claude/plans/feature-{timestamp}.md` に保存

3. **ユーザー確認**:
   ```
   Plan created. Review at .claude/plans/feature-20260202.md

   Proceed to Step 2: Worktree creation? (y/n)
   ```

### ステップ2: Worktree Cleanup & Create

**重要**: このステップではBash toolを使って実際にコマンドを実行してください。

1. **既存worktreeをチェック** - Bash toolで実行:
   ```bash
   git worktree list
   ```

2. 古いworktreeを特定（7日以上 or マージ済み）し、削除が必要な場合はユーザー確認を取る

3. **Worktreeを作成** - Bash toolで実行:
   ```bash
   # リモートから最新を取得
   git fetch origin

   # Worktreeを作成（実際のnumberとslugに置き換える）
   git worktree add ../kikaku-os-{number} -b feat/issue-{number}-{slug}
   ```

4. **依存関係をインストール** - Bash toolで実行:
   ```bash
   cd ../kikaku-os-{number} && pnpm install
   ```

5. **tmuxウィンドウを自動作成して開発サーバーを起動** - Bash toolで実行:

   まずtmuxセッションの有無をチェック:
   ```bash
   if [[ -n "$TMUX" ]]; then echo "tmux"; else echo "no-tmux"; fi
   ```

   **tmuxセッション内の場合**、以下のコマンドを**実際に実行**:
   ```bash
   # 新しいウィンドウを作成（実際のnumberに置き換える）
   tmux new-window -c "$HOME/Code/kikaku-os-{number}" -n "issue-{number}"

   # 左ペイン: APIサーバー
   tmux select-pane -t "issue-{number}.0" -T "API"
   tmux send-keys -t "issue-{number}" "cd $HOME/Code/kikaku-os-{number} && pnpm -C apps/api dev" Enter

   # ウィンドウを水平分割
   tmux split-window -h -c "$HOME/Code/kikaku-os-{number}" -t "issue-{number}"

   # 右ペイン: Storefrontサーバー
   tmux select-pane -t "issue-{number}.1" -T "Storefront"
   tmux send-keys -t "issue-{number}.1" "pnpm -C apps/storefront dev" Enter
   ```

   成功したらユーザーに通知:
   ```
   ✅ tmux window 'issue-{number}' created with dev servers running
      - API: http://localhost:8787 (left pane)
      - Storefront: http://localhost:4321 (right pane)
      Switch to it with: Ctrl+b w
   ```

   **tmuxを使用していない場合**、ユーザーに指示を表示:
   ```
   ⚠️ Next: Open New Terminal Tab

   You need to open a new terminal tab for this worktree.

   In your new terminal tab, run:

   cd ~/Code/kikaku-os-{number}
   pnpm -C apps/api dev

   Then in another split/tab:
   cd ~/Code/kikaku-os-{number}
   pnpm -C apps/storefront dev
   ```

**注意事項**:
- Wranglerは `--port` フラグをサポートしていないため、デフォルトポートを使用
- API: 8787 (Wrangler default)
- Storefront: 4321 (Astro default)
- メインworktreeのサーバーと競合する場合は、メインのサーバーを停止してから起動

### ステップ3: Issue

**スキップ条件**: Issue番号が指定された場合（`/feature 142`）はこのステップをスキップ。指定されたIssueが存在することを確認。

1. `create-issue` コマンドを使用してGitHub Issueを作成

2. Issue番号をキャプチャ（例: #142）

### ステップ4: Exec

**重要**: 実装中は常にBash toolを使ってコマンドを実行してください。

1. **exec-issue コマンドを起動**:
   ```
   /exec-issue {number}
   ```
   このコマンドが自動的に実装を開始します

2. 実装完了後、**code-reviewerを自動起動**

3. CRITICAL/HIGH issuesがあればブロック、修正を要求

4. **変更をコミット** - Bash toolで実行:
   ```bash
   cd ~/Code/kikaku-os-{number}
   git add .
   git commit -m "$(cat <<'EOF'
   feat: [description]

   [details]

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   EOF
   )"
   ```

### ステップ5: Typecheck（自動修正機能付き）

**重要**: Bash toolを使って実際にコマンドを実行してください。

1. **型チェック実行** - Bash toolで実行:
   ```bash
   cd ~/Code/kikaku-os-{number}
   pnpm -C apps/api typecheck
   ```

   続いて:
   ```bash
   cd ~/Code/kikaku-os-{number}
   pnpm -C apps/storefront exec astro check
   ```

2. **エラーがある場合**:

   a. エラーを表示

   b. **自動修正を試行**:
   ```
   Found 3 typecheck errors. Attempting auto-fix...

   Analyzing errors...
   - Type 'string' is not assignable to type 'number' (apps/api/src/routes/products.ts:45)
   - Property 'price' does not exist on type 'Product' (apps/storefront/src/pages/admin/products.astro:23)

   Applying fixes...
   ```

   c. 修正後、再チェック

   d. **自動修正が失敗した場合**:
   ```
   ✗ Auto-fix failed for some errors. Manual fix required:

   [Remaining errors...]

   Please fix these errors manually. I'll wait for your confirmation.
   ```

   e. ユーザーが修正完了したら再チェック

3. **エラーがない場合**: 次のステップへ自動進行

### ステップ6: Test（自動修正機能付き）

**重要**: Bash toolを使って実際にコマンドを実行してください。

1. **テスト実行** - Bash toolで実行:
   ```bash
   cd ~/Code/kikaku-os-{number}
   pnpm -C apps/api test
   ```

   Storefrontのテストがある場合:
   ```bash
   cd ~/Code/kikaku-os-{number}
   pnpm -C apps/storefront test
   ```

2. **失敗がある場合**:

   a. 失敗を表示

   b. **自動修正を試行**:
   ```
   Found 2 test failures. Attempting auto-fix...

   Analyzing failures...
   - products › should filter by category (Expected: 3, Received: 0)
   - inventory › should update stock (TypeError: Cannot read property 'quantity')

   Applying fixes...
   ```

   c. 修正後、再テスト

   d. **自動修正が失敗した場合**:
   ```
   ✗ Auto-fix failed for some tests. Manual fix required:

   [Remaining failures...]

   Please fix these tests manually. I'll wait for your confirmation.
   ```

   e. ユーザーが修正完了したら再テスト

3. **カバレッジチェック**:
   - 新規コード: 80%+ 必須
   - 不足している場合: テスト追加を促す（自動生成試行可能）

4. **すべてパス**: 次のステップへ自動進行

### ステップ7: PR

**重要**: Bash toolを使って実際にコマンドを実行してください。

1. **コミット履歴を分析** - Bash toolで実行:
   ```bash
   cd ~/Code/kikaku-os-{number}
   git log main..HEAD
   ```

   続いて差分統計を確認:
   ```bash
   cd ~/Code/kikaku-os-{number}
   git diff main...HEAD --stat
   ```

2. **PRを作成** - Bash toolで実行:
   ```bash
   cd ~/Code/kikaku-os-{number}
   gh pr create --title "feat: [description]" --body "$(cat <<'EOF'
   ## Summary
   - [bullet point 1]
   - [bullet point 2]

   ## Test plan
   - [ ] [test item 1]
   - [ ] [test item 2]

   Closes #{issue-number}

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```

3. **tmux window名を自動更新** - Bash toolで実行:

   PR作成後、tmuxセッション内であればwindow名を更新:
   ```bash
   # PR番号を取得
   PR_NUMBER=$(gh pr list --head $(git branch --show-current) --json number --jq '.[0].number')
   ISSUE_NUMBER=$(git branch --show-current | grep -oP 'issue-\K\d+')

   # tmuxセッション内であれば、window名を更新
   if [[ -n "$TMUX" ]]; then
     tmux rename-window "issue-${ISSUE_NUMBER} PR-${PR_NUMBER}"
     echo "✓ tmux window renamed to: issue-${ISSUE_NUMBER} PR-${PR_NUMBER}"
   fi
   ```

4. **PRのURLを表示**:
   PRが作成されたら、ユーザーにURLを報告:
   ```
   ✓ Pull Request created: #143
   ✓ tmux window renamed to: issue-142 PR-143
   URL: https://github.com/user/repo/pull/143

   Next steps:
   - Review the PR
   - Wait for CI to pass
   - Request reviews
   - Merge when approved

   Clean up worktree after merge:
   git worktree remove ../kikaku-os-{number}
   ```

## 自動修正機能の詳細

### Typecheck自動修正

**対応可能なエラー**:
- 型アノテーション不足: `let x = ...` → `let x: Type = ...`
- null/undefined チェック不足: `obj.prop` → `obj?.prop` or `if (obj) { obj.prop }`
- 型キャスト不足: `value` → `value as Type`
- インポート不足: 自動でimport文追加

**対応できないエラー**:
- 複雑な型推論エラー
- 構造的な設計ミス
- 外部ライブラリの型定義不足

### Test自動修正

**対応可能なエラー**:
- 簡単なアサーションミス: 期待値の調整
- モック不足: モック追加
- 非同期処理のタイミング: `await` 追加、`waitFor` 使用

**対応できないエラー**:
- ロジックのバグ
- 複雑なテストシナリオの設計ミス
- 外部依存の問題

### 自動修正の制限

- **試行回数**: 最大3回まで
- **タイムアウト**: 各試行5分まで
- **安全性**: 既存のテストを壊さない範囲で修正
- **フォールバック**: 失敗したらユーザーに確認を求める

## エラーハンドリング

### Git関連エラー

```
✗ Error: Worktree already exists at ../kikaku-os-142

Solution:
1. Remove: git worktree remove ../kikaku-os-142
2. Or resume: /feature --resume 142
```

### GitHub関連エラー

```
✗ Error: gh: Not authenticated

Solution:
1. Run: gh auth login
2. Retry this command
```

### ビルド関連エラー

```
✗ Error: pnpm install failed

Solution:
1. Check error log above
2. Fix package.json if needed
3. Retry: pnpm install
```

## 状態検知（ステートレス）

各ステップの前に自動検知:

- **Worktree存在**: `git worktree list | grep kikaku-os-{number}`
- **Issue存在**: `gh issue view {number}`
- **Branch存在**: `git branch -a | grep feat/issue-{number}`
- **コミット存在**: `git log main..feat/issue-{number}`

完了済みステップは自動スキップ。

## 再開機能

```bash
/feature --resume 142
```

**動作**:
1. Issue #142の存在を確認
2. Worktree/Branch/コミットを確認
3. 完了済みステップをスキップ
4. 次のステップから再開

**例**:
```
User: /feature --resume 142

Claude: Detected existing state:
✓ Worktree: ../kikaku-os-142
✓ Issue: #142
✓ Implementation committed

Skipping Steps 1-4.
Starting Step 5: Typecheck...
```

## 完了後の表示

```
✅ Feature Workflow Complete!

Summary:
- Plan: .claude/plans/feature-20260202.md
- Issue: #142
- Worktree: ../kikaku-os-142
- Branch: feat/issue-142-product-filtering
- Commits: 5
- PR: #143

Next Steps:
1. Review PR on GitHub
2. Wait for CI checks
3. Request reviews
4. Merge when approved
5. Clean up: git worktree remove ../kikaku-os-142
```

## ユーザー確認ポイント

以下のポイントでユーザー確認を取ります:

1. **計画承認後**: "Proceed to Step 2?"
2. **Worktreeクリーンアップ**: "Remove old worktrees?"
3. **PR作成前**: 自動作成（確認は不要、URLを表示）

**エラー時のみ確認**:
- Typecheck自動修正失敗
- Test自動修正失敗
- その他のエラー

## トラブルシューティング

### ポート使用中

```
Error: Port 8788 already in use

Solution:
lsof -i :8788
kill <PID>
```

### 自動修正が遅い

```
Auto-fix is taking too long...

You can:
1. Wait (max 5 minutes per attempt)
2. Ctrl+C to cancel and fix manually
```

## 関連コマンド

- `/create-issue` - Issue作成のみ
- `/exec-issue [number]` - 実装のみ
- `/code-review` - コードレビューのみ

## カスタマイズ

### 自動修正を無効化

```bash
/feature "feature" --no-auto-fix
```

### 特定のステップをスキップ

```bash
/feature "feature" --skip-plan --skip-worktree
```

**注意**: Typecheck/Testはスキップ不可。

## ベストプラクティス

1. **計画に時間をかける**: 実装前に十分な計画を
2. **小さなPR**: 大きすぎる場合は分割
3. **TDD**: テストファーストで実装
4. **頻繁にコミット**: 小さな変更を頻繁に
5. **定期的にクリーンアップ**: 古いworktreeを削除

## パフォーマンス

- **Plan**: 1-3分（planner agent）
- **Worktree作成**: 1-2分（pnpm install含む）
- **Issue作成**: 5-10秒
- **Exec**: 実装内容による（10分-数時間）
- **Typecheck**: 30秒-2分
- **Test**: 1-5分
- **PR作成**: 10-20秒

**合計**: 小規模機能で15-30分、中規模で1-3時間

## 参考資料

- `.claude/rules/feature-workflow.md` - ワークフロー強制ルール
- `.claude/commands/create-issue.md` - Issue作成
- `.claude/commands/exec-issue.md` - 実装
- `.claude/rules/git-workflow.md` - Git ワークフロー
- `CLAUDE.md` - プロジェクト全体のドキュメント
