
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
  - Admin: React + Refine + Tailwind（Vite）
  - Storefront: Astro（Phase 1で導入）
- AIは不正確になり得る前提
  - 最終決裁は人間（Inbox / Approve / Reject）
  - AIの入力/出力/根拠は証跡化（R2）
- 変更は必ずテストを追加し、実行して担保する
- npm/Node は最新版運用（ただし依存整合性を最優先）
- 依存は「同一メジャーで揃える」を原則（特に Refine 系）

---

## 2. 現状（As-is）
### 2.1 できていること（v1 skeleton）
- Daily Close:
  - /reports/daily 集計
  - /daily-close/:date/artifacts で report/evidence/html を R2 に出力
  - documents テーブルに紐付け
- Ledger:
  - daily close を元に ledger_entries を生成
- Inbox:
  - open items の一覧 + approve/reject
- Dev seed:
  - DEV_MODE=true のとき /dev/seed でローカルデータ投入

### 2.2 完了済みの重要修正
- ✅ Admin の Documents「開く」が 401 になる問題は解消済み
  - 以後は「動作確認項目」としてのみ扱う（再発防止はテストで担保）

---

## 3. To-be アーキテクチャ（全体像）
### 3.1 Apps
- apps/api（Workers + Hono）
- apps/admin（Refine + Tailwind）
- apps/storefront（Astro）※Phase 1で追加

### 3.2 データの流れ
1) Stripe Webhook / 同期で orders/payments/refunds をD1へ反映  
2) 日次で Daily Close を生成（集計→異常検知→証跡→仕訳ドラフト）  
3) 例外や確認事項は Inbox に集約し、人が Approve/Reject  
4) Workflows/Cron + AI Agent が監視・通知・提案を自動化

---

## 4. 開発ロードマップ（Phase 1〜3）

### Phase 1: 基盤構築と「脱Shopify」
目的: 人間が運用できるレベルで移行を完了し、最小のECを成立させる。

- [P1-1] D1スキーマ確定（Products/Variants/Prices/Inventory/Customers/Orders/Payments/Refunds/Events/Documents/Ledger）
- [P1-2] Stripe決済（Hono）
  - Checkout/PaymentIntent 方針決定
  - Webhookで支払い/返金をD1へ反映（最低限）
- [P1-3] Astro storefront（購入導線）
  - 商品一覧/詳細、カート、決済遷移、受注完了
- [P1-4] Admin基本（運用向け）
  - 商品/在庫/注文の最低限CRUD
  - Daily Close / Ledger / Inbox の安定化
- [P1-5] データ移行
  - Shopifyエクスポート→D1取り込みツール（スクリプト or API）

受け入れ条件（DoD）
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
  - 勘定科目体系の拡張、取引自動仕訳の精度向上、月次/年次レポート
- [P3-2] マーケオートメーション
  - 行動ログ→セグメント→メール/通知（カゴ落ち、再入荷、購入後フォロー）
- [P3-3] AIコンサルタント（Admin内）
  - KPI/在庫/粗利/改善案を対話で引き出し、タスク化→実行→証跡まで一気通貫

受け入れ条件（DoD）
- 月次PLのドラフトが自動で作られ、根拠（証跡）へ辿れる
- マーケ施策がイベント駆動で動き、監査可能
- AI提案が「実行可能なPR/設定変更案」まで落ちる

---

## 5. テスト/品質（必須）
- API: vitest + typecheck + 最低限の統合テスト（D1 local）
- Admin: vitest（fetchモック） + 主要画面のスモーク
- すべてのPRで `pnpm test` を通す（CI）
- 依存整合:
  - Refine系は同一メジャーで固定し、lockfileで再現性を担保する

---

## 6. セキュリティ/運用
- 当面: Admin API Key
  - 将来的に Clerk 等の認証へ置換（Phase 1.5〜2）
- 監査ログ
  - 重要操作は audit_logs に記録
- 証跡の原則
  - “入力/出力/判断材料/実行結果” をR2に残し、後追い可能にする

---

## 7. 直近の Next Actions（順番固定）
1) Stripe Webhook 取り込み（D1に実データが流れる状態にする）
2) Astro storefront の最小導線（商品→決済→注文作成）
3) Daily Close の Cron 化（自動化の第一歩）
4) Inbox 自動生成ルール追加（異常検知の実用化）
5) テスト/CI を固める（壊れない状態の固定）

---

## 8. Decision Log（都度追記）
- 決済方式（Checkout vs PaymentIntent）
- 受注の正本（Stripeイベント vs 自前Orders）
- Refine/Router/Kbar/Query のメジャー固定方針
- 証跡の扱い（保持期間/命名規約/重要度/監査）
