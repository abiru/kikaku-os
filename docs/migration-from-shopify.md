# Shopify からのデータ移行ガイド

このドキュメントでは、Shopify から Led Kikaku OS へのデータ移行手順を説明します。

## 前提条件

- Node.js 18+ がインストールされていること
- Wrangler CLI がインストールされていること
- Shopify 管理画面へのアクセス権限があること

## 1. Shopify からデータをエクスポート

### 商品データのエクスポート

1. Shopify 管理画面にログイン
2. **商品** > **すべての商品** に移動
3. **エクスポート** ボタンをクリック
4. エクスポート範囲を選択:
   - 現在のページ
   - すべての商品
   - 選択した商品
5. **Plain CSV file** を選択
6. **商品をエクスポート** をクリック

ダウンロードされるファイル: `products_export.csv`

### 顧客データのエクスポート

1. Shopify 管理画面にログイン
2. **顧客** に移動
3. **エクスポート** ボタンをクリック
4. エクスポート範囲を選択:
   - すべての顧客
   - 現在のフィルター結果
5. **Plain CSV file** を選択
6. **顧客をエクスポート** をクリック

ダウンロードされるファイル: `customers_export.csv`

## 2. CSV を SQL に変換

### スクリプトの使い方

```bash
# 商品のみ変換
node scripts/shopify-to-sql.js --products=products_export.csv --out=import_products.sql

# 顧客のみ変換
node scripts/shopify-to-sql.js --customers=customers_export.csv --out=import_customers.sql

# 両方を同時に変換
node scripts/shopify-to-sql.js \
  --products=products_export.csv \
  --customers=customers_export.csv \
  --out=migration.sql

# 通貨を指定（デフォルト: JPY）
node scripts/shopify-to-sql.js --products=products_export.csv --currency=USD --out=import.sql
```

### オプション一覧

| オプション | 説明 | デフォルト |
|-----------|------|----------|
| `--products <path>` | 商品 CSV のパス | - |
| `--customers <path>` | 顧客 CSV のパス | - |
| `--currency <code>` | 通貨コード (JPY, USD など) | JPY |
| `--out <path>` | 出力 SQL ファイル | migration.sql |
| `--help` | ヘルプ表示 | - |

### 通貨の扱い

- **JPY**: 価格は整数としてそのまま保存（例: ¥1,000 → 1000）
- **USD/EUR等**: 価格は最小単位（セント）に変換して保存（例: $10.00 → 1000）

### 変換される内容

| Shopify | Led Kikaku OS |
|---------|---------------|
| Products | products テーブル |
| Variants | variants テーブル |
| Variant Price | prices テーブル |
| Variant Inventory Qty | inventory_movements テーブル (初期在庫) |
| Customers | customers テーブル |

### メタデータとして保存される情報

**商品:**
- Vendor
- Type
- Tags
- Handle (Shopify URL用スラッグ)

**バリアント:**
- Grams (重量)
- Barcode
- Image Src

**顧客:**
- Note
- Tags
- Total Spent
- Total Orders

## 3. データベースに適用

### ローカル環境

```bash
# まずローカルでテスト
pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local --file=migration.sql
```

### 本番環境

```bash
# 本番に適用（要確認）
pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --file=migration.sql
```

## 4. データ検証チェックリスト

インポート後に以下を確認してください。

### 商品データ

- [ ] 商品数が Shopify と一致する
  ```bash
  pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local \
    --command="SELECT COUNT(*) FROM products"
  ```

- [ ] バリアント数が Shopify と一致する
  ```bash
  pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local \
    --command="SELECT COUNT(*) FROM variants"
  ```

- [ ] 価格が正しく変換されている
  ```bash
  pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local \
    --command="SELECT v.title, p.amount, p.currency FROM variants v JOIN prices p ON p.variant_id = v.id LIMIT 10"
  ```

- [ ] 在庫数が正しい
  ```bash
  pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local \
    --command="SELECT v.title, SUM(m.delta) as on_hand FROM variants v LEFT JOIN inventory_movements m ON m.variant_id = v.id GROUP BY v.id LIMIT 10"
  ```

### 顧客データ

- [ ] 顧客数が Shopify と一致する
  ```bash
  pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local \
    --command="SELECT COUNT(*) FROM customers"
  ```

- [ ] メールアドレスが正しくインポートされている
  ```bash
  pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local \
    --command="SELECT name, email FROM customers LIMIT 10"
  ```

### 管理画面での確認

- [ ] `/admin/products` で商品一覧が表示される
- [ ] 各商品の詳細ページでバリアントが表示される
- [ ] `/admin/inventory` で在庫が表示される

## 5. トラブルシューティング

### CSV のエンコーディング問題

Shopify からエクスポートした CSV が文字化けする場合:

```bash
# UTF-8 に変換（macOS）
iconv -f SHIFT_JIS -t UTF-8 products_export.csv > products_utf8.csv

# または nkf を使用
nkf -w products_export.csv > products_utf8.csv
```

### 重複エラー

既存データがある状態で再インポートするとエラーになります:

```
UNIQUE constraint failed: ...
```

この場合は、先に既存データを削除するか、ロールバック後に再実行してください。

### 外部キー制約エラー

バリアントや価格の挿入時に外部キーエラーが出る場合、商品が正しく挿入されていない可能性があります。SQL ファイルの順序を確認してください。

## 6. ロールバック手順

移行に問題があった場合のロールバック手順です。

### ローカル環境

```bash
# ローカル D1 データを削除して再作成
rm -rf apps/api/.wrangler/state/v3/d1

# マイグレーションを再適用
pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
```

### 本番環境（危険）

本番環境のロールバックは慎重に行ってください。

```bash
# 移行データのみ削除（既存の注文データは残す）
pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --command="
DELETE FROM inventory_movements WHERE reason = 'migration_initial';
DELETE FROM prices WHERE variant_id IN (SELECT id FROM variants WHERE json_extract(metadata, '$.source') = 'shopify_migration');
DELETE FROM variants WHERE json_extract(metadata, '$.source') = 'shopify_migration';
DELETE FROM products WHERE json_extract(metadata, '$.source') = 'shopify_migration';
DELETE FROM customers WHERE json_extract(metadata, '$.source') = 'shopify_migration';
"
```

## 7. 移行後の作業

### Stripe Price ID の設定

Shopify の商品は Stripe と紐付いていないため、手動で設定が必要です:

1. `/admin/products/{id}` にアクセス
2. 各バリアントの **Stripe Price ID** を設定
3. Stripe Dashboard で作成した Price ID をコピー&ペースト

### 画像の移行

現在のスクリプトは画像 URL をメタデータに保存するのみです。R2 への画像アップロードは別途対応が必要です。

### 注文履歴

このスクリプトは注文履歴を移行しません。過去の注文データが必要な場合は、Shopify を参照用に残すか、カスタムスクリプトで移行してください。

## 関連ファイル

- `scripts/shopify-to-sql.js` - 変換スクリプト
- `migrations/0001_init.sql` - 初期スキーマ
- `CLAUDE.md` - プロジェクト概要
