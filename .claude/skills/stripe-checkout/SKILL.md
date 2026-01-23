---
name: stripe-checkout
description: Stripe決済フロー（Embedded Checkout）の実装パターン
---

# Stripe決済フロー

## アーキテクチャ

- **Embedded Checkout**: Stripe Elements（PaymentIntent API）を使用
- **銀行振込**: `jp_bank_transfer` 支払い方法（Stripeダッシュボードで有効化）
- **Webhook**: Stripeイベントを `/webhooks/stripe` で受信し、注文・支払いを同期

## 決済フロー

1. **カート** - LocalStorage永続化、複数商品対応
2. **PaymentIntent作成** - `POST /payments/create-intent` で作成
3. **Stripe Elements** - `/checkout` ページで埋め込み型決済フォーム表示
4. **支払い確定** - `POST /payments/confirm` で確定
5. **Webhook同期** - `payment_intent.succeeded` イベントで注文確定

## 主要エンドポイント

### チェックアウト・決済
- `POST /checkout/session` - Stripeチェックアウトセッション作成（Legacy）
- `POST /payments/create-intent` - PaymentIntent作成（Embedded Checkout）
- `POST /payments/confirm` - 支払い確定
- `GET /payments/:id` - 支払い詳細取得
- `POST /webhooks/stripe` - Stripeウェブフック受信

## 環境変数

- `STRIPE_SECRET_KEY`: Stripe秘密鍵
- `STRIPE_PUBLISHABLE_KEY`: Stripe公開鍵（Embedded Checkout用）
- `STRIPE_WEBHOOK_SECRET`: Stripeウェブフック署名検証用
- `STOREFRONT_BASE_URL`: ストアフロントURL（決済完了後のリダイレクト先）

## ローカルテスト

Stripe CLIでWebhookを転送:
```bash
stripe listen --forward-to http://localhost:8787/webhooks/stripe
```

テストカード番号:
- 成功: `4242 4242 4242 4242`
- 3Dセキュア: `4000 0027 6000 3184`

## 実装パターン

### PaymentIntent作成（API側）
```typescript
import Stripe from 'stripe'

const stripe = new Stripe(env.STRIPE_SECRET_KEY)
const paymentIntent = await stripe.paymentIntents.create({
  amount: totalAmount,
  currency: 'jpy',
  payment_method_types: ['card', 'jp_bank_transfer'],
  metadata: { orderId: order.id }
})
```

### Stripe Elements（フロント側）
```typescript
const stripe = await loadStripe(publicKey)
const elements = stripe.elements({ clientSecret })
const paymentElement = elements.create('payment')
paymentElement.mount('#payment-element')
```

### Webhook処理
```typescript
const sig = c.req.header('stripe-signature')
const event = stripe.webhooks.constructEvent(body, sig, webhookSecret)

if (event.type === 'payment_intent.succeeded') {
  const paymentIntent = event.data.object
  // 注文を確定
}
```

## 重要な設計ポイント

- **Stripeが正**: 財務データはStripeをソースとし、Webhookで同期
- **冪等性**: Webhook重複受信に備え、`stripe_event_id` でイベント処理済みを記録
- **証跡保存**: 決済完了後、レシートをR2に保存
