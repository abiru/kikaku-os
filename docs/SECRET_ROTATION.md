# シークレットローテーション手順

本番環境で使用しているシークレット（API キー、Webhook シークレットなど）のローテーション手順をまとめたドキュメントです。

> シークレットの初期設定については [GITHUB_SECRETS.md](./GITHUB_SECRETS.md) を参照してください。

---

## 目次

1. [シークレット一覧](#シークレット一覧)
2. [ローテーション手順](#ローテーション手順)
3. [緊急対応フロー（シークレット漏洩時）](#緊急対応フローシークレット漏洩時)
4. [推奨ローテーションスケジュール](#推奨ローテーションスケジュール)

---

## シークレット一覧

| シークレット名 | 設定場所 | 用途 | 優先度 |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub Secrets | Workers / D1 / R2 デプロイ | CRITICAL |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secrets | Cloudflare アカウント識別 | CRITICAL |
| `ADMIN_API_KEY` | GitHub Secrets + Cloudflare Workers Secrets | 管理 API 認証（`x-admin-key` ヘッダー） | CRITICAL |
| `STRIPE_SECRET_KEY` | GitHub Secrets + Cloudflare Workers Secrets | Stripe サーバーサイド API | CRITICAL |
| `STRIPE_PUBLISHABLE_KEY` | GitHub Secrets + Cloudflare Workers Secrets | Stripe クライアントサイド API | HIGH |
| `STRIPE_WEBHOOK_SECRET` | GitHub Secrets + Cloudflare Workers Secrets | Stripe Webhook 署名検証 | HIGH |
| `CLERK_SECRET_KEY` | GitHub Secrets + Cloudflare Workers Secrets | Clerk 認証（サーバーサイド） | CRITICAL |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | GitHub Secrets | Clerk 認証（クライアントサイド） | HIGH |
| `RESEND_API_KEY` | GitHub Secrets + Cloudflare Workers Secrets | メール送信（Resend） | HIGH |
| `SLACK_WEBHOOK_URL` | GitHub Secrets + Cloudflare Workers Secrets | Slack 通知 | MEDIUM |
| `CLAUDE_API_KEY` | Cloudflare Workers Secrets | Claude API（AI 機能） | MEDIUM |
| `SENTRY_DSN` | Cloudflare Workers Secrets | Sentry エラー監視 | MEDIUM |
| `AI_GATEWAY_ACCOUNT_ID` | Cloudflare Workers Secrets | Cloudflare AI Gateway | LOW |
| `AI_GATEWAY_ID` | Cloudflare Workers Secrets | Cloudflare AI Gateway | LOW |

### 設定場所の説明

- **GitHub Secrets**: GitHub repo → Settings → Secrets and variables → Actions
  - CI/CD（deploy.yml）で使用
- **Cloudflare Workers Secrets**: `wrangler secret put` または deploy.yml の Configure secrets ステップで設定
  - Workers ランタイムで使用

> 多くのシークレットは **両方** に設定が必要です。GitHub Secrets はデプロイ時に Cloudflare Workers Secrets へ反映されます（deploy.yml の「Configure secrets」ステップ）。

---

## ローテーション手順

### 共通の前提

- ローテーション作業は **低トラフィック時間帯** に実施する
- ローテーション前に直近のバックアップを確認する
- 新しいキーの動作確認を行ってから古いキーを無効化する

### ADMIN_API_KEY

自己管理のキー。管理 API エンドポイント（`/admin/*`）の認証に使用。

```bash
# 1. 新しいキーを生成
openssl rand -base64 32

# 2. GitHub Secrets を更新
#    GitHub repo → Settings → Secrets → ADMIN_API_KEY → Update

# 3. Cloudflare Workers Secrets を即時更新
cd apps/api
echo "NEW_KEY_HERE" | wrangler secret put ADMIN_API_KEY --config ../../wrangler.toml

# 4. 動作確認
curl -H "x-admin-key: NEW_KEY_HERE" https://kikaku-os-api.workers.dev/admin/products

# 5. 管理画面等で旧キーを使用している箇所を新キーに変更
```

**注意**: Cloudflare Workers Secrets の更新は即座に反映されます。GitHub Secrets は次回デプロイ時に反映されるため、先に Workers Secrets を更新してください。

### STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY

Stripe ダッシュボードで管理。API キーのローテーションは Stripe の「Rolling Keys」機能を使用。

```bash
# 1. Stripe Dashboard → Developers → API Keys → Roll API Key
#    - 新しいキーが発行される（旧キーは 24 時間有効）

# 2. 新しい sk_live_* / pk_live_* をコピー

# 3. Cloudflare Workers Secrets を更新（即時反映）
echo "sk_live_NEW" | wrangler secret put STRIPE_SECRET_KEY --config ../../wrangler.toml
echo "pk_live_NEW" | wrangler secret put STRIPE_PUBLISHABLE_KEY --config ../../wrangler.toml

# 4. GitHub Secrets を更新
#    STRIPE_SECRET_KEY → 新しい sk_live_*
#    STRIPE_PUBLISHABLE_KEY → 新しい pk_live_*

# 5. 動作確認 - ヘルスチェック
curl -sf https://kikaku-os-api.workers.dev/health | jq

# 6. 動作確認 - 決済フロー（テスト環境でチェックアウトを実行）

# 7. 旧キーの有効期限切れを確認（24 時間後）
```

**注意**: Stripe の Rolling Keys 機能により、新旧両方のキーが一定期間有効です。この間に全システムを更新してください。

### STRIPE_WEBHOOK_SECRET

Stripe Webhook エンドポイントごとに固有の署名シークレット。

```bash
# 1. Stripe Dashboard → Developers → Webhooks
# 2. 対象のエンドポイントを選択
# 3. 「Signing secret」の「Reveal」をクリック → 「Roll secret」

# 4. 新しい whsec_* をコピー

# 5. Cloudflare Workers Secrets を更新（即時反映）
echo "whsec_NEW" | wrangler secret put STRIPE_WEBHOOK_SECRET --config ../../wrangler.toml

# 6. GitHub Secrets を更新
#    STRIPE_WEBHOOK_SECRET → 新しい whsec_*

# 7. 動作確認 - Stripe CLI でテストイベント送信
stripe trigger payment_intent.succeeded \
  --webhook-endpoint "https://kikaku-os-api.workers.dev/webhooks/stripe"

# 8. Stripe Dashboard → Webhooks → 配信履歴でステータス 200 を確認
```

**注意**: Webhook シークレットをロールすると、旧シークレットは即座に無効になります。Workers Secrets の更新を **先に** 行ってください。

### CLERK_SECRET_KEY / PUBLIC_CLERK_PUBLISHABLE_KEY

Clerk ダッシュボードで管理。

```bash
# 1. Clerk Dashboard → API Keys → Rotate Secret Key
#    - 新しいキーが発行される

# 2. 新しい sk_live_* / pk_live_* をコピー

# 3. Cloudflare Workers Secrets を更新（CLERK_SECRET_KEY のみ）
echo "sk_live_NEW" | wrangler secret put CLERK_SECRET_KEY --config ../../wrangler.toml

# 4. GitHub Secrets を更新
#    CLERK_SECRET_KEY → 新しい sk_live_*
#    PUBLIC_CLERK_PUBLISHABLE_KEY → 新しい pk_live_*

# 5. Storefront を再デプロイ（Publishable Key はビルド時に埋め込まれるため）
#    GitHub Actions → Deploy to Production → Run workflow

# 6. 動作確認 - 認証フロー
#    - ブラウザで Storefront にアクセスしログインが動作することを確認
#    - 管理画面へのアクセスを確認
```

**注意**: `PUBLIC_CLERK_PUBLISHABLE_KEY` は Storefront のビルド時に埋め込まれるため、**再デプロイが必要** です。

### CLOUDFLARE_API_TOKEN

Cloudflare ダッシュボードで管理。デプロイ（CI/CD）でのみ使用。

```bash
# 1. Cloudflare Dashboard → My Profile → API Tokens
# 2. 既存トークンの「Roll」をクリック、または新しいトークンを作成
#    - 必要な権限: Workers Scripts Edit, D1 Edit, R2 Edit, Workers Routes Edit

# 3. 新しいトークンをコピー

# 4. GitHub Secrets を更新
#    CLOUDFLARE_API_TOKEN → 新しいトークン

# 5. 動作確認 - 手動でデプロイを実行
#    GitHub Actions → Deploy to Production → Run workflow
#    デプロイが成功することを確認

# 6. 旧トークンを Cloudflare Dashboard で無効化
```

**注意**: Workers ランタイムでは使用されないため、Cloudflare Workers Secrets の更新は不要です。

### RESEND_API_KEY

Resend ダッシュボードで管理。

```bash
# 1. Resend Dashboard → API Keys → Create API Key
#    - Name: kikaku-os-production-YYYYMMDD
#    - Permission: Sending access

# 2. 新しい re_* をコピー

# 3. Cloudflare Workers Secrets を更新
echo "re_NEW" | wrangler secret put RESEND_API_KEY --config ../../wrangler.toml

# 4. GitHub Secrets を更新
#    RESEND_API_KEY → 新しい re_*

# 5. 動作確認 - テストメール送信
#    注文確認メール等のトリガーとなるアクションを実行し、メール配信を確認

# 6. 旧キーを Resend Dashboard で無効化
```

### SLACK_WEBHOOK_URL

Slack App 設定で管理。

```bash
# 1. Slack API → Apps → 対象 App → Incoming Webhooks
# 2. 既存の Webhook URL を「Remove」
# 3. 「Add New Webhook to Workspace」で新しい URL を生成
# 4. 新しい URL をコピー

# 5. Cloudflare Workers Secrets を更新
echo "https://hooks.slack.com/services/NEW" | wrangler secret put SLACK_WEBHOOK_URL --config ../../wrangler.toml

# 6. GitHub Secrets を更新
#    SLACK_WEBHOOK_URL → 新しい URL

# 7. 動作確認 - テスト通知
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Secret rotation test - please ignore"}' \
  "https://hooks.slack.com/services/NEW"
```

### CLAUDE_API_KEY

Anthropic Console で管理。

```bash
# 1. Anthropic Console → API Keys → Create Key
# 2. 新しい sk-ant-* をコピー

# 3. Cloudflare Workers Secrets を更新
echo "sk-ant-NEW" | wrangler secret put CLAUDE_API_KEY --config ../../wrangler.toml

# 4. 動作確認 - AI 機能が動作することを確認

# 5. 旧キーを Anthropic Console で無効化
```

---

## 緊急対応フロー（シークレット漏洩時）

### 漏洩が疑われる場合の即時対応

```
シークレット漏洩を検知
  ↓
1. 漏洩したシークレットを特定（1分以内）
  ↓
2. 該当シークレットを即座に無効化/ローテーション（5分以内）
  ↓
3. 影響範囲を調査（15分以内）
  ↓
4. 関連システムを更新・復旧（30分以内）
  ↓
5. インシデントレポートを作成
```

### Step 1: 即時無効化

漏洩の規模に関わらず、まず **漏洩したシークレットを無効化** します。

| シークレット | 無効化方法 |
|---|---|
| `ADMIN_API_KEY` | `wrangler secret put ADMIN_API_KEY` で新しい値に即座に更新 |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys → Roll API Key |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → Roll secret |
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys → Rotate |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard → API Tokens → Roll/Delete |
| `RESEND_API_KEY` | Resend Dashboard → API Keys → Delete + 新規作成 |
| `SLACK_WEBHOOK_URL` | Slack API → Apps → Webhooks → Remove |
| `CLAUDE_API_KEY` | Anthropic Console → API Keys → Delete + 新規作成 |

### Step 2: システム更新

```bash
# Cloudflare Workers Secrets を新しい値で更新
echo "NEW_VALUE" | wrangler secret put SECRET_NAME --config ../../wrangler.toml

# GitHub Secrets も更新（次回デプロイ用）
# GitHub repo → Settings → Secrets → 対象シークレット → Update
```

### Step 3: 影響調査

```bash
# Cloudflare Workers のログを確認（不正アクセスの痕跡）
wrangler tail kikaku-os-api --format pretty

# Stripe の場合: 不審な取引がないか確認
# Stripe Dashboard → Payments → 漏洩時刻以降の取引を確認

# Clerk の場合: 不審なユーザー操作がないか確認
# Clerk Dashboard → Users → 最近のアクティビティを確認
```

### Step 4: チームへの通知

```
INCIDENT: シークレット漏洩
対象: [シークレット名]
検知時刻: YYYY-MM-DD HH:MM JST
対応状況: シークレット無効化済み / システム更新済み
影響: [影響範囲]
次のアクション: [調査継続 / 完了]
```

### Step 5: Git リポジトリでの漏洩対応

シークレットが Git コミットに含まれてしまった場合:

```bash
# 1. 該当コミットを特定
git log --all --oneline | head -20

# 2. シークレットは即座にローテーション（上記手順に従う）

# 3. git-filter-repo でコミット履歴からシークレットを除去
#    (git filter-branch は非推奨)
pip install git-filter-repo
git filter-repo --replace-text <(echo "LEAKED_SECRET==>REDACTED")

# 4. 強制プッシュ（チーム全員に事前通知が必要）
git push --force-with-lease

# 5. 全メンバーにリポジトリの再クローンを依頼
```

**注意**: GitHub にプッシュされたシークレットは、コミット履歴から削除しても GitHub のキャッシュに残る可能性があります。GitHub Support に連絡してキャッシュの削除を依頼してください。

---

## 推奨ローテーションスケジュール

| シークレット | ローテーション頻度 | 理由 |
|---|---|---|
| `ADMIN_API_KEY` | 90 日ごと | 自己管理キー、定期ローテーション推奨 |
| `STRIPE_SECRET_KEY` | 180 日ごと | Stripe の推奨に準拠 |
| `STRIPE_PUBLISHABLE_KEY` | Secret Key と同時 | ペアで管理 |
| `STRIPE_WEBHOOK_SECRET` | 180 日ごと | Endpoint ごとに管理 |
| `CLERK_SECRET_KEY` | 90 日ごと | 認証キーは短い間隔を推奨 |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | Secret Key と同時 | ペアで管理（再デプロイ必要） |
| `CLOUDFLARE_API_TOKEN` | 180 日ごと | デプロイ用のみ |
| `RESEND_API_KEY` | 180 日ごと | メール送信用 |
| `SLACK_WEBHOOK_URL` | 365 日ごと | 通知用（低リスク） |
| `CLAUDE_API_KEY` | 180 日ごと | AI 機能用 |
| `SENTRY_DSN` | ローテーション不要 | DSN はプロジェクト識別子 |

### ローテーション管理のヒント

- カレンダーにリマインダーを設定する（次回ローテーション日）
- GitHub Issue でローテーションタスクを管理する
- ローテーション実施日と担当者を記録する

### ローテーション記録テンプレート

```markdown
## シークレットローテーション記録 - YYYY-MM-DD

- 対象: [シークレット名]
- 実施者: [名前]
- 手順: [上記手順に従って実施]
- 動作確認: [OK / NG]
- 次回ローテーション予定: YYYY-MM-DD
- 備考: [特記事項]
```

---

## 関連ドキュメント

- [GITHUB_SECRETS.md](./GITHUB_SECRETS.md) - シークレットの初期設定
- [ROLLBACK_PROCEDURES.md](./ROLLBACK_PROCEDURES.md) - ロールバック手順（シークレット復旧含む）
- [RELEASE_PROCEDURE.md](./RELEASE_PROCEDURE.md) - リリース手順（環境変数チェック含む）
