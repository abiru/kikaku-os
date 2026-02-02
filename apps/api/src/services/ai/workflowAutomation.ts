import { callClaudeAPI, type ClaudeMessage } from './claudeClient';
import { trackAIUsage, checkRateLimit } from './rateLimiter';
import {
  selectModel,
  AITaskType,
  AIProvider,
  type AIBindings,
} from './modelRouter';
import { callLlamaForJSON, estimateTokens } from './workersAIClient';
import type { Ai } from '../../env';

type Bindings = {
  DB: D1Database;
  AI?: Ai;
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
 * Extended triage result with provider info for tracking
 */
interface TriageResultWithMeta extends InboxTriageResult {
  provider: AIProvider;
  model: string;
  tokens: number;
  processingTimeMs: number;
}

/**
 * Build optimized prompt for triage (works with both Llama and Claude)
 * Simpler format for lightweight models
 */
function buildTriagePrompt(item: {
  title: string;
  body: string | null;
  severity: string;
  kind: string | null;
  date: string | null;
}): string {
  return `Classify this inbox item priority. Respond ONLY with valid JSON.

Item:
- Title: ${item.title}
- Content: ${item.body || 'None'}
- Current Severity: ${item.severity}
- Type: ${item.kind || 'Unclassified'}
- Date: ${item.date || 'Not specified'}

Classification rules:
- "urgent": Immediate action needed (system failure, payment issues, customer complaints)
- "normal": Handle in regular workflow (daily reports, inventory alerts)
- "low": Low priority (informational, minor notifications)

Respond with this exact JSON format:
{"classification":"urgent|normal|low","suggestedAction":"next action (max 50 chars)","reasoning":"why (max 100 chars)"}`;
}

/**
 * Triage using Workers AI (Llama 3.1)
 */
async function triageWithWorkersAI(
  ai: Ai,
  prompt: string
): Promise<{ result: InboxTriageResult; tokens: number; rawText: string }> {
  const { data, rawText } = await callLlamaForJSON<InboxTriageResult>(
    ai,
    prompt,
    {
      maxTokens: 256,
      temperature: 0.2,
      systemPrompt:
        'You are a customer support priority classifier. Output only valid JSON.',
    }
  );

  // Validate and normalize classification
  const validClassifications = ['urgent', 'normal', 'low'] as const;
  const normalizedClassification = validClassifications.includes(
    data.classification as (typeof validClassifications)[number]
  )
    ? data.classification
    : 'normal';

  return {
    result: {
      classification: normalizedClassification,
      suggestedAction: String(data.suggestedAction || '').slice(0, 50),
      reasoning: String(data.reasoning || '').slice(0, 100),
    },
    tokens: estimateTokens(prompt) + estimateTokens(rawText),
    rawText,
  };
}

/**
 * Triage using Claude API (fallback for high-quality results)
 */
async function triageWithClaude(
  apiKey: string,
  prompt: string,
  gatewayConfig?: { AI_GATEWAY_ACCOUNT_ID?: string; AI_GATEWAY_ID?: string }
): Promise<{ result: InboxTriageResult; tokens: number; rawText: string }> {
  const messages: ClaudeMessage[] = [{ role: 'user', content: prompt }];

  const response = await callClaudeAPI(
    apiKey,
    {
      messages,
      max_tokens: 512,
      temperature: 0.3,
    },
    gatewayConfig
  );

  const rawText = response.content[0]?.text || '';

  // Parse JSON response
  const jsonMatch =
    rawText.match(/```json\n?([\s\S]*?)\n?```/) ||
    rawText.match(/```\n?([\s\S]*?)\n?```/);
  const jsonText = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
  const data = JSON.parse(jsonText) as InboxTriageResult;

  return {
    result: {
      classification: data.classification,
      suggestedAction: String(data.suggestedAction || '').slice(0, 50),
      reasoning: String(data.reasoning || '').slice(0, 100),
    },
    tokens: response.usage.total_tokens,
    rawText,
  };
}

/**
 * Automatically triage inbox items using AI
 * Uses Workers AI (Llama 3.1) as primary, falls back to Claude on error
 */
export async function triageInboxItem(
  env: Bindings,
  inboxItemId: number
): Promise<InboxTriageResult> {
  const { DB } = env;

  // Select model based on available providers
  const aiBindings: AIBindings = {
    AI: env.AI,
    CLAUDE_API_KEY: env.CLAUDE_API_KEY,
    AI_GATEWAY_ACCOUNT_ID: env.AI_GATEWAY_ACCOUNT_ID,
    AI_GATEWAY_ID: env.AI_GATEWAY_ID,
  };

  const modelSelection = selectModel(AITaskType.TRIAGE, aiBindings);

  // Check rate limit for the selected provider
  const providerKey =
    modelSelection.provider === AIProvider.WORKERS_AI ? 'workers_ai' : 'claude';
  const rateCheck = await checkRateLimit(DB, providerKey, 'inbox_triage');
  if (!rateCheck.allowed) {
    throw new Error(
      `Rate limit exceeded. ${rateCheck.remaining}/${rateCheck.limit} remaining.`
    );
  }

  // Fetch inbox item
  const item = await DB.prepare(
    `SELECT id, title, body, severity, kind, date, metadata FROM inbox_items WHERE id = ?`
  )
    .bind(inboxItemId)
    .first<{
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

  const prompt = buildTriagePrompt(item);
  const startTime = Date.now();

  let triageResult: TriageResultWithMeta;

  // Try primary provider first
  if (
    modelSelection.provider === AIProvider.WORKERS_AI &&
    env.AI
  ) {
    try {
      const { result, tokens } = await triageWithWorkersAI(
        env.AI,
        prompt
      );
      triageResult = {
        ...result,
        provider: AIProvider.WORKERS_AI,
        model: modelSelection.model,
        tokens,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Workers AI triage failed, attempting fallback:', error);

      // Fallback to Claude if available
      if (modelSelection.canFallback && env.CLAUDE_API_KEY) {
        const { result, tokens } = await triageWithClaude(
          env.CLAUDE_API_KEY,
          prompt,
          {
            AI_GATEWAY_ACCOUNT_ID: env.AI_GATEWAY_ACCOUNT_ID,
            AI_GATEWAY_ID: env.AI_GATEWAY_ID,
          }
        );
        triageResult = {
          ...result,
          provider: AIProvider.CLAUDE,
          model: modelSelection.fallbackModel || 'claude-sonnet',
          tokens,
          processingTimeMs: Date.now() - startTime,
        };
      } else {
        throw error;
      }
    }
  } else if (env.CLAUDE_API_KEY) {
    // Use Claude directly
    const { result, tokens } = await triageWithClaude(
      env.CLAUDE_API_KEY,
      prompt,
      {
        AI_GATEWAY_ACCOUNT_ID: env.AI_GATEWAY_ACCOUNT_ID,
        AI_GATEWAY_ID: env.AI_GATEWAY_ID,
      }
    );
    triageResult = {
      ...result,
      provider: AIProvider.CLAUDE,
      model: modelSelection.model,
      tokens,
      processingTimeMs: Date.now() - startTime,
    };
  } else {
    throw new Error('No AI provider available for triage');
  }

  // Update inbox item metadata
  const currentMeta = item.metadata ? JSON.parse(item.metadata) : {};
  const updatedMeta = {
    ...currentMeta,
    ai_triage: {
      classification: triageResult.classification,
      suggestedAction: triageResult.suggestedAction,
      reasoning: triageResult.reasoning,
      triaged_at: new Date().toISOString(),
      provider: triageResult.provider,
      model: triageResult.model,
    },
  };

  await DB.prepare(
    `UPDATE inbox_items SET metadata = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(JSON.stringify(updatedMeta), inboxItemId)
    .run();

  // Track usage
  await trackAIUsage(
    DB,
    triageResult.provider === AIProvider.WORKERS_AI ? 'workers_ai' : 'claude',
    'inbox_triage',
    triageResult.tokens
  );

  // Log workflow
  await DB.prepare(
    `INSERT INTO ai_workflow_logs (workflow_type, trigger, input_data, ai_response, action_taken, status, tokens_used, processing_time_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      'inbox_triage',
      'manual',
      JSON.stringify({
        inboxItemId,
        title: item.title,
        provider: triageResult.provider,
      }),
      JSON.stringify({
        classification: triageResult.classification,
        suggestedAction: triageResult.suggestedAction,
        reasoning: triageResult.reasoning,
      }),
      'metadata_updated',
      'success',
      triageResult.tokens,
      triageResult.processingTimeMs
    )
    .run();

  return {
    classification: triageResult.classification,
    suggestedAction: triageResult.suggestedAction,
    reasoning: triageResult.reasoning,
  };
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
