---
name: inbox-pattern
description: AI出力の人間承認フロー（Inboxパターン）
---

# Inboxパターン

## 設計思想

**「AIは信頼しない」** - AI生成コンテンツ（仕訳ドラフト、異常検知アラート等）は必ず人間が承認してから確定する。

## アーキテクチャ

- **Inboxテーブル**: AI生成データや異常検知を一時保存
- **承認フロー**: 管理画面（`/admin/inbox`）で人間が確認・承認/却下
- **監査ログ**: 全ての承認・却下操作を記録

## Inboxテーブル構造

```sql
CREATE TABLE inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,              -- 'ledger_approval', 'daily_close_anomaly', etc.
  status TEXT DEFAULT 'open',      -- 'open', 'approved', 'rejected'
  severity TEXT DEFAULT 'info',    -- 'info', 'warning', 'critical'
  title TEXT,
  description TEXT,
  metadata TEXT,                   -- JSON形式で詳細データ
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by TEXT
);
```

## 主要エンドポイント

### Inbox管理
- `GET /inbox?status=open&severity=&limit=` - Inbox一覧取得
- `GET /inbox/:id` - Inbox詳細取得
- `POST /inbox/:id/approve` - 承認（データ確定）
- `POST /inbox/:id/reject` - 却下（再生成または破棄）

## Inboxアイテム作成パターン

### 1. 仕訳ドラフト承認
```typescript
await createInboxItem({
  type: 'ledger_approval',
  severity: 'info',
  title: `${date} 仕訳ドラフト承認待ち`,
  description: 'AI生成の仕訳を確認してください',
  metadata: JSON.stringify({
    date,
    ledgerEntries: [
      { debit: '現金', credit: '売上', amount: 10000 },
      // ...
    ]
  })
})
```

### 2. 異常検知アラート
```typescript
await createInboxItem({
  type: 'daily_close_anomaly',
  severity: 'warning',
  title: `${date} 売上異常検知`,
  description: '前日比+70%の売上急増を検知',
  metadata: JSON.stringify({
    date,
    anomalies: ['前日比+70%'],
    report: { totalSales: 170000, ... }
  })
})
```

### 3. 在庫不足アラート
```typescript
await createInboxItem({
  type: 'inventory_low',
  severity: 'critical',
  title: '在庫不足: 商品A',
  description: '在庫が閾値（10個）を下回りました',
  metadata: JSON.stringify({
    productId: 1,
    currentStock: 5,
    threshold: 10
  })
})
```

## 承認フロー

### 承認処理
```typescript
// POST /inbox/:id/approve
const item = await db.get('SELECT * FROM inbox WHERE id = ?', id)

if (item.type === 'ledger_approval') {
  // 仕訳を確定
  const { ledgerEntries } = JSON.parse(item.metadata)
  await insertLedgerEntries(ledgerEntries)
}

// Inboxステータス更新
await db.run(
  'UPDATE inbox SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?',
  'approved', new Date().toISOString(), userId, id
)
```

### 却下処理
```typescript
// POST /inbox/:id/reject
await db.run(
  'UPDATE inbox SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?',
  'rejected', new Date().toISOString(), userId, id
)

// 必要に応じて再生成トリガー
if (item.type === 'ledger_approval') {
  await regenerateLedgerDraft(item.metadata.date)
}
```

## 管理画面（/admin/inbox）

### 表示内容
- **Open items**: ステータスが `open` のアイテム一覧
- **Severity別フィルタ**: `critical`, `warning`, `info`
- **詳細モーダル**: メタデータ（JSON）を整形表示
- **承認/却下ボタン**: ワンクリックで処理

### UI例
```
┌─────────────────────────────────────────────────────┐
│ Inbox (3 open items)                                │
├─────────────────────────────────────────────────────┤
│ [CRITICAL] 在庫不足: 商品A                          │
│   在庫が閾値（10個）を下回りました                  │
│   [承認] [却下] [詳細]                              │
├─────────────────────────────────────────────────────┤
│ [WARNING] 2026-01-13 売上異常検知                   │
│   前日比+70%の売上急増を検知                        │
│   [承認] [却下] [詳細]                              │
├─────────────────────────────────────────────────────┤
│ [INFO] 2026-01-13 仕訳ドラフト承認待ち              │
│   AI生成の仕訳を確認してください                    │
│   [承認] [却下] [詳細]                              │
└─────────────────────────────────────────────────────┘
```

## 重要な設計ポイント

- **人間最終判断**: AIは提案のみ、最終決定は人間
- **監査証跡**: 誰が・いつ・何を承認/却下したかを記録
- **重要度分類**: `critical` > `warning` > `info` で優先度を明示
- **メタデータ保存**: JSON形式で柔軟にデータを保存し、詳細表示に利用
- **自動起票**: Cron（日次締め）や在庫監視で自動的にInboxへ起票

## Daily Close Cronとの連携

```typescript
// Daily Close実行時
const { anomalies, severity } = detectAnomalies(report)

if (severity !== 'normal') {
  // 異常検知 → Inbox起票
  await createInboxItem({
    type: 'daily_close_anomaly',
    severity,
    title: `${date} 異常検知`,
    description: anomalies.join(', '),
    metadata: JSON.stringify({ date, report, anomalies })
  })
}

// 仕訳ドラフト生成 → Inbox起票
const ledgerDraft = await generateLedgerEntries(report)
await createInboxItem({
  type: 'ledger_approval',
  severity: 'info',
  title: `${date} 仕訳ドラフト承認待ち`,
  metadata: JSON.stringify({ date, ledgerDraft })
})
```
