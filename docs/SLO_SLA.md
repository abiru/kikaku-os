# SLO / SLA 定義と監視

本ドキュメントでは、kikaku-os の Service Level Objectives（SLO）および監視・アラートの運用方針を定義します。

---

## 目次

1. [SLO 定義](#slo-定義)
2. [計測方法](#計測方法)
3. [アラートルール](#アラートルール)
4. [ダッシュボード構築手順](#ダッシュボード構築手順)
5. [エスカレーション手順](#エスカレーション手順)
6. [エラーバジェット](#エラーバジェット)

---

## SLO 定義

### 対象サービス

| サービス | 種別 | URL |
|---|---|---|
| kikaku-os-api | Cloudflare Workers | `https://kikaku-os-api.workers.dev` (またはカスタムドメイン) |
| kikaku-storefront | Cloudflare Pages | `https://kikaku-storefront.pages.dev` (またはカスタムドメイン) |

### SLO 一覧

| SLO | 目標値 | 計測期間 | 対象 |
|---|---|---|---|
| **可用性 (Availability)** | 99.9% | 30 日間ローリング | API + Storefront |
| **レイテンシ P95** | < 500ms | 30 日間ローリング | API レスポンスタイム |
| **レイテンシ P99** | < 2,000ms | 30 日間ローリング | API レスポンスタイム |
| **エラーレート** | < 1% | 24 時間 | API 5xx レスポンス |
| **デプロイ成功率** | > 95% | 30 日間 | CI/CD パイプライン |

### SLO 詳細

#### 可用性 (Availability): 99.9%

- **定義**: ヘルスチェックエンドポイント (`/health`) が HTTP 200 を返すこと
- **許容ダウンタイム**: 月間約 43 分
- **除外事項**:
  - Cloudflare プラットフォーム自体の障害
  - 計画メンテナンス（事前通知済み）
  - 外部サービス（Stripe, Clerk）の障害

#### レイテンシ P95: < 500ms

- **定義**: API リクエストの 95 パーセンタイルのレスポンスタイムが 500ms 未満
- **対象エンドポイント**:
  - `GET /store/products` (商品一覧)
  - `GET /store/products/:id` (商品詳細)
  - `GET /health` (ヘルスチェック)
  - `POST /checkout/session` (チェックアウト)
- **除外**:
  - Webhook 処理 (`/webhooks/stripe`)
  - バッチ処理（Cron）
  - 管理 API の大量データ取得

#### レイテンシ P99: < 2,000ms

- **定義**: API リクエストの 99 パーセンタイルのレスポンスタイムが 2 秒未満
- **対象**: P95 と同じエンドポイント
- **補足**: コールドスタートを含む

#### エラーレート: < 1%

- **定義**: 全 API リクエストに対する 5xx レスポンスの割合が 1% 未満
- **計算式**: `(5xx responses / total responses) * 100`
- **除外**:
  - 4xx レスポンス（クライアントエラー）
  - 意図的な 401/403 レスポンス

---

## 計測方法

### 1. Cloudflare Analytics (推奨・メイン)

Cloudflare Workers に組み込みの分析機能を活用します。

**アクセス方法**:
1. Cloudflare Dashboard にログイン
2. Workers & Pages を選択
3. `kikaku-os-api` を選択
4. 「Analytics」タブを開く

**取得できるメトリクス**:

| メトリクス | SLO 対応 |
|---|---|
| Requests (成功/エラー) | 可用性, エラーレート |
| Request Duration (P50, P75, P99) | レイテンシ |
| CPU Time | パフォーマンス監視 |
| Errors by status code | エラーレート |

**`[observability]` の有効化** (`wrangler.toml`):

```toml
[observability]
enabled = true
```

これにより、Workers Analytics Engine によるリクエスト単位の詳細ログが有効になります。

### 2. Sentry (エラー監視)

Sentry を設定済みの場合、アプリケーションレベルのエラー監視が可能です。

**設定**:
- `SENTRY_DSN` を Cloudflare Workers Secrets に設定
- `@sentry/cloudflare` + Hono インテグレーションを使用

**取得できるメトリクス**:

| メトリクス | SLO 対応 |
|---|---|
| Error count / rate | エラーレート |
| Transaction duration | レイテンシ |
| Crash-free sessions | 可用性 |

**Sentry Dashboard でのアラート設定**:
1. Sentry Dashboard → Alerts → Create Alert
2. 条件例:
   - Error rate > 1% for 5 minutes → Warning
   - Error rate > 5% for 5 minutes → Critical

### 3. カスタムヘルスチェック監視

外部監視サービスから `/health` エンドポイントを定期的にチェックします。

**推奨サービス** (無料枠あり):
- [Uptime Robot](https://uptimerobot.com/) - 5 分間隔の無料監視
- [Cloudflare Health Checks](https://developers.cloudflare.com/health-checks/) - Cloudflare 統合

**設定手順 (Uptime Robot)**:
1. アカウント作成
2. 「Add New Monitor」→ HTTP(s)
3. URL: `https://kikaku-os-api.workers.dev/health`
4. 監視間隔: 5 分
5. アラート通知先: メール / Slack

**`/health` エンドポイントのレスポンス**:

```json
{
  "status": "ok",
  "database": "ok",
  "r2": "ok",
  "secrets": "ok"
}
```

いずれかが `"ok"` でない場合、サービス障害と判定します。

### 4. GitHub Actions デプロイメトリクス

deploy.yml ワークフローの成功/失敗率からデプロイ成功率を計測します。

```bash
# 直近 30 日のデプロイ成功率を確認
gh run list --workflow=deploy.yml --limit=30 --json conclusion \
  --jq '[.[] | select(.conclusion == "success")] | length as $s | [.[] | select(.conclusion != "")] | length as $t | "\($s)/\($t) = \($s * 100 / $t)%"'
```

---

## アラートルール

### アラートレベル

| レベル | 条件 | 対応 |
|---|---|---|
| **CRITICAL** | SLO 違反 or サービスダウン | 即時対応（15 分以内） |
| **WARNING** | SLO 接近（バジェット 50% 消費） | 当日中に調査 |
| **INFO** | 軽微な異常検知 | 次営業日に確認 |

### アラート条件

| アラート | レベル | 条件 | 通知先 |
|---|---|---|---|
| API ダウン | CRITICAL | `/health` が 2 回連続失敗 | Slack + メール |
| 高エラーレート | CRITICAL | 5xx > 5% (5 分間) | Slack + メール |
| エラーレート上昇 | WARNING | 5xx > 1% (15 分間) | Slack |
| レイテンシ P95 超過 | WARNING | P95 > 500ms (15 分間) | Slack |
| レイテンシ P99 超過 | CRITICAL | P99 > 2,000ms (5 分間) | Slack + メール |
| デプロイ失敗 | WARNING | deploy.yml 失敗 | GitHub 通知 |
| ロールバック発生 | CRITICAL | 自動ロールバック実行 | Slack + GitHub |

### Slack 通知設定

`SLACK_WEBHOOK_URL` を設定している場合、以下の通知が自動送信されます:

- **deploy.yml**: デプロイ失敗時・ロールバック時
- **Daily Close Cron**: 日次締め処理の失敗時

追加のアラートを設定する場合は、Sentry または外部監視サービスから Slack チャンネルへの連携を設定してください。

---

## ダッシュボード構築手順

### Cloudflare Analytics ダッシュボード

Cloudflare Dashboard に組み込みのダッシュボードを活用します。

**確認手順**:
1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 左メニュー → Workers & Pages
3. `kikaku-os-api` を選択
4. 「Metrics」タブ

**確認すべきパネル**:

| パネル | SLO 対応 | 確認ポイント |
|---|---|---|
| Requests | 可用性 | 総リクエスト数とエラー数の推移 |
| Errors | エラーレート | 5xx の発生頻度 |
| Request Duration | レイテンシ | P50, P75, P99 の推移 |
| CPU Time | パフォーマンス | Workers CPU 使用量 |

### Sentry ダッシュボード (設定済みの場合)

1. [Sentry Dashboard](https://sentry.io/) にログイン
2. プロジェクトを選択
3. 「Performance」タブ → Transaction 一覧

**カスタムダッシュボード作成**:
1. Dashboards → Create Dashboard
2. 追加するウィジェット:
   - Error Rate Over Time (折れ線グラフ)
   - Transaction Duration P95 (折れ線グラフ)
   - Most Common Errors (テーブル)
   - Affected Users (数値)

### 簡易監視スクリプト

手動で SLO 状況を確認するためのスクリプト:

```bash
#!/bin/bash
# scripts/check-slo.sh
API_URL="${API_URL:-https://kikaku-os-api.workers.dev}"

echo "=== SLO Status Check ==="
echo "Date: $(date -u +"%Y-%m-%d %H:%M UTC")"
echo ""

# 可用性チェック
echo "-- Availability --"
HEALTH=$(curl -sf -w "\n%{http_code}\n%{time_total}" "$API_URL/health" 2>/dev/null)
HTTP_CODE=$(echo "$HEALTH" | tail -1 | head -1)
RESPONSE_TIME=$(echo "$HEALTH" | tail -1)

if echo "$HEALTH" | head -1 | jq -e '.database == "ok"' > /dev/null 2>&1; then
  echo "Health: OK"
else
  echo "Health: DEGRADED"
fi

# レイテンシチェック (簡易)
echo ""
echo "-- Latency (single request) --"
for endpoint in "/health" "/store/products" "/store/products/filters"; do
  TIME=$(curl -sf -o /dev/null -w "%{time_total}" "$API_URL$endpoint" 2>/dev/null)
  TIME_MS=$(echo "$TIME * 1000" | bc 2>/dev/null || echo "N/A")
  echo "$endpoint: ${TIME_MS}ms"
done

# エラーレートチェック (最近のデプロイ)
echo ""
echo "-- Recent Deploys --"
gh run list --workflow=deploy.yml --limit=5 --json conclusion,startedAt \
  --jq '.[] | "\(.startedAt) - \(.conclusion)"' 2>/dev/null || echo "gh CLI not available"
```

---

## エスカレーション手順

### Tier 1: 自動対応 (0-5 分)

自動化された対応:
- デプロイ後のスモークテスト失敗 → 自動ロールバック（deploy.yml）
- Slack / GitHub への自動通知

### Tier 2: 一次対応 (5-15 分)

担当者による初期対応:

1. **アラート確認**: Slack 通知 / Sentry アラートを確認
2. **影響範囲の特定**:
   ```bash
   # ヘルスチェック
   curl -sf https://kikaku-os-api.workers.dev/health | jq

   # リアルタイムログ
   wrangler tail kikaku-os-api --format pretty
   ```
3. **判断**: ロールバックが必要か、Fix Forward が可能か
4. **対応実行**: ロールバックまたはホットフィックス

> 詳細なロールバック手順は [ROLLBACK_PROCEDURES.md](./ROLLBACK_PROCEDURES.md) を参照

### Tier 3: エスカレーション (15 分以上)

一次対応で解決しない場合:

1. チームメンバーへのエスカレーション
2. 外部サービス障害の場合:
   - Cloudflare: https://www.cloudflarestatus.com/
   - Stripe: https://status.stripe.com/
   - Clerk: https://status.clerk.com/
3. インシデントレポートの作成を開始

---

## エラーバジェット

### エラーバジェットの考え方

SLO 99.9% の場合、30 日間で許容されるダウンタイム:

```
30 日 * 24 時間 * 60 分 = 43,200 分
43,200 * (1 - 0.999) = 43.2 分 / 月
```

| SLO | 月間エラーバジェット | 日次換算 |
|---|---|---|
| 99.9% 可用性 | 43 分 | 約 1.4 分/日 |
| 1% エラーレート | リクエスト数の 1% | - |
| P95 500ms | リクエストの 5% が超過可能 | - |

### エラーバジェットの消費状況確認

Cloudflare Analytics で以下を確認:

1. 過去 30 日間のエラー率
2. ダウンタイム（ヘルスチェック失敗期間）
3. レイテンシ P95/P99 の推移

### エラーバジェット消費時のアクション

| 消費率 | 状態 | アクション |
|---|---|---|
| 0-50% | 正常 | 通常運用 |
| 50-75% | 注意 | 新機能デプロイを慎重に（テスト強化） |
| 75-90% | 警戒 | リスクの高いデプロイを延期 |
| 90-100% | 危険 | 新機能デプロイを凍結、信頼性改善に集中 |
| 100%+ | 超過 | インシデント対応、根本原因の解決が最優先 |

---

## 定期レビュー

### 週次レビュー

- Cloudflare Analytics で週次メトリクスを確認
- エラーバジェットの消費状況を確認
- アラート発報履歴を確認

### 月次レビュー

- SLO 達成率の算出と記録
- エラーバジェットのリセット
- SLO 目標値の見直し（必要に応じて）
- インシデントの振り返り

### SLO レビュー記録テンプレート

```markdown
## SLO レビュー - YYYY-MM

### 達成状況

| SLO | 目標 | 実績 | 達成 |
|---|---|---|---|
| 可用性 | 99.9% | __% | OK/NG |
| P95 レイテンシ | < 500ms | __ms | OK/NG |
| P99 レイテンシ | < 2,000ms | __ms | OK/NG |
| エラーレート | < 1% | __% | OK/NG |
| デプロイ成功率 | > 95% | __% | OK/NG |

### エラーバジェット

- 消費量: __分 / 43分
- 消費率: __%

### インシデント

- [日時] [概要] [影響時間]

### 改善アクション

- [ ] [アクション項目]

### 次月の目標調整

- 変更なし / [変更内容]
```

---

## 関連ドキュメント

- [ROLLBACK_PROCEDURES.md](./ROLLBACK_PROCEDURES.md) - ロールバック手順・インシデント対応
- [RELEASE_PROCEDURE.md](./RELEASE_PROCEDURE.md) - リリース手順（監視チェック含む）
- [GITHUB_SECRETS.md](./GITHUB_SECRETS.md) - 監視関連シークレット（SENTRY_DSN, SLACK_WEBHOOK_URL）
