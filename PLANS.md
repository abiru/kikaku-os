
# PLANS.md — Led Kikaku OS（脱Shopify + AI運用OS）

## 0. 目的
LED企画のEC/運用を「Shopify依存」から脱却し、Cloudflare上で
- 売上・決済・返金の集計（Daily Close）
- 証跡の保存（R2 Evidence）
- 仕訳ドラフト/台帳（Ledger）
- 例外処理の受け皿（Inbox）
を確実に回す。

その上で、AI前提の運用（監視・更新・集計・帳簿ドラフト・税金概算・改善提案・通知）を段階的に追加し、
Shopify Premium相当以上の「マーケ自動化」「高度検索」「自律運用」まで拡張する。

---

## 1. 基本方針（Non-negotiables）
- スタック固定
  - Cloudflare Workers + Hono（API）
  - Cloudflare D1（DB）
  - Cloudflare R2（証跡/生成物）
  - Storefront + Admin: Astro SSR
- AIは不正確になり得る前提
  - 最終決裁は人間（Inbox / Approve / Reject）
  - AIの入力/出力/根拠は証跡化（R2）
- 変更は必ずテストを追加し、実行して担保する
- npm/Node は最新版運用（ただし依存整合性を最優先）

---

## 2. 現状サマリー (2026-01-22時点)

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

### 2.1 できていること（Phase 1 完了 + 拡張）
- **Daily Close**:
  - /reports/daily 集計
  - /daily-close/:date/artifacts で report/evidence/html を R2 に出力
  - documents テーブルに紐付け
  - 冪等性保証（再実行可能）
- **Stripe決済**:
  - Stripe Elements埋め込みチェックアウト（PaymentIntent API）
  - 銀行振込対応（jp_bank_transfer）
  - Webhook 受信で orders/payments/refunds を更新
  - fulfillments の自動作成 + events 記録
- **消費税**:
  - 税率マスタ（標準10%・軽減8%）
  - 税込表示・内訳計算
- **Ledger**:
  - daily close を元に ledger_entries を生成
- **Inbox**:
  - open items の一覧 + approve/reject
  - 異常検知ルール拡張（金額不一致、返金率、未発送アラート）
- **Storefront**:
  - 商品一覧（ページネーション対応）/ 商品詳細
  - カート（LocalStorage永続化、複数商品対応）
  - 日本語UI（i18n）
- **Admin**:
  - 商品/バリアント/価格管理
  - 在庫管理・しきい値設定
  - 税率管理
  - 発送管理
- **Dev seed**:
  - DEV_MODE=true のとき /dev/seed でローカルデータ投入
- **Cron**:
  - Daily Close 生成 + 在庫しきい値の監視を scheduled handler で実行
- **通知**:
  - Slack Webhook通知

### 2.2 完了済みの重要修正
- ✅ Admin の Documents「開く」が 401 になる問題は解消済み
  - 以後は「動作確認項目」としてのみ扱う（再発防止はテストで担保）

---

## 3. To-be アーキテクチャ（全体像）
### 3.1 Apps
- apps/api（Workers + Hono）
- apps/storefront（Astro SSR - ストア + 管理画面）

### 3.2 データの流れ
1) Stripe Webhook / 同期で orders/payments/refunds をD1へ反映
2) 日次で Daily Close を生成（集計→異常検知→証跡→仕訳ドラフト）
3) 例外や確認事項は Inbox に集約し、人が Approve/Reject
4) Workflows/Cron + AI Agent が監視・通知・提案を自動化

---

## 4. 開発ロードマップ（Phase 1〜3）

### Phase 1: 基盤構築と「脱Shopify」 ✅ 完了
目的: 人間が運用できるレベルで移行を完了し、最小のECを成立させる。

- [P1-1] D1スキーマ確定 ✅
- [P1-2] Stripe決済（Hono）✅
- [P1-3] Astro storefront（購入導線）✅
- [P1-4] Admin基本（運用向け）✅
- [P1-5] データ移行 ✅

受け入れ条件（DoD）✅ 達成
- seedなしで、Stripe実データから orders/payments/refunds がD1へ入る
- Daily Close で R2 証跡が生成され、Adminから閲覧できる
- テストが通り、CIで再現できる

---

### Phase 2: AI自動化の実装
目的: 「人間が回している運用」をAIが補助〜自動化する。

- [P2-1] Vectorize導入（高度検索）
  - 商品/証跡/Inboxの意味検索
- [P2-2] Workflows/Cron導入
  - 毎日の自動Daily Close + 通知
  - 在庫監視 + 発注アラート（入口）
- [P2-3] コンテンツ生成（Admin補助）
  - 商品登録時の文章生成/翻訳/要約/FAQ
  - 既存ページの改善提案（差分PR作成まで）

受け入れ条件（DoD）
- 自動Daily Close が動き、異常は Inbox に集約される
- 意味検索が実運用で役に立つ
- AI生成は必ず証跡化され、承認フローを通る

---

### Phase 3: 自律運用と高度な会計・マーケ
目的: Premium超え（会計・マーケ・経営支援までOS化）。

- [P3-1] 複式簿記ロジックの拡張（リアルタイム決算の入口）
- [P3-2] マーケオートメーション
- [P3-3] AIコンサルタント（Admin内）

受け入れ条件（DoD）
- 月次PLのドラフトが自動で作られ、根拠（証跡）へ辿れる
- マーケ施策がイベント駆動で動き、監査可能
- AI提案が「実行可能なPR/設定変更案」まで落ちる

---

## 5. 実装詳細（Sprint履歴）

### Sprint 1: Phase 1 完了 ✅

| 項目 | PR | 内容 |
|------|-----|------|
| Variants/Prices管理 | #7 | バリアント/価格CRUD、Stripe Price紐付け |
| Inventory管理 | #8 | 在庫一覧、入出庫、しきい値設定 |
| Fulfillment管理 | #12 | 発送ステータス管理UI |
| GitHub Actions CI | - | テスト/ビルド自動化 |
| データ移行ドキュメント | - | `docs/migration-from-shopify.md` |

### Sprint 2: 運用ハードニング ✅

| 項目 | PR | 内容 |
|------|-----|------|
| Daily Close冪等性 | #14, #16 | 実行履歴管理、重複防止、バックフィル |
| Inboxルール拡張 | #13 | 金額不一致、返金率、未発送アラート |
| Stripe E2E検証 | #9 | Webhook冪等性、部分返金対応 |

### Sprint 3: Storefront改善 ✅

| 項目 | PR | 内容 |
|------|-----|------|
| Cart改善 | #10, #11, #15 | バリアント選択、LocalStorage永続化、複数商品チェックアウト |
| 通知システム | - | Slack Webhook、notifications履歴 |

### Sprint 4: 決済・税・i18n ✅

| 項目 | PR | 内容 |
|------|-----|------|
| 消費税計算 | #83 | 税率マスタ、税込表示、Admin税率管理 |
| Stripe Elements | #105 | PaymentIntent API、埋め込みチェックアウト |
| 銀行振込 | #91, #100 | jp_bank_transfer、Customer管理 |
| i18n基盤 | #94, #97 | ja.json、t()ヘルパー、UI日本語化 |
| ページネーション | #98 | 商品一覧のページング |

---

## 6. 技術的決定事項

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

## 7. テスト/品質（必須）
- API: vitest + typecheck + 最低限の統合テスト（D1 local）
- Admin: vitest（fetchモック） + 主要画面のスモーク
- すべてのPRで `pnpm test` を通す（CI）
- 依存整合:
  - Refine系は同一メジャーで固定し、lockfileで再現性を担保する

---

## 8. セキュリティ/運用
- 当面: Admin API Key
  - 将来的に Clerk 等の認証へ置換（Phase 1.5〜2）
- 監査ログ
  - 重要操作は audit_logs に記録
- 証跡の原則
  - "入力/出力/判断材料/実行結果" をR2に残し、後追い可能にする

---

## 9. 完了したPR一覧

| PR | タイトル |
|----|---------|
| #7 | feat(admin): add variants and prices management |
| #8 | feat(admin): add inventory management |
| #9 | feat(stripe): add partial refund status and E2E test infrastructure |
| #10 | feat(storefront): add cart functionality and improve checkout flow |
| #11 | feat(storefront): add cart functionality and improve checkout flow |
| #12 | feat(admin): add fulfillment management UI to order details |
| #13 | feat(api): add extended inbox anomaly detection rules |
| #14 | feat(api): add daily close execution tracking and backfill support |
| #15 | feat(checkout): support multi-item cart checkout |
| #16 | feat(api): add idempotency for daily close operations |
| #83 | feat: Japanese consumption tax calculation system |
| #91 | feat: Stripe bank transfer integration |
| #94 | feat: Add i18n infrastructure and translate core UI to Japanese |
| #97 | fix: complete Japanese translation for cart and checkout pages |
| #98 | feat: Add pagination to storefront products listing |
| #100 | fix: Bank transfer checkout requires email address |
| #105 | feat: Migrate to Stripe Elements for embedded checkout |

---

## 10. 次のアクション

Phase 1 完了、Sprint 2-4 完了。次のステップ候補:

1. **本番デプロイ準備** - Cloudflare にデプロイして実運用テスト
2. **Vectorize 調査** - AI意味検索のためのPOC (Phase 2)
3. **追加通知チャネル** - Email (Resend)、汎用 Webhook 対応
4. **管理画面i18n** - Admin画面の日本語化

---

## 11. Decision Log（都度追記）
- 決済方式（Checkout vs PaymentIntent）
- 受注の正本（Stripeイベント vs 自前Orders）
- Refine/Router/Kbar/Query のメジャー固定方針
- 証跡の扱い（保持期間/命名規約/重要度/監査）

### 2026-01 追記
- **Stripe Elements採用** (#105): Checkout SessionからPaymentIntent + Stripe Elementsへ移行。埋め込み型チェックアウトでUX向上。
- **銀行振込対応** (#91): `ENABLE_BANK_TRANSFER`フラグで日本銀行振込（jp_bank_transfer）を有効化可能に。
- **消費税計算システム** (#83): 税率マスタ（`tax_rates`テーブル）導入。標準10%・軽減8%対応。税込表示。
- **i18n基盤** (#94): `src/i18n/ja.json` + `t()`ヘルパーで日本語化。シンプルなJSONベース。
- **ページネーション** (#98): ストアフロント商品一覧にページネーション追加。
