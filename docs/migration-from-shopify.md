# Shopify からのデータ移行

Shopify エクスポート CSV を Cloudflare D1 にインポートするための移行ツールです。

## 概要

`scripts/shopify-to-sql.js` は Shopify の CSV エクスポートを D1 互換の SQL ファイルに変換します。

### 対応データ

| Shopify CSV | D1 テーブル |
|-------------|------------|
| Products | products, variants, prices, inventory_movements |
| Customers | customers |
| Orders | orders, order_items, payments, customers |

## クイックスタート

```bash
# 1. プレビュー（dry-run）で確認
node scripts/shopify-to-sql.js --orders=orders.csv --dry-run

# 2. SQL生成
node scripts/shopify-to-sql.js \
  --products=products.csv \
  --customers=customers.csv \
  --orders=orders.csv \
  --out=migration.sql \
  --report=report.json

# 3. ローカル D1 に適用
pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local --file=migration.sql

# 4. 本番 D1 に適用
pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --file=migration.sql
```

## CLI オプション

```
Usage: node scripts/shopify-to-sql.js [options]

Options:
  --products <path>     Shopify Products CSV パス
  --customers <path>    Shopify Customers CSV パス
  --orders <path>       Shopify Orders CSV パス
  --currency <code>     通貨コード (デフォルト: JPY)
  --out <path>          出力 SQL ファイル (デフォルト: migration.sql)
  --dry-run             プレビューモード（SQL 出力なし）
  --report <path>       検証レポートを JSON で出力
  --skip-validation     検証エラーをスキップして続行
  --help                ヘルプを表示
```

## Shopify CSV のエクスポート方法

### Products
1. Shopify 管理画面 → Products → Export
2. "All products" または対象商品を選択
3. CSV をダウンロード

### Customers
1. Shopify 管理画面 → Customers → Export
2. CSV をダウンロード

### Orders
1. Shopify 管理画面 → Orders → Export
2. 日付範囲を選択
3. CSV をダウンロード

## データマッピング

### Products CSV → D1

| Shopify カラム | D1 テーブル.カラム |
|---------------|------------------|
| Handle | products.metadata.handle |
| Title | products.title |
| Body (HTML) | products.description |
| Published | products.status (true → 'active') |
| Vendor, Type, Tags | products.metadata |
| Variant SKU | variants.sku |
| Variant Price | prices.amount |
| Variant Inventory Qty | inventory_movements.delta |
| Option1/2/3 Name/Value | variants.options (JSON) |

### Customers CSV → D1

| Shopify カラム | D1 テーブル.カラム |
|---------------|------------------|
| Email | customers.email |
| First Name + Last Name | customers.name |
| Note, Tags | customers.metadata |
| Total Spent, Total Orders | customers.metadata |

### Orders CSV → D1

| Shopify カラム | D1 テーブル.カラム |
|---------------|------------------|
| Name | orders.metadata.shopify_order |
| Email | → customers (INSERT OR IGNORE) → orders.customer_id |
| Financial Status | orders.status, payments.status |
| Total | orders.total_net, payments.amount |
| Paid at | orders.paid_at |
| Created at | orders.created_at |
| Lineitem name | order_items.metadata.shopify_lineitem_name |
| Lineitem sku | → variants.sku → order_items.variant_id |
| Lineitem quantity | order_items.quantity |
| Lineitem price | order_items.unit_price |
| Billing/Shipping 情報 | orders.metadata |

### ステータスマッピング

| Shopify Financial Status | D1 orders.status | D1 payments.status |
|-------------------------|------------------|-------------------|
| paid | paid | succeeded |
| partially_paid | paid | succeeded |
| refunded | refunded | refunded |
| partially_refunded | partially_refunded | partially_refunded |
| pending | pending | pending |
| voided | refunded | failed |
| authorized | pending | pending |

## Dry-run モード

`--dry-run` オプションで SQL を生成せずにプレビューできます：

```
========================================================================
SHOPIFY TO D1 MIGRATION - DRY RUN
========================================================================

INPUT FILES:
  Orders:    orders.csv

PARSING SUMMARY:
  Orders:         523
  Order items:    1,247
  Payments:       523
  Customers (from orders): 412
  Orders by status:
    - paid: 489
    - refunded: 12
    - pending: 22

VALIDATION RESULTS:
  Errors:   0
  Warnings: 7

  Warnings:
    [1] Order #1045: Line item total (3200) differs from subtotal (3500)
    [2] Order #1078: Line item "Gift Card" has no SKU
    ...

========================================================================
To proceed with migration, remove --dry-run flag:
  node scripts/shopify-to-sql.js --orders=orders.csv --out=migration.sql
========================================================================
```

## 検証レポート

`--report` オプションで JSON レポートを出力：

```json
{
  "generated_at": "2024-01-20T10:30:00Z",
  "input_files": {
    "products": null,
    "customers": null,
    "orders": "orders.csv"
  },
  "currency": "JPY",
  "parsing": {
    "orders": 523,
    "order_items": 1247,
    "payments": 523,
    "customers_from_orders": 412
  },
  "orders_by_status": {
    "paid": 489,
    "refunded": 12,
    "pending": 22
  },
  "validation": {
    "error_count": 0,
    "warning_count": 7,
    "errors": [],
    "warnings": [...]
  }
}
```

## 検証ルール

### エラー（移行を停止）
- Order Name が空
- Total が数値でない
- Line item quantity が 1 未満

### 警告（移行は続行）
- Email がない（customer_id = NULL になる）
- Email 形式が無効
- Line item に SKU がない（variant_id = NULL になる）
- Line item 合計と Subtotal が一致しない

エラーがある場合、`--skip-validation` で強制続行できますが推奨しません。

## 注意事項

### レガシーマーカー
移行されたデータには `metadata.legacy = true` と `metadata.source = "shopify_migration"` が設定されます。歴史的注文は Stripe と紐付きません（`provider_*` フィールドは NULL）。

### 冪等性
- **Products**: 再実行すると重複が作成されます
- **Customers**: email で `INSERT OR IGNORE` のため安全に再実行可能
- **Orders**: 再実行すると重複が作成されます

本番移行は 1 回限りを想定しています。テスト時はローカル D1 を使用してください。

### SKU リンク
Order items は SKU で variants テーブルにリンクします。Products を先にインポートしてから Orders をインポートしてください。

```bash
# 推奨順序
node scripts/shopify-to-sql.js --products=products.csv --out=1_products.sql
pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local --file=1_products.sql

node scripts/shopify-to-sql.js --orders=orders.csv --out=2_orders.sql
pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local --file=2_orders.sql
```

## トラブルシューティング

### CSV パースエラー
Shopify CSV は RFC 4180 準拠です。フィールド内に改行やカンマがある場合はダブルクォートで囲まれています。スクリプトはこれを正しく処理しますが、手動編集した CSV では問題が発生する可能性があります。

### 文字化け
CSV は UTF-8 で保存されている必要があります。Excel で編集した場合は「UTF-8 CSV」として保存してください。

### メモリ不足
大量のデータ（10万行以上）の場合、Node.js のメモリ制限に達する可能性があります：

```bash
node --max-old-space-size=4096 scripts/shopify-to-sql.js --orders=large_orders.csv --out=migration.sql
```
