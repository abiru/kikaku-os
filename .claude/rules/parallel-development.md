# Parallel Development with Worktrees (MANDATORY)

## Rule: One Terminal Tab Per Worktree

When working on multiple features or issues simultaneously, **ALWAYS** use separate terminal tabs for each worktree.

## Recommended Setup: Ghostty + Tabs

**シンプル、直感的、Claude Codeと相性抜群**

```bash
# Main worktree (Tab 1)
cd ~/Code/kikaku-os
/feature 142

# New tab (Tab 2) for the new worktree
cd ~/Code/kikaku-os-142
pnpm install
pnpm -C apps/api dev       # Port 8787
pnpm -C apps/storefront dev # Port 4321 (別タブで起動推奨)
```

**Why Ghostty + Tabs > tmux**:
- ✅ **通知がネイティブ動作** - Claude Codeのプロンプトで即座にalert
- ✅ **視認性が高い** - タブ名で作業内容が一目瞭然
- ✅ **シンプル** - セッション管理不要、学習コスト低
- ✅ **Claude Code相性◎** - インタラクティブ出力が見やすい

**Ghostty Tab Auto-Naming (推奨設定)**:

タブタイトルを自動設定して、どのタブで何をしているか一目瞭然に：

### 1. シェル設定に追加 (~/.zshrc or ~/.bashrc)

```bash
# Ghosttyタブタイトル自動設定
function set_tab_title() {
  echo -ne "\033]0;$1\007"
}

# ディレクトリ変更時にタブタイトルを自動更新
function auto_tab_title() {
  local current_dir=$(basename "$PWD")

  # worktreeディレクトリの場合
  if [[ "$current_dir" =~ kikaku-os-([0-9]+) ]]; then
    local issue_num="${BASH_REMATCH[1]}"

    # PR番号も取得できれば追加
    local pr_num=$(gh pr list --head "$(git branch --show-current)" --json number --jq '.[0].number' 2>/dev/null)

    if [[ -n "$pr_num" ]]; then
      set_tab_title "Issue #${issue_num} / PR #${pr_num}"
    else
      set_tab_title "Issue #${issue_num}"
    fi
  # メインworktreeの場合
  elif [[ "$current_dir" == "kikaku-os" ]]; then
    set_tab_title "Main ($(git branch --show-current))"
  else
    set_tab_title "$current_dir"
  fi
}

# zshの場合
if [[ -n "$ZSH_VERSION" ]]; then
  autoload -Uz add-zsh-hook
  add-zsh-hook chpwd auto_tab_title
  # 初回実行
  auto_tab_title
fi

# bashの場合
if [[ -n "$BASH_VERSION" ]]; then
  PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND; }auto_tab_title"
fi
```

### 2. Ghostty設定 (~/.config/ghostty/config)

```ini
# タブタイトルを常に表示
window-decoration = true
window-title-font-family = "monospace"

# シェルからのタイトル変更を許可
shell-integration = true
shell-integration-features = cursor,sudo,title
```

### 3. 使用例

```bash
# メインworktreeで作業
cd ~/Code/kikaku-os
# → タブタイトル: "Main (main)"

# Issue #142のworktreeで作業
cd ~/Code/kikaku-os-142
# → タブタイトル: "Issue #142"

# PR作成後
gh pr create ...
# → タブタイトル: "Issue #142 / PR #143"
```

### 4. さらに便利に: プロンプトカスタマイズ

プロンプトにもworktree情報を表示：

```bash
# ~/.zshrc
function worktree_info() {
  local current_dir=$(basename "$PWD")
  if [[ "$current_dir" =~ kikaku-os-([0-9]+) ]]; then
    echo "  #${BASH_REMATCH[1]}"
  elif [[ "$current_dir" == "kikaku-os" ]]; then
    echo "  main"
  fi
}

# プロンプトに追加（starship使用例）
# ~/.config/starship.toml
# [custom.worktree]
# command = "basename $PWD | grep -oP 'kikaku-os-\\K\\d+' || echo ''"
# when = "git rev-parse --is-inside-work-tree 2>/dev/null"
# format = " [$output]($style)"
# style = "bold yellow"
```

**メリット**:
- タブを切り替えただけで、どのissue/PRか分かる
- プロンプトでも確認可能
- 設定後は自動で動作、手動設定不要

## Core Principles

### 1. Main Worktree is Sacred

**メインworktree (`/home/user/Code/kikaku-os`) は常にmainブランチに保つ**

- ✅ **正しい**: メインworktreeでmainブランチ
- ❌ **間違い**: メインworktreeでfeatureブランチ

**Why**: 新しいworktreeはmainブランチから分岐する必要があるため。

### 2. One Worktree Per Issue/PR

各Issue/PRは専用のworktreeで作業：

```
/home/user/Code/kikaku-os           → main branch (メイン)
/home/user/Code/kikaku-os-142       → Issue #142
/home/user/Code/kikaku-os-155       → PR #155
/home/user/Code/kikaku-os-catalyst  → 別プロジェクト
```

### 3. One Terminal Tab Per Worktree

各worktreeは専用のターミナルタブで作業：

```
Terminal Tab 1: ~/Code/kikaku-os (main)           → 新しいissue作成用
Terminal Tab 2: ~/Code/kikaku-os-142 (issue-142)  → Issue #142の作業
Terminal Tab 3: ~/Code/kikaku-os-155 (PR-155)     → PR #155の作業
```

**Never**:
- mainでfeatureブランチに切り替え
- 1つのタブで複数のworktreeを切り替え

## Correct Workflow

### Starting New Feature

**メインworktreeで実行**（Terminal Tab 1）:

```bash
# 1. メインworktreeにいることを確認
pwd
# → /home/user/Code/kikaku-os

# 2. mainブランチにいることを確認
git branch --show-current
# → main

# 3. 最新に更新
git pull origin main

# 4. 新機能を開始
/feature "add product filtering"
# または既存issue
/feature 142
```

このコマンドが自動的に：
- 新しいworktreeを作成 (`../kikaku-os-142`)
- 専用ブランチを作成 (`feat/issue-142-product-filtering`)

### Working on Feature

**新しいターミナルタブを開く**（Terminal Tab 2）:

```bash
# 5. 新しいworktreeに移動
cd ~/Code/kikaku-os-142

# 6. 開発サーバーを起動（デフォルトポート使用）
pnpm -C apps/api dev       # Port 8787
pnpm -C apps/storefront dev # Port 4321

# 7. 実装、テスト、コミット
# ... 作業 ...

# 8. PR作成
gh pr create --title "feat: ..." --body "..."
```

### Working on Another Feature (Parallel)

**注意**: 同時に複数のAPIサーバーを起動できないため、現在のサーバーを停止してから次を起動：

```bash
# 現在のサーバーを停止（Tab 2で Ctrl+C）

# メインworktreeに戻る（Tab 1）
cd ~/Code/kikaku-os

# 別のissueを開始
/feature 155

# 新しいタブ（Tab 3）を開いて移動
cd ~/Code/kikaku-os-155
pnpm -C apps/api dev       # Port 8787
pnpm -C apps/storefront dev # Port 4321
```

### After Merge

**メインworktree（Tab 1）で実行**:

```bash
# 1. mainを更新
git pull origin main

# 2. 使い終わったworktreeを削除
git worktree remove ../kikaku-os-142

# 3. Tab 2を閉じる
```

## Common Mistakes & Fixes

### Mistake 1: メインworktreeでfeatureブランチ作業

```bash
# ❌ 間違い
cd ~/Code/kikaku-os
git checkout -b feat/new-feature
# ... 作業 ...
```

**問題**: 次の `/feature` コマンドがこのブランチから分岐してしまう。

**修正**:

```bash
# 1. 現在のブランチ名を確認
CURRENT_BRANCH=$(git branch --show-current)

# 2. worktreeに移動
git worktree add ../kikaku-os-temp $CURRENT_BRANCH
cd ../kikaku-os-temp

# 3. メインworktreeをmainに戻す
cd ~/Code/kikaku-os
git checkout main
```

### Mistake 2: 1つのタブで複数worktreeを切り替え

```bash
# ❌ 間違い
cd ~/Code/kikaku-os-142
# ... 作業 ...
cd ~/Code/kikaku-os-155
# ... 作業 ...
# → どのworktreeで何をしたか分からなくなる
```

**修正**:

```bash
# ✅ 正しい: 各worktreeに専用タブ
Terminal Tab 1: ~/Code/kikaku-os (main)
Terminal Tab 2: ~/Code/kikaku-os-142
Terminal Tab 3: ~/Code/kikaku-os-155
```

### Mistake 3: メインworktreeで開発サーバー起動

```bash
# ❌ 間違い
cd ~/Code/kikaku-os
pnpm -C apps/api dev
# → mainブランチで起動してしまう
```

**修正**:

```bash
# ✅ 正しい: worktreeで起動
cd ~/Code/kikaku-os-142
pnpm -C apps/api dev
pnpm -C apps/storefront dev
```

## Port Management

**重要**: Cloudflare Wranglerはカスタムポートをサポートしていません。

各worktreeは同じポートを使用しますが、**同時に複数のAPIサーバーを起動することはできません**：

| Worktree | API Port | Storefront Port | 注意 |
|----------|----------|-----------------|------|
| main | 8787 (default) | 4321 (default) | 通常は停止状態 |
| kikaku-os-142 | 8787 (default) | 4321 (default) | 作業中のみ起動 |
| kikaku-os-155 | 8787 (default) | 4321 (default) | 作業中のみ起動 |

**ベストプラクティス**:
1. メインworktreeのサーバーは常時停止しておく
2. 作業するworktreeでのみサーバーを起動
3. 別のworktreeに切り替える際は、現在のサーバーを停止してから新しいサーバーを起動

## Verification Checklist

Before running `/feature`:

- [ ] 現在のディレクトリ: `/home/user/Code/kikaku-os` (メインworktree)
- [ ] 現在のブランチ: `main`
- [ ] mainは最新: `git pull origin main`
- [ ] 他のworktreeは別タブで作業中

Before starting work in worktree:

- [ ] 新しいターミナルタブを開いた
- [ ] worktreeディレクトリに移動した
- [ ] 依存関係をインストールした: `pnpm install`
- [ ] 別ポートで開発サーバーを起動した

## Quick Reference

### List all worktrees
```bash
git worktree list
```

### Check current location
```bash
pwd && git branch --show-current
```

### Remove old worktree
```bash
git worktree remove ../kikaku-os-142
```

### Clean up all merged worktrees
```bash
git worktree list | grep -v "\[main\]" | awk '{print $1}' | xargs -I {} git worktree remove {}
```

## Benefits

1. **Conflict-Free**: 各worktreeは独立、競合なし
2. **Context Switching**: タブを切り替えるだけで別issueに切り替え
3. **Parallel Development**: 複数のissueを同時進行
4. **Clean Main**: mainブランチは常にクリーン
5. **Easy Cleanup**: マージ後にworktreeを削除するだけ

## Integration with /feature Command

`/feature` コマンドは自動的に：
- ✅ メインworktreeかチェック
- ✅ mainブランチかチェック
- ✅ 新しいworktreeを作成
- ✅ 別ポートを使用するよう指示

このルールに従えば、並列開発はスムーズに進みます。
