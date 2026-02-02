import { callClaudeAPI, type ClaudeMessage } from './claudeClient';
import { trackAIUsage, checkRateLimit } from './rateLimiter';

type Bindings = {
  DB: D1Database;
  CLAUDE_API_KEY?: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
};

export interface ContentGenerationRequest {
  contentType: 'product_description' | 'email' | 'report_summary' | 'marketing_copy';
  refType?: string;
  refId?: number;
  prompt: string;
  context: Record<string, unknown>;
  temperature?: number;
}

export interface ContentGenerationResult {
  inboxItemId: number;
  draftId: number;
  preview: string;
}

/**
 * Build prompt for product description generation
 */
function buildProductDescriptionPrompt(productTitle: string, context: Record<string, unknown>): string {
  const tone = context.tone || 'professional';
  const length = context.length || 'medium';

  return `あなたはプロのコピーライターです。以下の商品の魅力的な説明文を日本語で生成してください。

商品名: ${productTitle}

要件:
- トーン: ${tone === 'professional' ? 'プロフェッショナル' : tone === 'casual' ? 'カジュアル' : 'テクニカル'}
- 長さ: ${length === 'short' ? '50-100文字' : length === 'medium' ? '150-300文字' : '300-500文字'}
- SEOを意識したキーワードの自然な配置
- 商品の特徴と利点を明確に
- 行動を促す文言を含める

JSON形式で出力してください:
{
  "description": "商品説明文",
  "keywords": ["キーワード1", "キーワード2", ...],
  "highlights": ["特徴1", "特徴2", ...]
}`;
}

/**
 * Build prompt for email generation
 */
function buildEmailPrompt(emailType: string, context: Record<string, unknown>): string {
  const customerName = context.customerName || 'お客様';
  const orderNumber = context.orderNumber || '';

  if (emailType === 'order_confirmation') {
    return `注文確認メールの本文を日本語で生成してください。

顧客名: ${customerName}
注文番号: ${orderNumber}

要件:
- 丁寧で親しみやすいトーン
- 注文内容の確認
- 次のステップの案内
- お問い合わせ方法の明記

JSON形式で出力:
{
  "subject": "件名",
  "body": "メール本文"
}`;
  }

  if (emailType === 'shipping_notification') {
    return `発送通知メールの本文を日本語で生成してください。

顧客名: ${customerName}
注文番号: ${orderNumber}
追跡番号: ${context.trackingNumber || ''}

要件:
- 発送完了の喜びを伝える
- 追跡情報の提供
- 到着予定日の案内
- お問い合わせ先の明記

JSON形式で出力:
{
  "subject": "件名",
  "body": "メール本文"
}`;
  }

  return context.customPrompt as string || '';
}

/**
 * Build prompt for report summary generation
 */
function buildReportSummaryPrompt(reportData: Record<string, unknown>): string {
  return `以下の日次レポートデータを分析し、重要なインサイトを日本語で要約してください。

レポートデータ:
${JSON.stringify(reportData, null, 2)}

要件:
- 主要な数値の変化
- 注目すべきトレンド
- 改善提案
- アクションアイテム

JSON形式で出力:
{
  "summary": "要約（200文字程度）",
  "insights": ["インサイト1", "インサイト2", ...],
  "recommendations": ["推奨事項1", "推奨事項2", ...]
}`;
}

/**
 * Build prompt for marketing copy generation
 */
function buildMarketingCopyPrompt(campaignType: string, context: Record<string, unknown>): string {
  return `${campaignType}のマーケティングコピーを日本語で生成してください。

商品/キャンペーン情報:
${JSON.stringify(context, null, 2)}

要件:
- キャッチーで記憶に残る
- ターゲット層に響く言葉選び
- 行動を促す強いCTA
- ブランドイメージに合致

JSON形式で出力:
{
  "headline": "メインコピー",
  "subheadline": "サブコピー",
  "cta": "行動喚起",
  "bodyText": "本文"
}`;
}

/**
 * Generate content using Claude API with Inbox pattern
 */
export async function generateContent(
  env: Bindings,
  request: ContentGenerationRequest
): Promise<ContentGenerationResult> {
  const { DB, CLAUDE_API_KEY } = env;

  if (!CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY not configured');
  }

  // Check rate limit
  const rateCheck = await checkRateLimit(DB, 'claude', 'content_generation');
  if (!rateCheck.allowed) {
    throw new Error(`Rate limit exceeded. Please try again later. (${rateCheck.remaining}/${rateCheck.limit} remaining)`);
  }

  // Build prompt based on content type
  let systemPrompt: string | undefined;
  let userPrompt = request.prompt;

  if (request.contentType === 'product_description' && request.context.productTitle) {
    systemPrompt = 'あなたはプロのコピーライターです。魅力的で効果的な商品説明文を作成するエキスパートです。';
    userPrompt = buildProductDescriptionPrompt(request.context.productTitle as string, request.context);
  } else if (request.contentType === 'email') {
    systemPrompt = 'あなたは経験豊富なカスタマーサポート担当者です。丁寧で親しみやすいメールを作成することができます。';
    userPrompt = buildEmailPrompt(request.context.emailType as string, request.context);
  } else if (request.contentType === 'report_summary') {
    systemPrompt = 'あなたはデータ分析のエキスパートです。複雑なデータから重要なインサイトを抽出し、わかりやすく要約することができます。';
    userPrompt = buildReportSummaryPrompt(request.context);
  } else if (request.contentType === 'marketing_copy') {
    systemPrompt = 'あなたはクリエイティブなマーケティングコピーライターです。記憶に残る魅力的な広告文を作成するプロフェッショナルです。';
    userPrompt = buildMarketingCopyPrompt(request.context.campaignType as string, request.context);
  }

  const messages: ClaudeMessage[] = [
    { role: 'user', content: userPrompt }
  ];

  // Call Claude API
  const startTime = Date.now();
  const response = await callClaudeAPI(CLAUDE_API_KEY, {
    messages,
    max_tokens: 2048,
    temperature: request.temperature || 0.7,
    system: systemPrompt || undefined,
  }, {
    AI_GATEWAY_ACCOUNT_ID: env.AI_GATEWAY_ACCOUNT_ID,
    AI_GATEWAY_ID: env.AI_GATEWAY_ID,
  });
  const processingTime = Date.now() - startTime;

  const generatedText = response.content[0]?.text || '';

  // Save draft to database
  const draftResult = await DB.prepare(
    `INSERT INTO ai_content_drafts
     (content_type, ref_type, ref_id, prompt, generated_content, model_used, tokens_used, generation_time_ms, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    request.contentType,
    request.refType || null,
    request.refId || null,
    userPrompt,
    generatedText,
    response.model,
    response.usage.total_tokens,
    processingTime,
    JSON.stringify(request.context)
  ).run();

  const draftId = draftResult.meta.last_row_id || 0;

  // Create Inbox item for human approval
  const inboxResult = await DB.prepare(
    `INSERT INTO inbox_items (title, body, severity, status, kind, metadata, created_at, updated_at)
     VALUES (?, ?, ?, 'open', 'ai_content_draft', ?, datetime('now'), datetime('now'))`
  ).bind(
    `AI生成コンテンツ: ${request.contentType}`,
    `AI が生成したコンテンツを確認して承認してください。`,
    'info',
    JSON.stringify({
      draftId,
      contentType: request.contentType,
      refType: request.refType,
      refId: request.refId,
    })
  ).run();

  const inboxItemId = inboxResult.meta.last_row_id || 0;

  // Track usage
  await trackAIUsage(DB, 'claude', 'content_generation', response.usage.total_tokens);

  // Log workflow
  await DB.prepare(
    `INSERT INTO ai_workflow_logs (workflow_type, trigger, input_data, ai_response, action_taken, status, tokens_used, processing_time_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(
    'content_generation',
    'manual',
    JSON.stringify(request),
    JSON.stringify({ preview: generatedText.substring(0, 200) }),
    'inbox_created',
    'success',
    response.usage.total_tokens,
    processingTime
  ).run();

  return {
    inboxItemId,
    draftId,
    preview: generatedText.substring(0, 200),
  };
}
