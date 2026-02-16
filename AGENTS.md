# AGENTS.md

このファイルを本リポジトリのエージェント運用の唯一の正本とする。  
`CLAUDE.md` は本ファイルへの symlink とし、内容の重複管理はしない。

## 0. 最重要ルール（Worktree 強制）

Codex / Cline / 自動エージェントによる編集・実装・テストは、原則 `git worktree` 上で行う。

### 禁止
- 通常 checkout（repo root）での編集・実装・テスト
- 共有ブランチ（`main` / `master` / `develop`）での直接作業
- worktree 以外での `git commit` / `git push`

### 必須
- 作業開始前に worktree と branch を検証する
- 作業ディレクトリは `.worktrees/*` 配下を使用する
- 1タスク = 1 worktree / 1ブランチを原則にする
- worktree が未作成の場合、エージェントが `git worktree add .worktrees/<task-name> -b codex/<task-name>` を実行して作成してから開始する

### 作業開始チェック（必須）
```bash
pwd
git rev-parse --is-inside-work-tree
git worktree list
git status -sb
```

以下をすべて満たさない場合、実装作業を停止し、修正案のみ提示すること。
- `pwd` が `.worktrees/<task-name>` 配下
- `git worktree list` に現在ディレクトリが存在
- 現在ブランチが `codex/*` または `feat/*` 等の専用ブランチ
- `main` / `master` / `develop` ではない

## 1. 推奨ワークフロー

### 手動で task worktree を作る場合
```bash
git worktree add .worktrees/<task-name> -b codex/<task-name>
cd .worktrees/<task-name>
```

例:
```bash
git worktree add .worktrees/issue-4312 -b codex/issue-4312
cd .worktrees/issue-4312
```

## 2. CLINE2.0 / Codex 対応方針

- どちらのエージェントでも、この `AGENTS.md` を最優先ルールとして扱う
- CLINE2.0 のカスタムワークフローは `.claude/` を参照する
  - Commands: `.claude/commands/`
  - Rules: `.claude/rules/`
  - Agents: `.claude/agents/`
  - Skills: `.claude/skills/`
- 迷った場合の優先順位:
  1. ユーザーの明示指示
  2. `AGENTS.md`
  3. `.claude/rules/*`
  4. 個別コマンド仕様（`.claude/commands/*`）

## 3. Skills 運用

### プロジェクト内 Skills（`.claude/skills/`）
- `daily-reports/`: 日次締め・証跡・仕訳ドラフト
- `inbox-pattern/`: AI出力の人間承認フロー
- `stripe-checkout/`: Stripe Embedded Checkout運用
- `tax-calculation/`: 日本の消費税計算
- `cloudflare-patterns.md`: Workers/D1/R2 の実装パターン

### 使用ルール
- タスクがドメインに一致する場合、対応 Skill を先に参照してから実装する
- 仕様が衝突する場合は、コード実装と `README.md` / `docs/` を正とする
- AI生成物は必ず人間承認前提（Inbox パターン）

## 4. プロジェクト構成

- `apps/api`: Cloudflare Workers + Hono API（TypeScript）
  - `src/routes`, `src/services`, `src/lib`, `src/middleware`, `src/__tests__`
- `apps/storefront`: Astro SSR（storefront/admin）
  - `src/components`, `src/pages`, `src/layouts`, `src/lib`, `src/styles`
- `migrations/`, `apps/api/migrations/`: D1 migration SQL
- `docs/`: 運用・デプロイ手順
- `scripts/`: 開発補助スクリプト
- `.github/workflows/`: CI/CD の source of truth

## 5. 開発コマンド

```bash
pnpm install
pnpm env:setup
pnpm db:migrate

pnpm dev
pnpm dev:api
pnpm dev:store

pnpm test
pnpm -C apps/api test:coverage
pnpm -C apps/storefront test
pnpm build

# DEV_MODE=true の時のみ
pnpm db:seed
```

## 6. コーディング規約

- 言語: TypeScript / ESM
- 既存スタイル準拠（無関係な整形変更をしない）
- 命名: `camelCase`（関数/変数）, `PascalCase`（コンポーネント）
- APIレスポンスは共有ヘルパー `jsonOk`, `jsonError` を使用
- ルーティングは `routes/*`、業務ロジックは `services/*` に分離

### 設計原則（重要）
1. Cloudflareスタック固定（Workers, D1, R2）
2. AIは信頼しない（必ず人間承認）
3. 財務データの正は Stripe（Webhook 同期）
4. 証跡を保存（R2 + D1監査ログ）

## 7. テスト方針

- Framework: Vitest
- API: `apps/api/src/__tests__/**/*.test.ts`
- Integration: `*.integration.test.ts`
- Storefront: `apps/storefront/src/**/*.test.ts`
- API coverage 50% 以上を維持
- 振る舞い変更時は必ずテスト追加/更新

## 8. コミット / PR

- Conventional Commits（`feat:`, `fix:`, `refactor:`, `test:`）
- PRに含める項目:
  - 変更概要
  - 関連 Issue
  - 実行したテスト
  - UI変更時のスクリーンショット/GIF

## 9. セキュリティ / 環境変数

- Secrets は絶対にコミットしない
- `.env`, `.dev.vars` はローカル専用
- 本番は Cloudflare Secrets / GitHub Secrets を使用
- 開発用 seed endpoint は `DEV_MODE=true` の時のみ有効

### Claude API + Cloudflare AI Gateway（任意）
- `CLAUDE_API_KEY`
- `AI_GATEWAY_ACCOUNT_ID`
- `AI_GATEWAY_ID`
- Gateway未設定時は直接API呼び出しにフォールバックする実装を維持する

## 10. 参照先

- プロジェクト概要: `README.md`
- デプロイ: `DEPLOYMENT.md`
- Featureコマンド詳細: `.claude/commands/feature.md`
- `.claude` 全体索引: `.claude/INDEX.md`
