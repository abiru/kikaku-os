<!-- .claude/commands/plan-issue.md -->
## 目的
機能要件を議論し、GitHub Issueを作成する

## 手順
1. ユーザーと要件を議論（What/Why/How）
2. 関連コードを調査し、実装方針を決定
3. 以下の形式でIssueを作成:

```bash
gh issue create --title "feat: タイトル" --body "$(cat <<'EOF'
## 概要
（何を作るか）

## 背景
（なぜ必要か）

## 実装方針
（どう作るか - 対象ファイル、変更内容を具体的に）

### 対象ファイル
- `apps/storefront/src/pages/...`
- `apps/api/src/routes/...`
- `migrations/XXXX_....sql`

## 完了条件
- [ ] チェックリスト
- [ ] テスト通過
- [ ] ビルド成功
EOF
)"
```

4. Issue番号を表示

## kikaku-os実装パターン

### 新機能追加時の典型的な変更箇所
- **ページ追加**: `apps/storefront/src/pages/`
- **API追加**: `apps/api/src/routes/` + `index.ts`へのルート登録
- **DB変更**: `migrations/` に新規SQLファイル
- **管理画面**: `apps/storefront/src/pages/admin/`

### 命名規則
- ブランチ: `feat/issue-{番号}-{概要}`, `fix/issue-{番号}-{概要}`
- マイグレーション: `XXXX_{説明}.sql` (連番)
- コミット: Conventional Commits (`feat:`, `fix:`, `refactor:`)

## 入力
$ARGUMENTS に機能の概要を記載（例: `商品レビュー機能`）
