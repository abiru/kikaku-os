-- Email templates table for customizable notification emails
CREATE TABLE email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    variables TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for quick lookup by slug
CREATE INDEX idx_email_templates_slug ON email_templates(slug);

-- Seed default templates
INSERT INTO email_templates (slug, name, subject, body_html, body_text, variables) VALUES
(
    'order-confirmation',
    '注文確認メール',
    'ご注文ありがとうございます - 注文番号: {{order_number}}',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1a1a2e; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .order-details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ご注文ありがとうございます</h1>
    </div>
    <div class="content">
        <p>{{customer_name}} 様</p>
        <p>この度はご注文いただき、誠にありがとうございます。</p>
        <div class="order-details">
            <p><strong>注文番号:</strong> {{order_number}}</p>
            <p><strong>注文日:</strong> {{order_date}}</p>
            <p><strong>合計金額:</strong> ¥{{total_amount}}</p>
        </div>
        <p>商品の発送準備が整い次第、発送通知メールをお送りいたします。</p>
    </div>
    <div class="footer">
        <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>
    </div>
</body>
</html>',
    '{{customer_name}} 様

この度はご注文いただき、誠にありがとうございます。

注文番号: {{order_number}}
注文日: {{order_date}}
合計金額: ¥{{total_amount}}

商品の発送準備が整い次第、発送通知メールをお送りいたします。

ご不明な点がございましたら、お気軽にお問い合わせください。',
    '["customer_name", "order_number", "order_date", "total_amount"]'
),
(
    'shipping-notification',
    '発送通知メール',
    '商品を発送しました - 注文番号: {{order_number}}',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1a1a2e; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .tracking { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>商品を発送しました</h1>
    </div>
    <div class="content">
        <p>{{customer_name}} 様</p>
        <p>ご注文いただいた商品を発送いたしました。</p>
        <div class="tracking">
            <p><strong>注文番号:</strong> {{order_number}}</p>
            <p><strong>配送業者:</strong> {{carrier}}</p>
            <p><strong>追跡番号:</strong> {{tracking_number}}</p>
        </div>
        <p>お届けまでしばらくお待ちください。</p>
    </div>
    <div class="footer">
        <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>
    </div>
</body>
</html>',
    '{{customer_name}} 様

ご注文いただいた商品を発送いたしました。

注文番号: {{order_number}}
配送業者: {{carrier}}
追跡番号: {{tracking_number}}

お届けまでしばらくお待ちください。

ご不明な点がございましたら、お気軽にお問い合わせください。',
    '["customer_name", "order_number", "carrier", "tracking_number"]'
),
(
    'payment-failed',
    '支払い失敗通知',
    '【重要】お支払いの確認ができませんでした',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .alert { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>お支払いの確認ができませんでした</h1>
    </div>
    <div class="content">
        <p>{{customer_name}} 様</p>
        <div class="alert">
            <p>注文番号 {{order_number}} のお支払いを確認できませんでした。</p>
            <p>お手数ですが、お支払い方法をご確認の上、再度ご注文ください。</p>
        </div>
    </div>
    <div class="footer">
        <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>
    </div>
</body>
</html>',
    '{{customer_name}} 様

注文番号 {{order_number}} のお支払いを確認できませんでした。

お手数ですが、お支払い方法をご確認の上、再度ご注文ください。

ご不明な点がございましたら、お気軽にお問い合わせください。',
    '["customer_name", "order_number"]'
);
