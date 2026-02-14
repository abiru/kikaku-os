````md
# Repository Guidelines (Codex / Agent Rules)

## 🚨 Mandatory Rule: Worktree Enforcement（絶対遵守）

このリポジトリで Codex / 自動エージェントが作業する場合、  
**必ず `git worktree` 上で作業しなければならない。**

### ❌ 禁止事項
- リポジトリの通常 checkout（repo root）での編集・実装・テスト
- `main` / `master` / `develop` など共有ブランチでの直接作業
- worktree でないディレクトリでの `git commit` / `git push`

### ✅ 必須事項
- 作業開始前に **worktree の存在確認**を行うこと
- 作業ディレクトリは必ず `.worktrees/*` 配下であること
- **1タスク = 1 worktree / 1ブランチ** を原則とする

### 🔍 作業開始時チェック（必須）

作業開始時、**必ず以下を確認すること**：

```bash
pwd
git rev-parse --is-inside-work-tree
git worktree list
git status
````

以下の条件を **すべて満たさない場合は作業を中止すること**：

* `pwd` が `.worktrees/<task-name>` 配下である
* `git worktree list` に現在のディレクトリが表示される
* 現在のブランチが `codex/*` などタスク専用ブランチである
* `main` / `master` ではない

### 🛑 強制停止ルール

以下のいずれかを検知した場合、
**即座に作業を中止し、修正案のみを提示すること**：

* worktree ではないディレクトリで作業している
* 共有ブランチ（`main` / `master` / `develop`）にチェックアウトされている
* worktree の状態が不明確なまま作業を開始しようとしている

---

## Recommended Workflow（強制推奨）

### 1. Worktree 作成

```bash
git worktree add .worktrees/<task-name> -b codex/<task-name>
```

例：

```bash
git worktree add .worktrees/issue-4312 -b codex/issue-4312
```

### 2. Codex は worktree から起動

```bash
cd .worktrees/issue-4312
codex
```

> **注意**
> Codex は **worktree 外で起動してはならない**

---

## Project Structure & Module Organization

* `apps/api`: Cloudflare Workers + Hono API（TypeScript）
  Core code: `apps/api/src`
  構成: `routes/`, `services/`, `lib/`, `middleware/`, `__tests__/`

* `apps/storefront`: Astro SSR storefront / admin app
  Main code: `apps/storefront/src`
  構成: `components/`, `pages/`, `layouts/`, `lib/`, `styles/`

* `migrations/`, `apps/api/migrations/`: D1 schema / migration SQL

* `docs/`: deployment / operational runbooks

* `scripts/`: local / dev automation and smoke helpers

* `.github/workflows/`: CI / deployment pipelines（source of truth）

---

## Build, Test, and Development Commands

* `pnpm env:setup`: create local env files from templates
* `pnpm db:migrate`: apply local D1 migrations
* `pnpm dev`: run API（:8787）and storefront（:4321）
* `pnpm dev:api` / `pnpm dev:store`: run each app independently
* `pnpm build`: build both apps
* `pnpm test`: run API tests from repo root
* `pnpm -C apps/api test:coverage`: API coverage report
* `pnpm -C apps/storefront test`: storefront Vitest suite

---

## Coding Style & Naming Conventions

* Language: TypeScript / ESM
* Follow existing style in touched files（unrelated reformatting禁止）
* `camelCase`: functions / variables
* `PascalCase`: React / Astro components
* API responses must use shared helpers: `jsonOk`, `jsonError`
* Route handlers: `routes/*`
  Business logic: `services/*`

---

## Testing Guidelines

* Framework: Vitest
* API tests: `apps/api/src/__tests__/**/*.test.ts`
* Integration tests: `*.integration.test.ts`
* API coverage threshold: **50% enforced**
* Storefront tests: `src/**/*.test.ts`
* 振る舞い変更時は **必ずテストを追加・更新すること**

---

## Commit & Pull Request Guidelines

* Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`
* concise & imperative
* PR には以下を含めること：

  * 変更概要
  * 関連 Issue
  * 実行したテスト
  * UI 変更がある場合はスクリーンショット / GIF

---

## Security & Configuration

* Secrets を絶対にコミットしない
* `.env`, `.dev.vars` はローカル専用
* 本番環境では Wrangler / Cloudflare Secrets を使用
* Dev seed endpoint は `DEV_MODE=true` のみ

```
