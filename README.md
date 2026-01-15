# Led Kikaku OS v1

脱Shopify運用OSの最小実装。Cloudflare Workers + Hono API と Refine + Tailwind 管理画面で日次締め・証跡・仕訳ドラフト・Inbox を提供します。

## スタック
- Cloudflare Workers + Hono (TypeScript)
- Cloudflare D1 (SQLite)
- Cloudflare R2
- Admin: React + Refine + Tailwind (Vite)

## ローカル開発
依存は pnpm を推奨します。

### 共通
- 環境変数: `ADMIN_API_KEY` を wrangler.toml に設定
- API: http://localhost:8787
- Admin: http://localhost:5173
- CORS origin: http://localhost:5173 / http://127.0.0.1:5173 を許可（必要に応じて追加）
- ローカルseed: `DEV_MODE=true` のときのみ `/dev/seed` が有効

### API
```bash
pnpm install --prefix apps/api
pnpm -C apps/api dev

# 初回スキーマ適用 (ローカル D1)
wrangler d1 migrations apply ledkikaku-os --local
```

### Admin
```bash
pnpm install --prefix apps/admin
pnpm -C apps/admin dev
```

Adminの起動確認（キャッシュが残る場合）:
```bash
rm -rf apps/admin/node_modules/.vite
pnpm -C apps/admin dev
```

## 主要エンドポイント

* GET /reports/daily?date=YYYY-MM-DD
* POST /daily-close/:date/artifacts
* GET /daily-close/:date/documents
* GET /r2?key=...
* GET /ledger-entries?date=YYYY-MM-DD
* GET /inbox?status=open&severity=&limit=
* POST /inbox/:id/approve / POST /inbox/:id/reject
* GET /inventory/low?limit=
* POST /inventory/thresholds
* POST /dev/seed (DEV_MODE=trueのみ)

## Seed API

```bash
curl -X POST http://localhost:8787/dev/seed \
  -H "x-admin-key: CHANGE_ME" \
  -H "content-type: application/json" \
  -d '{"date":"2026-01-13","orders":5,"refunds":1}'
```

## Admin 画面

* 日次締め: 日付選択、レポート表示、証跡作成、ドキュメント閲覧
* 仕訳: 日付別 ledger entries をテーブル表示
* Inbox: Open items の詳細と Approve/Reject

## 動作確認手順（curl例）

```bash
curl -X POST http://localhost:8787/dev/seed \
  -H "x-admin-key: CHANGE_ME" \
  -H "content-type: application/json" \
  -d '{"date":"2026-01-13","orders":5,"refunds":1}'

curl "http://localhost:8787/reports/daily?date=2026-01-13" \
  -H "x-admin-key: CHANGE_ME"

curl -X POST "http://localhost:8787/daily-close/2026-01-13/artifacts" \
  -H "x-admin-key: CHANGE_ME"

curl "http://localhost:8787/ledger-entries?date=2026-01-13" \
  -H "x-admin-key: CHANGE_ME"

curl -v "http://localhost:8787/r2?key=daily-close/2026-01-13/report.html" \
  -H "x-admin-key: CHANGE_ME"
```
