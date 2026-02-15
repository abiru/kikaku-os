# リリース手順書

本番環境へのリリース時に従うべき手順をまとめたドキュメントです。

> 初回デプロイの詳細は [DEPLOYMENT.md](../DEPLOYMENT.md) を参照してください。
> 本ドキュメントは初回セットアップ完了後の**通常リリース**を対象としています。

## 概要

```
1. プリデプロイチェック
2. デプロイ実行
3. ポストデプロイ検証
4. 監視（24時間）
5. 問題発生時 → ロールバック
```

---

## 1. プリデプロイチェック

リリース前に以下をすべて確認してください。

### 1.1 コード品質

```bash
# 型チェック（API + Storefront）
pnpm -C apps/api typecheck
pnpm -C apps/storefront exec astro check

# テスト実行（カバレッジ付き）
pnpm -C apps/api test:coverage

# インテグレーションテスト
pnpm -C apps/api test:integration

# ビルド確認
pnpm build
```

**すべてパスすることを確認してから次へ進む。**

### 1.2 CI/CD ステータス

- [ ] `main` ブランチの CI が全ステップ通過（GitHub Actions → CI ワークフロー）
- [ ] PR がマージ済み（直接 `main` へのプッシュは避ける）

### 1.3 マイグレーション確認

新しいマイグレーションがある場合：

```bash
# ローカルで適用テスト
pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local

# マイグレーション一覧の確認
ls apps/api/migrations/
```

- [ ] マイグレーションが破壊的変更を含まないか確認
- [ ] ロールバック用の逆マイグレーションを準備（必要に応じて）

### 1.4 環境変数・シークレット

- [ ] 新しい環境変数が追加された場合、GitHub Secrets に設定済み
- [ ] `wrangler.toml` の `[vars]` に新しい公開変数を追加済み
- [ ] `DEV_MODE` が `"false"` であること

> シークレットの詳細は [docs/GITHUB_SECRETS.md](./GITHUB_SECRETS.md) を参照

### 1.5 最終チェックリスト

- [ ] コード品質チェックすべてパス
- [ ] CI グリーン
- [ ] マイグレーション確認済み
- [ ] 環境変数・シークレット設定済み
- [ ] リリースノート / PR の内容を確認

---

## 2. デプロイ実行

### 2.1 自動デプロイ（推奨）

`main` ブランチへのプッシュで CI 通過後、自動的にデプロイが実行されます。

```bash
# PRマージ後、自動でデプロイが開始される
# GitHub Actions → "Deploy to Production" ワークフローを監視
```

**デプロイワークフローの流れ**:

1. 設定の検証（`validate-config`）
2. API ビルド（`build-api`）
3. Storefront ビルド（`build-storefront`）
4. D1 マイグレーション適用 → API デプロイ → シークレット設定（`deploy-api`）
5. Storefront デプロイ（`deploy-storefront`）
6. スモークテスト（`smoke-test`）

### 2.2 手動デプロイ

GitHub Actions から手動実行する場合：

1. GitHub → Actions → "Deploy to Production"
2. "Run workflow" をクリック
3. ブランチが `main` であることを確認
4. "Run workflow" で実行

### 2.3 CLI から直接デプロイ（緊急時のみ）

```bash
# API
pnpm -C apps/api exec wrangler deploy --config ../../wrangler.toml

# Storefront
pnpm -C apps/storefront build
pnpm -C apps/storefront exec wrangler pages deploy dist --project-name=kikaku-storefront
```

> CLI 直接デプロイは CI を経由しないため、通常は避けてください。

---

## 3. ポストデプロイ検証

### 3.1 自動スモークテスト

デプロイワークフロー内でスモークテストが自動実行されます。
手動で再実行する場合：

```bash
export API_URL="https://kikaku-os-api.workers.dev"       # または本番ドメイン
export STOREFRONT_URL="https://kikaku-storefront.pages.dev"  # または本番ドメイン
./scripts/smoke-test-prod.sh
```

**スモークテストの検証項目**:
- API ヘルスチェック（DB, R2, Secrets）
- Storefront 読み込み
- ストアエンドポイント（商品一覧、フィルター）
- 認証保護（401 レスポンス確認）
- チェックアウト・決済エンドポイント（500 でないこと）
- Webhook エンドポイント
- Cron ハンドラ

### 3.2 手動確認

自動テストでカバーできない項目を手動で確認：

```bash
# ヘルスチェック
curl -sf "$API_URL/health" | jq

# 商品一覧
curl -sf "$API_URL/store/products" | jq '.ok'

# 管理API（認証付き）
curl -H "x-admin-key: YOUR_ADMIN_KEY" "$API_URL/admin/products" | jq '.ok'
```

**ブラウザ確認**:
- [ ] Storefront トップページ表示
- [ ] 商品一覧・詳細ページ表示
- [ ] 管理画面ログイン
- [ ] 決済フロー（テストカード `4242 4242 4242 4242` で確認）

> 完全な検証チェックリストは [docs/VERIFICATION_CHECKLIST.md](./VERIFICATION_CHECKLIST.md) を参照

### 3.3 Stripe Webhook 確認

```bash
# Stripe CLIでテストイベント送信
stripe trigger payment_intent.succeeded \
  --webhook-endpoint "$API_URL/webhooks/stripe"
```

- [ ] Stripe Dashboard → Developers → Webhooks でイベント配信成功を確認

> 詳細は [docs/STRIPE_WEBHOOK_SETUP.md](./STRIPE_WEBHOOK_SETUP.md) を参照

---

## 4. 監視

### 4.1 デプロイ直後（30分間）

- [ ] エラーレートが上昇していないこと（Cloudflare Analytics）
- [ ] ヘルスチェックが安定して `ok` を返すこと
- [ ] ログに異常がないこと

```bash
# リアルタイムログ監視
wrangler tail kikaku-os-api --format pretty
```

### 4.2 24時間監視

- [ ] Daily Close Cron（16:00 UTC）が正常に実行されること
- [ ] エラーレート < 1%
- [ ] レスポンスタイム正常（ヘルスチェック < 200ms）
- [ ] Slack アラートが発報されていないこと（設定済みの場合）

### 4.3 メトリクス確認先

- **Cloudflare Analytics**: Dashboard → Workers & Pages → kikaku-os-api → Analytics
- **Stripe Dashboard**: Payments → 最新取引の確認
- **Sentry**（設定済みの場合）: エラー・パフォーマンス監視

---

## 5. ロールバック

問題が発生した場合のロールバック手順です。

### ロールバック判断基準

| 状況 | 対応 |
|------|------|
| エラーレート > 5% | 即時ロールバック |
| ヘルスチェック失敗 | 即時ロールバック |
| 決済・認証機能の障害 | 即時ロールバック |
| データ不整合 | 即時ロールバック |
| 軽微な不具合（15分以内に修正可能） | Fix Forward（修正してデプロイ） |

### クイックロールバック（API）

```bash
# 1. デプロイ一覧を確認
wrangler deployments list --name kikaku-os-api

# 2. 前のバージョンにロールバック
wrangler rollback --name kikaku-os-api --deployment-id <PREVIOUS_ID>

# 3. 復旧確認
curl -sf "$API_URL/health" | jq
```

### Storefront ロールバック

Cloudflare Dashboard → Pages → kikaku-storefront → Deployments → 前のデプロイの "..." → "Rollback to this deployment"

> 詳細なロールバック手順（DB ロールバック・シークレット復旧・インシデント対応フロー含む）は [docs/ROLLBACK_PROCEDURES.md](./ROLLBACK_PROCEDURES.md) を参照

---

## 6. 緊急連絡先

### 内部

| 役割 | 担当 | 連絡先 |
|------|------|--------|
| プライマリ担当 | _____ | _____ |
| セカンダリ担当 | _____ | _____ |

### 外部サービス

| サービス | サポート |
|----------|----------|
| Cloudflare | https://dash.cloudflare.com/support |
| Stripe | https://support.stripe.com/ |
| Clerk | https://clerk.com/support |

---

## 付録: リリースチェックリスト（コピー用）

リリース作業時にコピーして使用してください。

```markdown
## リリースチェックリスト - YYYY-MM-DD

### プリデプロイ
- [ ] 型チェック通過
- [ ] テスト通過（カバレッジ含む）
- [ ] インテグレーションテスト通過
- [ ] ビルド成功
- [ ] CI グリーン
- [ ] マイグレーション確認（該当する場合）
- [ ] 環境変数・シークレット設定（該当する場合）

### デプロイ
- [ ] デプロイワークフロー正常完了
- [ ] スモークテスト通過

### ポストデプロイ
- [ ] ヘルスチェック OK
- [ ] Storefront 表示確認
- [ ] 管理画面アクセス確認
- [ ] 決済フロー確認（テストカード）
- [ ] Stripe Webhook 配信確認

### 監視
- [ ] エラーレート正常（< 1%）
- [ ] 30分間の安定稼働確認
- [ ] Daily Close Cron 正常実行（翌日確認）

### 完了
- デプロイ担当: _____
- コミット: _____
- 備考: _____
```

---

## 関連ドキュメント

- [DEPLOYMENT.md](../DEPLOYMENT.md) - 初回デプロイガイド（インフラ構築含む）
- [docs/VERIFICATION_CHECKLIST.md](./VERIFICATION_CHECKLIST.md) - 詳細な検証チェックリスト
- [docs/ROLLBACK_PROCEDURES.md](./ROLLBACK_PROCEDURES.md) - ロールバック手順・インシデント対応
- [docs/GITHUB_SECRETS.md](./GITHUB_SECRETS.md) - シークレット設定
- [docs/STRIPE_WEBHOOK_SETUP.md](./STRIPE_WEBHOOK_SETUP.md) - Stripe Webhook 設定
- [docs/CUSTOM_DOMAIN_SETUP.md](./CUSTOM_DOMAIN_SETUP.md) - カスタムドメイン設定
