<!-- .claude/commands/create-issue.md -->
## 目的
直前の議論・計画内容を元にGitHub Issueを作成する

## 使用タイミング
- Plan Modeで実装計画を立てた後
- 機能要件の議論が完了した後

## 手順
1. 直前の議論内容を確認
2. 曖昧な点があれば確認質問
3. 以下の形式でIssueを作成:
```bash
gh issue create \
  --title "feat: タイトル" \
  --label "enhancement" \
  --body "$(cat <<'EOF'
## 概要
（何を作るか）

## 背景
（なぜ必要か）

## 実装方針
（どう作るか）

### 対象ファイル
- `apps/storefront/src/pages/...`
- `apps/api/src/routes/...`

## 完了条件
- [ ] （議論で決まった具体的な条件）
- [ ] テスト通過
- [ ] ビルド成功

## 見積もり
約X時間
EOF
)"
```

4. 作成されたIssue番号とURLを表示

## kikaku-os固有ルール

### 変更箇所パターン
- ページ: `apps/storefront/src/pages/`
- API: `apps/api/src/routes/` + `index.ts`登録
- DB: `migrations/XXXX_説明.sql`
- 管理画面: `apps/storefront/src/pages/admin/`

### タイトルプレフィックス
- `feat:` 新機能
- `fix:` バグ修正
- `refactor:` リファクタ

## 入力
$ARGUMENTS をタイトルの参考にする
