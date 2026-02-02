# Parallel Development with Worktrees (MANDATORY)

## Rule: One Terminal Tab Per Worktree

When working on multiple features or issues simultaneously, **ALWAYS** use separate terminal tabs for each worktree.

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

# 6. 開発サーバーを起動（別ポート）
pnpm dev:api --port 8788
pnpm dev:store --port 4322

# 7. 実装、テスト、コミット
# ... 作業 ...

# 8. PR作成
gh pr create --title "feat: ..." --body "..."
```

### Working on Another Feature (Parallel)

**さらに別のターミナルタブを開く**（Terminal Tab 3）:

```bash
# メインworktreeに戻る（Tab 1）
cd ~/Code/kikaku-os

# 別のissueを開始
/feature 155

# 新しいタブ（Tab 3）を開いて移動
cd ~/Code/kikaku-os-155
pnpm dev:api --port 8789  # 別ポート！
pnpm dev:store --port 4323
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
pnpm dev
# → mainブランチで起動してしまう
```

**修正**:

```bash
# ✅ 正しい: worktreeで起動
cd ~/Code/kikaku-os-142
pnpm dev:api --port 8788
pnpm dev:store --port 4322
```

## Port Management

各worktreeは異なるポートを使用：

| Worktree | API Port | Storefront Port |
|----------|----------|-----------------|
| main | 8787 | 4321 |
| kikaku-os-142 | 8788 | 4322 |
| kikaku-os-155 | 8789 | 4323 |
| kikaku-os-XXX | 8790+ | 4324+ |

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
