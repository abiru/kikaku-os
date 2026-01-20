# Stripe Webhook強化 実装計画

## 要件の再確認

### ユーザー要件
1. Stripeイベント（支払い成功/失敗、返金）でorders/payments/refundsを確実に反映
2. 冪等性：同じイベント10回投げてもDBが壊れない
3. ローカル検証の自動化（curl手動を排除）

### 成功条件
- [ ] `checkout.session.completed` → 注文が `paid` になる
- [ ] 返金イベントで refunds が増え、注文が `partially_refunded` / `refunded` に更新
- [ ] 同一Stripeイベント10回投げてもDB整合性維持
- [ ] 自動テストで全フロー再現可能

---

## 現状分析

### 既に実装済み ✓
| 機能 | 実装場所 | 状態 |
|------|----------|------|
| stripe_events テーブル（UNIQUE event_id） | `0008_stripe_events_table.sql` | ✓ |
| 署名検証（HMAC-SHA256） | `lib/stripe.ts` | ✓ |
| イベント記録 → 処理の2フェーズ | `routes/stripe.ts` | ✓ |
| payments.provider_payment_id UNIQUE | `0003_add_provider_ids.sql` | ✓ |
| refunds.provider_refund_id UNIQUE | `0003_add_provider_ids.sql` | ✓ |
| 基本テスト（26ケース） | `stripeWebhook.test.ts` | ✓ |

### 改善が必要 ⚠️
| 項目 | 現状 | 改善内容 |
|------|------|----------|
| 注文ステータス遷移 | `paid` のみ | `partially_refunded`, `refunded` を追加 |
| 返金額の集計 | 個別refundsのみ | 注文の `refunded_amount` カラム追加 |
| 失敗イベント再処理 | 手動 | リトライコマンド/API追加 |
| テスト自動化 | curlが必要 | ワンコマンドで完結するテスト |

---

## 実装フェーズ

### Phase 1: スキーマ拡張 [LOW RISK]

**新規マイグレーション**: `0013_order_refund_tracking.sql`

```sql
-- 注文に返金追跡カラムを追加
ALTER TABLE orders ADD COLUMN refunded_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN refund_count INTEGER NOT NULL DEFAULT 0;

-- 注文ステータス変更履歴
CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,  -- 'payment_succeeded', 'refund_partial', 'refund_full'
  stripe_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES orders(id)
);
CREATE INDEX idx_order_status_history_order ON order_status_history(order_id);
```

**変更するファイル**:
- `migrations/0013_order_refund_tracking.sql` (新規)

---

### Phase 2: 注文ステータス遷移ロジック [MEDIUM RISK]

**ステータス定義**:
```
pending → paid → partially_refunded → refunded
                ↘ refunded (全額返金時)
```

**ルール**:
| 条件 | 新ステータス |
|------|-------------|
| refunded_amount = 0 | `paid` |
| 0 < refunded_amount < total_net | `partially_refunded` |
| refunded_amount >= total_net | `refunded` |

**変更するファイル**:
- `apps/api/src/routes/stripe.ts` - 返金処理ロジック
- `apps/api/src/services/orderStatus.ts` (新規) - ステータス計算ロジック

**実装詳細**:
```typescript
// services/orderStatus.ts
export function calculateOrderStatus(order: {
  status: string;
  total_net: number;
  refunded_amount: number;
}): string {
  if (order.status === 'pending') return 'pending';
  if (order.refunded_amount === 0) return 'paid';
  if (order.refunded_amount >= order.total_net) return 'refunded';
  return 'partially_refunded';
}
```

---

### Phase 3: Webhookハンドラ強化 [MEDIUM RISK]

**charge.refunded / refund.succeeded ハンドラ修正**:

```typescript
// 返金処理後、注文ステータスを再計算
async function handleRefundEvent(env: Env, refundData: Stripe.Refund) {
  // 1. refunds テーブルに INSERT OR IGNORE
  // 2. orders.refunded_amount を集計で更新
  // 3. 新ステータスを計算
  // 4. ステータス変更があれば order_status_history に記録
}
```

**変更するファイル**:
- `apps/api/src/routes/stripe.ts`

---

### Phase 4: 失敗イベント再処理機能 [LOW RISK]

**管理者API追加**: `POST /admin/stripe-events/:eventId/retry`

```typescript
// 1. stripe_events から payload_json を取得
// 2. processing_status を 'pending' にリセット
// 3. 再処理を実行
// 4. 結果を返す
```

**変更するファイル**:
- `apps/api/src/routes/adminStripeEvents.ts`

---

### Phase 5: テスト強化 [LOW RISK]

**追加テストケース**:

| # | テスト名 | 検証内容 |
|---|---------|----------|
| 1 | `checkout → paid status` | checkout完了で注文がpaidになる |
| 2 | `partial refund status` | 部分返金で partially_refunded |
| 3 | `full refund status` | 全額返金で refunded |
| 4 | `idempotency 10x` | 同一イベント10回送信でDB整合性維持 |
| 5 | `refund aggregation` | 複数返金の合計額が正しい |
| 6 | `status history tracking` | ステータス変更履歴が記録される |

**テスト実行コマンド**:
```bash
# 全Stripeテスト実行
pnpm -C apps/api test -- --grep "stripe"

# 冪等性テストのみ
pnpm -C apps/api test -- --grep "idempotency"
```

**変更するファイル**:
- `apps/api/src/routes/stripeWebhook.test.ts`

---

## リスク評価

| リスク | 影響 | 対策 |
|--------|------|------|
| マイグレーション失敗 | HIGH | ローカルで十分にテスト後に本番適用 |
| 返金額の不整合 | MEDIUM | Stripe API を source of truth とし、定期的に照合 |
| 既存テスト破損 | LOW | 既存テストを先に実行確認 |

---

## 実装順序

```
Phase 1 (スキーマ)
    ↓
Phase 5 (テスト追加 - RED)
    ↓
Phase 2 (ステータスロジック)
    ↓
Phase 3 (Webhookハンドラ)
    ↓
Phase 5 (テスト確認 - GREEN)
    ↓
Phase 4 (リトライ機能)
```

**TDDアプローチ**: テストを先に書いてから実装する

---

## 検証チェックリスト

実装完了後に確認:

- [ ] `pnpm -C apps/api test` 全テストパス
- [ ] checkout.session.completed → orders.status = 'paid'
- [ ] 部分返金 → orders.status = 'partially_refunded'
- [ ] 全額返金 → orders.status = 'refunded'
- [ ] 同一event_id 10回送信 → 1行のみ（stripe_events）
- [ ] 同一provider_refund_id 10回 → 1行のみ（refunds）
- [ ] order_status_history に遷移が記録される
- [ ] `POST /admin/stripe-events/:id/retry` で再処理可能

---

## 決定事項（確認が必要）

1. **Source of Truth**: `payment_intent.succeeded` と `checkout.session.completed` どちらを優先？
   - 推奨: `checkout.session.completed` （metadata にorder_idが確実にある）

2. **部分返金の閾値**: refunded_amount > 0 だが total_net 未満を「partially_refunded」でOK？

3. **リトライ上限**: 失敗イベントの自動リトライ回数は？（推奨: 手動のみ）
