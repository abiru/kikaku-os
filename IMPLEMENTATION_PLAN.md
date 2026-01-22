# Implementation Plan - Led Kikaku OS

## 現状サマリー (2026-01-22時点)

| フェーズ | 項目 | 進捗 | 状態 |
|---------|------|------|------|
| P1-1 | D1スキーマ | 100% | ✅ 完了 |
| P1-2 | Stripe決済 | 100% | ✅ 完了（Stripe Elements移行済み） |
| P1-3 | Storefront | 100% | ✅ 完了（i18n・ページネーション対応） |
| P1-4 | Admin基本 | 100% | ✅ 完了（税率管理追加） |
| P1-5 | データ移行 | 100% | ✅ 完了（ドキュメント追加） |
| - | Test/CI | 100% | ✅ 完了（GitHub Actions導入済み） |
| - | 消費税対応 | 100% | ✅ 完了（税率マスタ・税込表示） |
| - | 銀行振込 | 100% | ✅ 完了（Stripe jp_bank_transfer） |

---

## Sprint 1: Phase 1 完了 ✅

### 1.1 Admin Variants/Prices 管理 ✅ 完了

**PR**: #7 (45614d8)

**実装済み**:
- [x] `GET /admin/products/:id/variants` - バリアント一覧取得
- [x] `POST /admin/products/:id/variants` - バリアント作成
- [x] `PUT /admin/products/:id/variants/:variantId` - バリアント更新
- [x] `DELETE /admin/products/:id/variants/:variantId` - バリアント削除
- [x] `PUT /admin/variants/:variantId/prices` - 価格更新
- [x] `/admin/products/[id].astro` にバリアント編集セクション追加
- [x] Stripe Price ID の紐付けUI（provider_price_id）
- [x] zodバリデーション適用済み

---

### 1.2 Inventory 管理 ✅ 完了

**PR**: #8 (b593dfc)

**実装済み**:
- [x] `GET /admin/inventory` - 在庫一覧（variant_id, on_hand, threshold）
- [x] `POST /admin/inventory/movements` - 在庫調整（入荷、出荷、棚卸）
- [x] `PUT /admin/inventory/thresholds/:variantId` - しきい値更新
- [x] `/admin/inventory.astro` - 在庫管理画面
- [x] 在庫不足アラートの表示（Inbox連携）

---

### 1.3 Fulfillment 管理 ✅ 完了

**PR**: e1d4188 (API), #12 (UI)

**実装済み**:
- [x] `PUT /admin/fulfillments/:id` - 発送ステータス更新
- [x] `POST /admin/orders/:orderId/fulfillments` - 発送作成
- [x] `/admin/orders/[id].astro` に発送セクション追加
- [x] トラッキング番号入力UI
- [x] pending → processing → shipped → delivered → cancelled の遷移

---

### 1.4 GitHub Actions CI ✅ 完了

**Commit**: 3c3af80

**実装済み**:
- [x] `.github/workflows/ci.yml` 作成
- [x] API テスト実行 (`pnpm -C apps/api test`)
- [x] TypeScript型チェック
- [x] Storefront ビルド確認

---

### 1.5 データ移行ドキュメント ✅ 完了

**Commit**: bc7d31f

**実装済み**:
- [x] `docs/migration-from-shopify.md` 作成
- [x] Shopifyエクスポート手順
- [x] `scripts/shopify-to-sql.js` の使い方
- [x] データ検証チェックリスト
- [x] ロールバック手順

---

## Sprint 2: 運用ハードニング ✅ 完了

### 2.1 Daily Close 冪等性 ✅ 完了

**PR**: #14 (be12c3d), #16 (2c22c0e)

**実装済み**:
- [x] `daily_close_runs` テーブルで実行履歴管理
- [x] `documents` テーブルで日付+タイプの重複チェック
- [x] 既存レポートがある場合はスキップ or 上書き選択
- [x] バックフィル用エンドポイント追加
- [x] 冪等性保証（同じ日付で再実行しても重複しない）

---

### 2.2 Inbox ルール拡張 ✅ 完了

**PR**: #13 (eca2f86)

**実装済み**:
- [x] 注文金額と支払い金額の不一致検知
- [x] 返金率が異常に高い期間の検知
- [x] Stripe Webhook処理失敗アラート
- [x] 未発送のまま一定期間経過した注文アラート
- [x] 拡張可能なルールエンジン

---

### 2.3 Stripe E2E 検証 ✅ 完了

**PR**: #9 (eae3822)

**実装済み**:
- [x] テストモードでの Checkout Session 作成確認
- [x] Webhook受信 → orders/payments更新確認
- [x] 返金処理の動作確認（部分返金対応）
- [x] E2Eテストインフラ整備

---

## Sprint 3: Phase 2 準備

### 3.1 Storefront Cart 改善 ✅ 完了

**PR**: #10, #11, #15

**実装済み**:
- [x] 商品詳細でバリアント選択UI
- [x] LocalStorageでカート保持（nanostores/persistent）
- [x] カート内容の確認画面 (`/cart`)
- [x] 数量変更機能
- [x] 複数商品の同時チェックアウト対応
- [x] チェックアウト成功画面で注文詳細表示

---

### 3.2 通知システム基盤 ✅ 完了

**Commit**: 107b2cc

**実装済み**:
- [x] Slack Webhook 通知チャネル実装
- [x] `notifications` テーブル（送信履歴管理）
- [x] Inbox warning/critical → Slack 通知トリガー
- [x] 環境変数 `SLACK_WEBHOOK_URL` で設定
- [x] テスト追加

---

### 3.3 Vectorize 調査 [優先度: 低]

**目的**: Phase 2の意味検索に向けた技術調査

**タスク**:
- [ ] Cloudflare Vectorize のドキュメント確認
- [ ] 商品/証跡のembedding方針検討
- [ ] POC実装

---

## 残タスク優先順位

```
優先度: 低
└── 3.3 Vectorize調査
```

---

## 技術的決定事項

### バリデーション
- 全ての更新系APIにzod適用
- `@hono/zod-validator` 使用
- エラーメッセージは日本語対応可能な形式

### テスト方針
- 新機能には必ずテスト追加
- Vitest + mock D1
- 統合テストは実際のD1 localを使用
- GitHub ActionsでPR時に自動テスト実行

### UI規約
- Tailwind + Apple Design Language
- 既存コンポーネント（Button, Badge, Container）を再利用
- SSRファーストでJSは最小限

### カート実装
- nanostores + @nanostores/persistent
- LocalStorageでブラウザ間永続化
- 複数商品対応のStripe Checkout

---

## 完了したPR一覧

| PR | タイトル | マージ日 |
|----|---------|---------|
| #7 | feat(admin): add variants and prices management | 完了 |
| #8 | feat(admin): add inventory management | 完了 |
| #9 | feat(stripe): add partial refund status and E2E test infrastructure | 完了 |
| #10 | feat(storefront): add cart functionality and improve checkout flow | 完了 |
| #11 | feat(storefront): add cart functionality and improve checkout flow | 完了 |
| #12 | feat(admin): add fulfillment management UI to order details | 完了 |
| #13 | feat(api): add extended inbox anomaly detection rules | 完了 |
| #14 | feat(api): add daily close execution tracking and backfill support | 完了 |
| #15 | feat(checkout): support multi-item cart checkout | 完了 |
| #16 | feat(api): add idempotency for daily close operations | 完了 |
| #83 | feat: Japanese consumption tax calculation system | 完了 |
| #91 | feat: Stripe bank transfer integration | 完了 |
| #94 | feat: Add i18n infrastructure and translate core UI to Japanese | 完了 |
| #97 | fix: complete Japanese translation for cart and checkout pages | 完了 |
| #98 | feat: Add pagination to storefront products listing | 完了 |
| #100 | fix: Bank transfer checkout requires email address | 完了 |
| #105 | feat: Migrate to Stripe Elements for embedded checkout | 完了 |

---

## Sprint 4: 決済・税・i18n ✅ 完了

### 4.1 消費税計算システム ✅ 完了

**PR**: #83

**実装済み**:
- [x] `tax_rates` マスタテーブル（標準10%・軽減8%）
- [x] 商品への税率紐付け
- [x] 注文の税額内訳保存
- [x] `services/tax.ts` で切り捨て丸め計算
- [x] 管理画面: 税率CRUD `/admin/tax-rates`
- [x] ストアフロント: 税込表示・カート内訳

---

### 4.2 Stripe Elements移行 ✅ 完了

**PR**: #105

**実装済み**:
- [x] Checkout SessionからPaymentIntent APIへ移行
- [x] 埋め込み型チェックアウト（`/checkout`ページ）
- [x] CheckoutForm.tsx / CheckoutPage.tsx コンポーネント
- [x] `STRIPE_PUBLISHABLE_KEY` 環境変数追加
- [x] 支払い確認フローの改善

---

### 4.3 銀行振込対応 ✅ 完了

**PR**: #91, #100

**実装済み**:
- [x] `ENABLE_BANK_TRANSFER` フィーチャーフラグ
- [x] Stripe jp_bank_transfer設定
- [x] Stripe Customer管理（`stripe_customer_id`）
- [x] 決済方法の動的検出
- [x] 銀行振込用Webhookハンドラー

---

### 4.4 i18n基盤 ✅ 完了

**PR**: #94, #97

**実装済み**:
- [x] `src/i18n/ja.json` 翻訳ファイル
- [x] `t()` ヘルパー関数（パラメータ置換対応）
- [x] Layout, Cart, SearchModal, Products の日本語化
- [x] チェックアウト画面の日本語化

---

### 4.5 ページネーション ✅ 完了

**PR**: #98

**実装済み**:
- [x] ストアフロント商品一覧のページネーション
- [x] API側の `limit`/`offset` パラメータ対応

---

## 次のアクション

Phase 1 完了、Sprint 2-4 完了。次のステップ候補:

1. **本番デプロイ準備** - Cloudflare にデプロイして実運用テスト
2. **Vectorize 調査** - AI意味検索のためのPOC (3.3)
3. **追加通知チャネル** - Email (Resend)、汎用 Webhook 対応
4. **管理画面i18n** - Admin画面の日本語化
