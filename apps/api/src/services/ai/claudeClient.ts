const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_RETRIES = 3;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeRequest {
  model?: string;
  messages: ClaudeMessage[];
  max_tokens: number;
  temperature?: number;
  system?: string;
}

export interface ClaudeResponse {
  id: string;
  model: string;
  content: Array<{ type: string; text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

/**
 * Extract JSON from text, handling markdown code blocks
 */
function extractJSON(text: string): string {
  // Try to extract from markdown code blocks
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/```\n?([\s\S]*?)\n?```/);

  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  // Return as-is if no code block found
  return text.trim();
}

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Claude API with retry logic and error handling
 */
export async function callClaudeAPI(
  apiKey: string,
  payload: ClaudeRequest
): Promise<ClaudeResponse> {
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY not configured');
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: payload.model || CLAUDE_MODEL,
          max_tokens: payload.max_tokens,
          messages: payload.messages,
          temperature: payload.temperature,
          system: payload.system,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // Handle rate limiting with exponential backoff
        if (response.status === 429) {
          if (attempt < MAX_RETRIES) {
            const backoffMs = 1000 * Math.pow(2, attempt - 1);
            console.warn(`Rate limited, retrying in ${backoffMs}ms...`);
            await sleep(backoffMs);
            continue;
          }
        }

        throw new Error(`Claude API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as ClaudeResponse;

      // Validate response structure
      if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
        throw new Error('Invalid response structure: missing content');
      }

      // Add total_tokens if not present (immutable pattern)
      if (data.usage && !data.usage.total_tokens) {
        return {
          ...data,
          usage: {
            ...data.usage,
            total_tokens: data.usage.input_tokens + data.usage.output_tokens,
          },
        };
      }

      return data;

    } catch (error) {
      console.error(`Claude API attempt ${attempt}/${MAX_RETRIES} failed:`, error);
      lastError = error as Error;

      if (attempt < MAX_RETRIES) {
        // Exponential backoff for other errors
        const backoffMs = 500 * attempt;
        await sleep(backoffMs);
      }
    }
  }

  throw new Error(`Failed to call Claude API after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

/**
 * Call Claude API and parse JSON response
 */
export async function callClaudeAPIForJSON<T>(
  apiKey: string,
  payload: ClaudeRequest
): Promise<{ data: T; rawText: string; usage: ClaudeResponse['usage'] }> {
  const response = await callClaudeAPI(apiKey, payload);
  const rawText = response.content[0]?.text || '';

  // Extract JSON from potential markdown formatting
  const jsonText = extractJSON(rawText);

  try {
    const data = JSON.parse(jsonText) as T;
    return {
      data,
      rawText,
      usage: response.usage,
    };
  } catch (parseError) {
    throw new Error(`Failed to parse JSON from Claude response: ${(parseError as Error).message}\n\nRaw text: ${rawText}`);
  }
}

/**
 * Estimate cost in cents for Claude API usage
 * Based on Claude Sonnet 4.5 pricing (as of 2026-01)
 */
export function estimateCost(tokens: number): number {
  // Approximate: $3 per 1M input tokens, $15 per 1M output tokens
  // Using average of $9 per 1M tokens for simplification
  const costPerMillionTokens = 900; // cents
  return Math.ceil((tokens / 1_000_000) * costPerMillionTokens);
}
