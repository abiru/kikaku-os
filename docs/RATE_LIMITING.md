# Rate Limiting

## 現状の実装

アプリケーション内にインメモリ（`Map`）ベースのレートリミッターを実装しています（`apps/api/src/middleware/rateLimit.ts`）。

### エンドポイント別制限

| エンドポイント | 上限 | ウィンドウ |
|---|---|---|
| `/payments/*` | 10 req | 60秒 |
| `/checkout/*` | 20 req | 60秒 |
| `/store/contact` | 5 req | 60秒 |
| `/store/newsletter/*` | 5 req | 60秒 |
| `/quotations`, `/quotations/*` | 10 req | 60秒 |
| `/ai/*` | 10 req | 60秒 |
| `*`（グローバル） | 120 req | 60秒 |

### 制限事項

**インメモリ方式はCloudflare Workers環境では不完全です。**

Cloudflare Workersはリクエストごとにisolateが起動する可能性があり、各isolateは独立したメモリ空間を持ちます。そのため：

- 同一IPからのリクエストが異なるisolateに振り分けられると、カウンターが共有されない
- Workers再起動時にカウンターがリセットされる
- 高トラフィック時にレート制限が正確に機能しない場合がある

現在の実装は「ベストエフォート」の防御層として機能しますが、厳密なレート制限には不十分です。

## 本番環境の推奨: Cloudflare WAF Rate Limiting Rules

本番環境では **Cloudflare WAF Rate Limiting Rules** の使用を強く推奨します。

### 設定手順

1. **Cloudflare Dashboard** にログイン
2. 対象ドメインを選択
3. **Security** > **WAF** > **Rate limiting rules** に移動
4. **Create rule** をクリック

### 推奨ルール設定

#### ルール1: API グローバル制限

- **Rule name**: `API Global Rate Limit`
- **If incoming requests match**: URI Path contains `/`
- **Rate**: 120 requests per 1 minute
- **With the same**: IP
- **Then**: Block for 60 seconds

#### ルール2: 決済エンドポイント制限

- **Rule name**: `Payment Endpoint Rate Limit`
- **If incoming requests match**: URI Path starts with `/payments/` OR URI Path starts with `/checkout/`
- **Rate**: 20 requests per 1 minute
- **With the same**: IP
- **Then**: Block for 120 seconds

#### ルール3: コンタクト/ニュースレター制限

- **Rule name**: `Contact Form Rate Limit`
- **If incoming requests match**: URI Path equals `/store/contact` OR URI Path starts with `/store/newsletter/`
- **Rate**: 5 requests per 1 minute
- **With the same**: IP
- **Then**: Block for 300 seconds

### メリット

- **エッジで処理**: Workerに到達する前にブロック（コスト削減）
- **分散環境対応**: isolate間で状態を共有する必要なし
- **DDoS防御**: Cloudflareのインフラで大規模攻撃に対応
- **設定変更が即時反映**: コードデプロイ不要

### 参考リンク

- [Cloudflare Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Cloudflare WAF documentation](https://developers.cloudflare.com/waf/)
