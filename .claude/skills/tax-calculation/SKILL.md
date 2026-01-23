---
name: tax-calculation
description: 日本の消費税計算ロジックと税率マスタ管理
---

# 消費税計算

## アーキテクチャ

- **税率マスタ**: `tax_rates` テーブルで税率を管理（標準10%、軽減8%）
- **税込表示**: 商品価格は税込、カートで税抜・税額・税込の内訳表示
- **計算ロジック**: `apps/api/src/services/tax.ts` で実装

## 税率マスタ

### テーブル構造
```sql
CREATE TABLE tax_rates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,           -- '標準税率', '軽減税率'
  rate REAL NOT NULL,            -- 0.10, 0.08
  is_default INTEGER DEFAULT 0,
  effective_from TEXT,
  effective_to TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 管理API
- `GET /admin/tax-rates` - 税率一覧取得
- `POST /admin/tax-rates` - 新規税率作成
- `PUT /admin/tax-rates/:id` - 税率更新
- `DELETE /admin/tax-rates/:id` - 税率削除

## 計算ロジック

### 日本の慣例
- **切り捨て丸め**: `Math.floor()` を使用（端数切り捨て）
- **税込価格 = 税抜価格 × (1 + 税率)**
- **税額 = 税込価格 - 税抜価格**

### 実装パターン（`services/tax.ts`）
```typescript
export function calculateTax(priceIncludingTax: number, taxRate: number) {
  // 税抜価格を計算（切り捨て）
  const priceExcludingTax = Math.floor(priceIncludingTax / (1 + taxRate))

  // 税額を計算
  const taxAmount = priceIncludingTax - priceExcludingTax

  return {
    priceIncludingTax,
    priceExcludingTax,
    taxAmount,
    taxRate
  }
}
```

### カート内訳表示
```typescript
// 商品ごとの税計算
items.forEach(item => {
  const tax = calculateTax(item.priceIncludingTax, item.taxRate)
  totalExcludingTax += tax.priceExcludingTax * item.quantity
  totalTax += tax.taxAmount * item.quantity
})

const totalIncludingTax = totalExcludingTax + totalTax
```

## 重要な設計ポイント

- **税込価格を基準**: DBには税込価格を保存（消費者向け表示価格）
- **逆算で税抜を計算**: 税込価格から税抜価格を逆算
- **端数処理**: 切り捨て（`Math.floor()`）が日本の一般的な慣例
- **税率変更対応**: 税率マスタで履歴管理（`effective_from`, `effective_to`）

## 管理画面

- `/admin/tax-rates` - 税率一覧・編集
- 標準税率（10%）、軽減税率（8%）の切り替え
- 新税率追加時は `effective_from` で適用開始日を設定
