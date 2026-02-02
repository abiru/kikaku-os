import { callClaudeAPI, type ClaudeMessage } from './claudeClient';
import { trackAIUsage, checkRateLimit } from './rateLimiter';

type Bindings = {
  DB: D1Database;
  CLAUDE_API_KEY?: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
};

export interface InboxTriageResult {
  classification: 'urgent' | 'normal' | 'low';
  suggestedAction: string;
  reasoning: string;
}

/**
 * Automatically triage inbox items using AI
 */
export async function triageInboxItem(
  env: Bindings,
  inboxItemId: number
): Promise<InboxTriageResult> {
  const { DB, CLAUDE_API_KEY } = env;

  if (!CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY not configured');
  }

  // Check rate limit
  const rateCheck = await checkRateLimit(DB, 'claude', 'inbox_triage');
  if (!rateCheck.allowed) {
    throw new Error(`Rate limit exceeded. ${rateCheck.remaining}/${rateCheck.limit} remaining.`);
  }

  // Fetch inbox item
  const item = await DB.prepare(
    `SELECT id, title, body, severity, kind, date, metadata FROM inbox_items WHERE id = ?`
  ).bind(inboxItemId).first<{
    id: number;
    title: string;
    body: string | null;
    severity: string;
    kind: string | null;
    date: string | null;
    metadata: string | null;
  }>();

  if (!item) {
    throw new Error('Inbox item not found');
  }

  // Build triage prompt
  const prompt = `あなたは経験豊富なカスタマーサポートマネージャーです。以下のInbox項目を分析し、優先度を判定してください。

**Inbox項目:**
- タイトル: ${item.title}
- 内容: ${item.body || 'なし'}
- 現在の深刻度: ${item.severity}
- 種類: ${item.kind || '未分類'}
- 日付: ${item.date || '未指定'}

**判定基準:**
- urgent: 即座の対応が必要（システム障害、支払い問題、顧客クレーム）
- normal: 通常の業務フロー内で対応（日次レポート、在庫アラート）
- low: 優先度が低い（情報提供、軽微な通知）

JSON形式で出力してください:
{
  "classification": "urgent" | "normal" | "low",
  "suggestedAction": "推奨される次のアクション（50文字以内）",
  "reasoning": "判定理由（100文字以内）"
}`;

  const messages: ClaudeMessage[] = [
    { role: 'user', content: prompt }
  ];

  // Call Claude API
  const startTime = Date.now();
  const response = await callClaudeAPI(CLAUDE_API_KEY, {
    messages,
    max_tokens: 512,
    temperature: 0.3, // Lower temperature for more consistent classification
  }, {
    AI_GATEWAY_ACCOUNT_ID: env.AI_GATEWAY_ACCOUNT_ID,
    AI_GATEWAY_ID: env.AI_GATEWAY_ID,
  });
  const processingTime = Date.now() - startTime;

  const rawText = response.content[0]?.text || '';

  // Parse JSON response
  let result: InboxTriageResult;
  try {
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/```\n?([\s\S]*?)\n?```/);
    const jsonText = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
    result = JSON.parse(jsonText) as InboxTriageResult;
  } catch (parseErr) {
    console.error('Failed to parse triage result:', parseErr);
    throw new Error(`Failed to parse AI response: ${(parseErr as Error).message}`);
  }

  // Update inbox item metadata
  const currentMeta = item.metadata ? JSON.parse(item.metadata) : {};
  const updatedMeta = {
    ...currentMeta,
    ai_triage: {
      classification: result.classification,
      suggestedAction: result.suggestedAction,
      reasoning: result.reasoning,
      triaged_at: new Date().toISOString(),
    },
  };

  await DB.prepare(
    `UPDATE inbox_items SET metadata = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(JSON.stringify(updatedMeta), inboxItemId).run();

  // Track usage
  await trackAIUsage(DB, 'claude', 'inbox_triage', response.usage.total_tokens);

  // Log workflow
  await DB.prepare(
    `INSERT INTO ai_workflow_logs (workflow_type, trigger, input_data, ai_response, action_taken, status, tokens_used, processing_time_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(
    'inbox_triage',
    'manual',
    JSON.stringify({ inboxItemId, title: item.title }),
    JSON.stringify(result),
    'metadata_updated',
    'success',
    response.usage.total_tokens,
    processingTime
  ).run();

  return result;
}

/**
 * Draft customer inquiry response
 */
export async function draftCustomerResponse(
  env: Bindings,
  orderId: number,
  customerMessage: string
): Promise<{ inboxItemId: number; draftContent: string }> {
  const { DB, CLAUDE_API_KEY } = env;

  if (!CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY not configured');
  }

  // Check rate limit
  const rateCheck = await checkRateLimit(DB, 'claude', 'customer_inquiry');
  if (!rateCheck.allowed) {
    throw new Error(`Rate limit exceeded. ${rateCheck.remaining}/${rateCheck.limit} remaining.`);
  }

  // Fetch order details
  const order = await DB.prepare(
    `SELECT o.id, o.status, o.total_net, o.currency, c.name, c.email
     FROM orders o
     LEFT JOIN customers c ON o.customer_id = c.id
     WHERE o.id = ?`
  ).bind(orderId).first<{
    id: number;
    status: string;
    total_net: number;
    currency: string;
    name: string;
    email: string;
  }>();

  if (!order) {
    throw new Error('Order not found');
  }

  // Build response prompt
  const prompt = `あなたはプロのカスタマーサポート担当者です。以下の顧客からの問い合わせに対する返信メールの下書きを日本語で作成してください。

**顧客情報:**
- 名前: ${order.name}
- 注文番号: ${order.id}
- 注文状況: ${order.status}
- 合計金額: ${order.total_net} ${order.currency}

**問い合わせ内容:**
${customerMessage}

**返信要件:**
- 丁寧で親しみやすいトーン
- 問い合わせに対する明確な回答
- 必要に応じて次のステップを案内
- お問い合わせ先の明記

JSON形式で出力してください:
{
  "subject": "件名",
  "body": "メール本文"
}`;

  const messages: ClaudeMessage[] = [
    { role: 'user', content: prompt }
  ];

  // Call Claude API
  const startTime = Date.now();
  const response = await callClaudeAPI(CLAUDE_API_KEY, {
    messages,
    max_tokens: 1024,
    temperature: 0.7,
  }, {
    AI_GATEWAY_ACCOUNT_ID: env.AI_GATEWAY_ACCOUNT_ID,
    AI_GATEWAY_ID: env.AI_GATEWAY_ID,
  });
  const processingTime = Date.now() - startTime;

  const rawText = response.content[0]?.text || '';

  // Parse JSON response
  let emailDraft: { subject: string; body: string };
  try {
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/```\n?([\s\S]*?)\n?```/);
    const jsonText = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
    emailDraft = JSON.parse(jsonText) as { subject: string; body: string };
  } catch (parseErr) {
    console.error('Failed to parse email draft:', parseErr);
    throw new Error(`Failed to parse AI response: ${(parseErr as Error).message}`);
  }

  // Create Inbox item for approval
  const inboxResult = await DB.prepare(
    `INSERT INTO inbox_items (title, body, severity, status, kind, metadata, created_at, updated_at)
     VALUES (?, ?, ?, 'open', 'ai_email_draft', ?, datetime('now'), datetime('now'))`
  ).bind(
    `メール下書き: ${emailDraft.subject}`,
    `顧客への返信メールの下書きを確認して送信してください。\n\n件名: ${emailDraft.subject}\n\n${emailDraft.body}`,
    'info',
    JSON.stringify({
      orderId,
      customerEmail: order.email,
      subject: emailDraft.subject,
      body: emailDraft.body,
    })
  ).run();

  const inboxItemId = inboxResult.meta.last_row_id || 0;

  // Track usage
  await trackAIUsage(DB, 'claude', 'customer_inquiry', response.usage.total_tokens);

  // Log workflow
  await DB.prepare(
    `INSERT INTO ai_workflow_logs (workflow_type, trigger, input_data, ai_response, action_taken, status, tokens_used, processing_time_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(
    'customer_inquiry',
    'manual',
    JSON.stringify({ orderId, customerMessage }),
    JSON.stringify({ preview: emailDraft.subject }),
    'inbox_created',
    'success',
    response.usage.total_tokens,
    processingTime
  ).run();

  return {
    inboxItemId,
    draftContent: `${emailDraft.subject}\n\n${emailDraft.body}`,
  };
}
