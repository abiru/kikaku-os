# Cloudflare Workers Patterns

Cloudflare Workers + Hono + D1 + R2のパターン集（kikaku-os固有）

## スタック構成

```
Frontend: Astro SSR (Store + Admin)
Backend:  Cloudflare Workers + Hono
Database: Cloudflare D1 (SQLite)
Storage:  Cloudflare R2 (Object Storage)
```

## Hono Routing Patterns

### 基本ルート定義

```typescript
import { Hono } from 'hono';
import type { Env } from './env';

const app = new Hono<Env>();

// GET endpoint
app.get('/products', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM products').all();
  return c.json(result.results);
});

// POST endpoint
app.post('/products', async (c) => {
  const body = await c.req.json();
  const db = c.env.DB;

  const result = await db.prepare(
    'INSERT INTO products (name, price) VALUES (?, ?)'
  ).bind(body.name, body.price).run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

export default app;
```

### ルートグループ化（kikaku-os方式）

```typescript
// apps/api/src/routes/admin/adminProducts.ts
import { Hono } from 'hono';
import type { Env } from '../../env';

const adminProducts = new Hono<Env>();

adminProducts.get('/admin/products', async (c) => { /* ... */ });
adminProducts.get('/admin/products/:id', async (c) => { /* ... */ });
adminProducts.post('/admin/products', async (c) => { /* ... */ });

export default adminProducts;

// apps/api/src/routes/index.ts
import adminProducts from './admin/adminProducts';

export function registerRoutes(app: Hono<Env>) {
  app.route('/admin', adminProducts);
}
```

### レスポンスヘルパー（kikaku-os独自）

```typescript
// apps/api/src/lib/http.ts
export function jsonOk<T>(data: T, status: number = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function jsonError(message: string, status: number = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// 使用例
app.get('/products/:id', async (c) => {
  const product = await getProduct(c.env.DB, c.req.param('id'));
  if (!product) {
    return jsonError('Product not found', 404);
  }
  return jsonOk(product);
});
```

## D1 Database Patterns

### プリペアドステートメント（必須）

```typescript
// ❌ 間違い: SQL injection vulnerable
const id = c.req.param('id');
const result = await db.prepare(`SELECT * FROM products WHERE id = ${id}`).all();

// ✅ 正しい: プリペアドステートメント
const id = c.req.param('id');
const result = await db.prepare('SELECT * FROM products WHERE id = ?')
  .bind(id)
  .all();
```

### CRUD Operations

```typescript
// CREATE
const insert = await db.prepare(
  'INSERT INTO products (name, price, stock) VALUES (?, ?, ?)'
).bind(name, price, stock).run();
const newId = insert.meta.last_row_id;

// READ (単一)
const product = await db.prepare(
  'SELECT * FROM products WHERE id = ?'
).bind(id).first();

// READ (複数)
const products = await db.prepare(
  'SELECT * FROM products WHERE category = ? ORDER BY name'
).bind(category).all();

// UPDATE
const update = await db.prepare(
  'UPDATE products SET stock = ? WHERE id = ?'
).bind(newStock, id).run();
const affectedRows = update.meta.changes;

// DELETE
const del = await db.prepare(
  'DELETE FROM products WHERE id = ?'
).bind(id).run();
```

### トランザクション

```typescript
// D1はトランザクションをサポート
const results = await db.batch([
  db.prepare('INSERT INTO orders (customer_id, total) VALUES (?, ?)')
    .bind(customerId, total),
  db.prepare('UPDATE inventory SET stock = stock - ? WHERE product_id = ?')
    .bind(quantity, productId),
  db.prepare('INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)')
    .bind(orderId, productId, quantity)
]);

// すべて成功 or すべてロールバック
```

### ページネーション

```typescript
app.get('/products', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = (page - 1) * limit;

  const products = await c.env.DB.prepare(
    'SELECT * FROM products ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(limit, offset).all();

  const total = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM products'
  ).first();

  return c.json({
    data: products.results,
    pagination: {
      page,
      limit,
      total: total.count,
      totalPages: Math.ceil(total.count / limit)
    }
  });
});
```

## R2 Storage Patterns

### ファイルアップロード

```typescript
app.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return jsonError('No file provided', 400);
  }

  const key = `receipts/${Date.now()}-${file.name}`;

  await c.env.ARTIFACTS.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type
    }
  });

  return jsonOk({ key, url: `/r2?key=${key}` });
});
```

### ファイル取得

```typescript
app.get('/r2', async (c) => {
  const key = c.req.query('key');
  if (!key) {
    return jsonError('Missing key parameter', 400);
  }

  const object = await c.env.ARTIFACTS.get(key);
  if (!object) {
    return jsonError('File not found', 404);
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': object.size.toString()
    }
  });
});
```

### ファイル一覧

```typescript
app.get('/r2/list', async (c) => {
  const prefix = c.req.query('prefix') || '';

  const list = await c.env.ARTIFACTS.list({
    prefix,
    limit: 100
  });

  return c.json({
    objects: list.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded
    })),
    truncated: list.truncated
  });
});
```

## 環境バインディング

### 型定義（apps/api/src/env.ts）

```typescript
export interface Env {
  // Database
  DB: D1Database;

  // R2 Buckets
  ARTIFACTS: R2Bucket;

  // Environment Variables
  ADMIN_API_KEY: string;
  DEV_MODE: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STOREFRONT_BASE_URL: string;

  // Optional
  ENABLE_BANK_TRANSFER?: string;
  SHIPPING_FEE_AMOUNT?: string;
  FREE_SHIPPING_THRESHOLD?: string;
}
```

### アクセス方法

```typescript
app.post('/admin/products', async (c) => {
  // Environment variables
  const devMode = c.env.DEV_MODE === 'true';

  // D1 Database
  const db = c.env.DB;

  // R2 Bucket
  const bucket = c.env.ARTIFACTS;

  // ...
});
```

## 認証パターン

### Admin API Key（kikaku-os方式）

```typescript
// Middleware
const adminAuth = async (c: Context<Env>, next: Next) => {
  const apiKey = c.req.header('x-admin-key');

  if (!apiKey || apiKey !== c.env.ADMIN_API_KEY) {
    return jsonError('Unauthorized', 401);
  }

  await next();
};

// 適用
app.use('/admin/*', adminAuth);
app.get('/admin/products', async (c) => {
  // 認証済み
});
```

### Stripe Webhook署名検証

```typescript
import Stripe from 'stripe';

app.post('/webhooks/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  const body = await c.req.text();

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature!,
      c.env.STRIPE_WEBHOOK_SECRET
    );

    // Process event
    switch (event.type) {
      case 'payment_intent.succeeded':
        // Handle payment
        break;
    }

    return c.json({ received: true });
  } catch (err) {
    return jsonError('Webhook signature verification failed', 400);
  }
});
```

## エラーハンドリング

### グローバルエラーハンドラー

```typescript
app.onError((err, c) => {
  console.error('Error:', err);

  if (err instanceof SyntaxError) {
    return jsonError('Invalid JSON', 400);
  }

  if (err instanceof TypeError) {
    return jsonError('Invalid request', 400);
  }

  return jsonError('Internal server error', 500);
});
```

### Try-Catch パターン

```typescript
app.get('/products/:id', async (c) => {
  try {
    const product = await c.env.DB.prepare(
      'SELECT * FROM products WHERE id = ?'
    ).bind(c.req.param('id')).first();

    if (!product) {
      return jsonError('Product not found', 404);
    }

    return jsonOk(product);
  } catch (error) {
    console.error('Failed to fetch product:', error);
    return jsonError('Failed to fetch product', 500);
  }
});
```

## CORS設定

```typescript
import { cors } from 'hono/cors';

app.use('*', cors({
  origin: (origin) => {
    const allowed = [
      'http://localhost:4321',
      'http://127.0.0.1:4321',
      'https://your-domain.com'
    ];
    return allowed.includes(origin) ? origin : allowed[0];
  },
  credentials: true
}));
```

## Cron Triggers（kikaku-os日次締め）

```typescript
// wrangler.toml
[triggers]
crons = ["0 0 * * *"]  # 毎日午前0時

// src/index.ts
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // 日次締め処理
    const date = new Date().toISOString().split('T')[0];

    // Generate report
    // Store artifacts in R2
    // Create ledger entries
    // Check for anomalies

    console.log(`Daily close completed for ${date}`);
  }
};
```

## ベストプラクティス

### 1. Immutability

```typescript
// ❌ 間違い: Mutation
function updateProduct(product: Product, price: number) {
  product.price = price;  // Mutation!
  return product;
}

// ✅ 正しい: Immutability
function updateProduct(product: Product, price: number) {
  return {
    ...product,
    price
  };
}
```

### 2. 入力バリデーション

```typescript
import { z } from 'zod';

const ProductSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.number().int().min(0),
  stock: z.number().int().min(0)
});

app.post('/products', async (c) => {
  const body = await c.req.json();

  const validated = ProductSchema.parse(body);

  // Use validated data
});
```

### 3. エラーログ

```typescript
try {
  // Operation
} catch (error) {
  console.error('Operation failed:', {
    error: error.message,
    stack: error.stack,
    context: { productId, userId }
  });
  throw error;
}
```

### 4. レスポンス一貫性

```typescript
// 成功レスポンス
return c.json({
  data: result,
  meta: { timestamp: Date.now() }
});

// エラーレスポンス
return c.json({
  error: 'Error message',
  code: 'ERROR_CODE'
}, 400);
```

## パフォーマンス

### 1. Prepared Statement再利用

```typescript
// ❌ 非効率: 毎回prepare
for (const id of ids) {
  await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
}

// ✅ 効率的: Batch処理
const stmt = db.prepare('SELECT * FROM products WHERE id = ?');
const results = await db.batch(ids.map(id => stmt.bind(id)));
```

### 2. 並列処理

```typescript
// ❌ 遅い: 逐次処理
const product = await getProduct(id);
const reviews = await getReviews(id);
const inventory = await getInventory(id);

// ✅ 速い: 並列処理
const [product, reviews, inventory] = await Promise.all([
  getProduct(id),
  getReviews(id),
  getInventory(id)
]);
```

### 3. ページネーション（必須）

```typescript
// ❌ 危険: 全件取得
const products = await db.prepare('SELECT * FROM products').all();

// ✅ 安全: ページネーション
const products = await db.prepare(
  'SELECT * FROM products LIMIT ? OFFSET ?'
).bind(limit, offset).all();
```

## 参考資料

- [Hono Documentation](https://hono.dev/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
