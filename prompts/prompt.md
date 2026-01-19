以下をそのまま Codex / Claude Code に貼って実行してください（kikaku-os リポジトリ想定）。Refineは使いません。管理画面は Astro（storefront）で作り、Cloudflare Access で保護します。

# Title

admin: astro admin products list (Cloudflare Access protected) + api endpoint

# Goal

* Storefront（Astro）に `/admin/products` を追加し、products 一覧（検索・ページング）を表示できるようにする
* API（Hono + D1）に `GET /admin/products` を追加（検索・ページング）
* 認可は Cloudflare Access を前提（本番/ステージングは Access で /admin/* を保護）

  * ローカル開発は既存の `x-admin-key` を継続利用（キーはSSRでのみ使用し、ブラウザに露出させない）

# Non-goals

* Refineの導入/復活はしない
* RBAC/ユーザー管理（Clerk等）はPhase2以降

# Constraints

* products スキーマ：id, title, description, metadata, created_at, updated_at
* `apps/api/src/index.ts` の admin key ミドルウェア仕様：

  * `x-admin-key` ヘッダを見て `ADMIN_API_KEY` と一致しないと 401
* Astro側では `ADMIN_API_KEY` をクライアントへ絶対に渡さない（`PUBLIC_` プレフィックス禁止）
* 既存のデザイン（Layout.astro/コンポーネント）に合わせる

---

## Task 0: 現状確認（実装前に読む）

* 既存の `apps/api/src/index.ts` の auth middleware と `/dev/ping` 例外を踏襲
* Storefront が SSR 可能な構成か確認（Astroの output/server adapter の有無）

---

## Task 1: API - `GET /admin/products` を追加

1. `apps/api/src/routes/adminProducts.ts` を新規作成し、Hono router を export

* ルート：`GET /products`（index.ts で `/admin` 配下に mount する）
* Query:

  * `page` default 1
  * `perPage` default 20, max 100
  * `q`（title/description 部分一致）
* SQL:

  * total: `SELECT COUNT(*) as n FROM products WHERE ...`
  * data: `SELECT id, title, description, metadata, created_at, updated_at FROM products WHERE ... ORDER BY id DESC LIMIT ? OFFSET ?`
* 戻り値：`jsonOk(c, { data, total, page, perPage })`
* `q` が空なら WHERE なしで全件

2. `apps/api/src/index.ts` に route 登録

* `import { adminProducts } from './routes/adminProducts'`
* `app.route('/admin', adminProducts)` を追加

3. API動作確認コマンド（コメントでもOK）

* `curl -sS "http://localhost:8787/admin/products?page=1&perPage=20&q=Seed" -H "x-admin-key: dev-admin-key" | jq .`

---

## Task 2: Storefront(Astro) - `/admin/products` ページを追加（SSR）

1. `apps/storefront/src/pages/admin/products.astro` を新規作成

* Layoutは既存の `Layout.astro` を使用
* URL query：

  * `page`（default 1）
  * `perPage`（default 20）
  * `q`（検索文字列）
* SSRでAPIを叩く

  * base URL: `import.meta.env.API_BASE_URL` を優先、無ければ `http://localhost:8787`
  * headers:

    * `x-admin-key: import.meta.env.ADMIN_API_KEY`（ローカル用。必ずSSRでのみ参照）
* レスポンスの `data/total/page/perPage` を使って一覧描画
* 表示カラム：id / title / created_at（必要なら updated_at）
* 検索フォーム（GET）を上部に配置
* ページング（前へ/次へ、総ページ数）を下部に配置
* UIは既存の Button/Badge 等があるなら流用し、シンプルに

2. セキュリティ（最低限）

* ページ側で `ADMIN_UI_KEY` の簡易ガードを追加（Cloudflare Accessが無いローカルでも誤操作防止）

  * 例：`/admin/products?key=dev-ui-key`
  * `import.meta.env.ADMIN_UI_KEY` と一致しないなら 404 か 403
* 本番は Cloudflare Access が守る前提だが、二重で守ってもよい

---

## Task 3: 環境変数（開発用）

1. API（wrangler dev）: `apps/api/.dev.vars`

* `DEV_MODE=true`
* `ADMIN_API_KEY=dev-admin-key`

2. Storefront（Astro dev）: `apps/storefront/.env`（or `.env.local`）

* `API_BASE_URL=http://localhost:8787`
* `ADMIN_API_KEY=dev-admin-key`  # PUBLIC_禁止
* `ADMIN_UI_KEY=dev-ui-key`

※ 既存のenvファイル運用があるなら、それに合わせて配置すること。

---

## Task 4: 動作確認

1. （必要なら）/dev/seed で products を複数作成
2. API確認：

* `curl -sS "http://localhost:8787/admin/products?page=1&perPage=20&q=" -H "x-admin-key: dev-admin-key" | jq .`

3. Storefront確認：

* `http://localhost:4321/admin/products?key=dev-ui-key`
* 一覧が出る、検索できる、ページングが動く

---

## Deliverables

* 追加/変更したファイル一覧
* 確認手順（コマンド）
* 可能ならコミットまで（例：`feat(admin): add astro products list`）

