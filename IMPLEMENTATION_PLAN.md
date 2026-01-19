# Implementation Plan - Led Kikaku OS

## 現状サマリー (2026-01-19時点)

| フェーズ | 項目 | 進捗 | 状態 |
|---------|------|------|------|
| P1-1 | D1スキーマ | 100% | ✅ 完了 |
| P1-2 | Stripe決済 | 95% | ✅ ほぼ完了（実E2E検証待ち） |
| P1-3 | Storefront | 100% | ✅ 完了（基本機能） |
| P1-4 | Admin基本 | 85% | ⚠️ Variants/Inventory UIなし |
| P1-5 | データ移行 | 60% | ⚠️ ツールあり、ドキュメントなし |
| - | Test/CI | 50% | ⚠️ ローカルテストのみ、CIなし |

---

## Sprint 1: Phase 1 完了 (1-2週間)

### 1.1 Admin Variants/Prices 管理 [優先度: 高]

**目的**: 商品のバリエーション（サイズ、色など）と価格を管理できるようにする

**タスク**:
- [ ] `GET /admin/products/:id/variants` - バリアント一覧取得
- [ ] `POST /admin/products/:id/variants` - バリアント作成
- [ ] `PUT /admin/products/:id/variants/:variantId` - バリアント更新
- [ ] `DELETE /admin/products/:id/variants/:variantId` - バリアント削除
- [ ] `PUT /admin/variants/:variantId/prices` - 価格更新
- [ ] `/admin/products/[id].astro` にバリアント編集セクション追加
- [ ] Stripe Price ID の紐付けUI（provider_price_id）

**スキーマ（既存）**:
```sql
variants: id, product_id, title, sku, options, metadata
prices: id, variant_id, currency, amount, provider_price_id
```

**受け入れ条件**:
- 商品詳細画面でバリアントのCRUDが可能
- 価格とStripe Price IDが設定できる
- zodバリデーション適用済み

---

### 1.2 Inventory 管理 [優先度: 高]

**目的**: 在庫数の確認・調整ができるようにする

**タスク**:
- [ ] `GET /admin/inventory` - 在庫一覧（variant_id, on_hand, threshold）
- [ ] `POST /admin/inventory/movements` - 在庫調整（入荷、出荷、棚卸）
- [ ] `PUT /admin/inventory/thresholds/:variantId` - しきい値更新
- [ ] `/admin/inventory.astro` - 在庫管理画面
- [ ] 在庫不足アラートの表示

**計算ロジック**:
```sql
SELECT variant_id, COALESCE(SUM(delta), 0) as on_hand
FROM inventory_movements
GROUP BY variant_id
```

**受け入れ条件**:
- 全バリアントの現在庫を一覧表示
- 入荷/出荷/調整の記録が可能
- しきい値を下回るとInboxに警告

---

### 1.3 Fulfillment 管理 [優先度: 中]

**目的**: 注文の発送状況を管理できるようにする

**タスク**:
- [ ] `PUT /admin/fulfillments/:id` - 発送ステータス更新
- [ ] `POST /admin/orders/:orderId/fulfillments` - 発送作成
- [ ] `/admin/orders/[id].astro` に発送セクション追加
- [ ] トラッキング番号入力UI

**受け入れ条件**:
- 注文詳細から発送ステータスを更新可能
- pending → shipped → delivered の遷移

---

### 1.4 GitHub Actions CI [優先度: 高]

**目的**: PRマージ前にテストを自動実行

**タスク**:
- [ ] `.github/workflows/ci.yml` 作成
- [ ] API テスト実行 (`pnpm -C apps/api test`)
- [ ] TypeScript型チェック (`tsc --noEmit`)
- [ ] Storefront ビルド確認 (`pnpm -C apps/storefront build`)

**ワークフロー例**:
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm -C apps/api test
      - run: pnpm -C apps/storefront build
```

---

### 1.5 データ移行ドキュメント [優先度: 中]

**目的**: Shopifyからの移行手順を明文化

**タスク**:
- [ ] `docs/migration-from-shopify.md` 作成
- [ ] Shopifyエクスポート手順
- [ ] `scripts/shopify-to-sql.js` の使い方
- [ ] データ検証チェックリスト
- [ ] ロールバック手順

---

## Sprint 2: 運用ハードニング (1週間)

### 2.1 Daily Close 冪等性 [優先度: 高]

**目的**: 同じ日付で再実行しても重複しない

**タスク**:
- [ ] `documents` テーブルで日付+タイプの重複チェック
- [ ] 既存レポートがある場合はスキップ or 上書き選択
- [ ] バックフィル用エンドポイント追加

---

### 2.2 Inbox ルール拡張 [優先度: 中]

**目的**: より多くの異常を自動検知

**新規ルール**:
- [ ] 注文金額と支払い金額の不一致
- [ ] 返金率が異常に高い期間
- [ ] Stripe Webhook処理失敗
- [ ] 未発送のまま一定期間経過した注文

---

### 2.3 Stripe E2E 検証 [優先度: 高]

**目的**: 実アカウントでの動作確認

**チェックリスト**:
- [ ] テストモードで実際のCheckout Session作成
- [ ] Webhook受信 → orders/payments更新確認
- [ ] 返金処理の動作確認
- [ ] idempotency keyの動作確認

---

## Sprint 3: Phase 2 準備 (1-2週間)

### 3.1 Storefront Cart 改善 [優先度: 中]

**目的**: バリアント選択とカート状態管理

**タスク**:
- [ ] 商品詳細でバリアント選択UI
- [ ] LocalStorage/SessionStorageでカート保持
- [ ] カート内容の確認画面
- [ ] 数量変更機能

---

### 3.2 通知システム基盤 [優先度: 中]

**目的**: Phase 2のワークフロー自動化に向けた準備

**タスク**:
- [ ] 通知チャネル抽象化（email, slack, webhook）
- [ ] `notifications` テーブル設計
- [ ] Inbox → 通知トリガーの実装

---

### 3.3 Vectorize 調査 [優先度: 低]

**目的**: Phase 2の意味検索に向けた技術調査

**タスク**:
- [ ] Cloudflare Vectorize のドキュメント確認
- [ ] 商品/証跡のembedding方針検討
- [ ] POC実装

---

## 優先順位まとめ

```
Week 1-2:
├── [HIGH] 1.1 Variants/Prices管理
├── [HIGH] 1.2 Inventory管理
├── [HIGH] 1.4 GitHub Actions CI
└── [MED]  1.3 Fulfillment管理

Week 3:
├── [HIGH] 2.1 Daily Close冪等性
├── [HIGH] 2.3 Stripe E2E検証
├── [MED]  2.2 Inbox ルール拡張
└── [MED]  1.5 移行ドキュメント

Week 4+:
├── [MED]  3.1 Cart改善
├── [MED]  3.2 通知システム
└── [LOW]  3.3 Vectorize調査
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

### UI規約
- Tailwind + Apple Design Language
- 既存コンポーネント（Button, Badge, Container）を再利用
- SSRファーストでJSは最小限

---

## 次のアクション

1. **このプランのレビュー** - 優先度の調整が必要か確認
2. **Sprint 1 開始** - Variants/Prices管理から着手
3. **CI設定** - 早期にGitHub Actionsを導入してPRの品質担保
