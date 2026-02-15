import type { Ai, AiTextGenerationInput, AiEmbeddingsInput } from '../../env';
import { MODELS } from './modelRouter';
import { extractJSON } from '../../lib/json';

/**
 * Workers AI text generation response
 */
export interface WorkersAITextResponse {
  response: string;
}

/**
 * Workers AI embeddings response
 */
export interface WorkersAIEmbeddingsResponse {
  shape: number[];
  data: number[][];
}

/**
 * Chat message format for Workers AI
 */
export interface WorkersAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Options for text generation
 */
export interface TextGenerationOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * Normalized response from Workers AI text generation
 */
export interface NormalizedTextResponse {
  text: string;
  model: string;
  provider: 'workers_ai';
}

/**
 * Normalized response from Workers AI embeddings
 */
export interface NormalizedEmbeddingsResponse {
  embeddings: number[][];
  model: string;
  provider: 'workers_ai';
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Workers AI Llama 3.1 for text generation
 */
export async function callLlama(
  ai: Ai,
  prompt: string,
  options: TextGenerationOptions = {}
): Promise<NormalizedTextResponse> {
  const { maxTokens = 512, temperature = 0.3, systemPrompt } = options;

  const messages: WorkersAIChatMessage[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push({ role: 'user', content: prompt });

  const input: AiTextGenerationInput = {
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.run<WorkersAITextResponse>(
        MODELS.WORKERS_AI.LLAMA_3_1_8B,
        input
      );

      if (!response || typeof response.response !== 'string') {
        throw new Error('Invalid Workers AI response structure');
      }

      return {
        text: response.response,
        model: MODELS.WORKERS_AI.LLAMA_3_1_8B,
        provider: 'workers_ai',
      };
    } catch (error) {
      console.error(
        `Workers AI Llama attempt ${attempt}/${MAX_RETRIES} failed:`,
        error
      );
      lastError = error as Error;

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw new Error(
    `Workers AI Llama failed after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

/**
 * Call Workers AI Llama 3.1 for text generation with chat messages
 */
export async function callLlamaChat(
  ai: Ai,
  messages: WorkersAIChatMessage[],
  options: Omit<TextGenerationOptions, 'systemPrompt'> = {}
): Promise<NormalizedTextResponse> {
  const { maxTokens = 512, temperature = 0.3 } = options;

  const input: AiTextGenerationInput = {
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.run<WorkersAITextResponse>(
        MODELS.WORKERS_AI.LLAMA_3_1_8B,
        input
      );

      if (!response || typeof response.response !== 'string') {
        throw new Error('Invalid Workers AI response structure');
      }

      return {
        text: response.response,
        model: MODELS.WORKERS_AI.LLAMA_3_1_8B,
        provider: 'workers_ai',
      };
    } catch (error) {
      console.error(
        `Workers AI Llama chat attempt ${attempt}/${MAX_RETRIES} failed:`,
        error
      );
      lastError = error as Error;

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw new Error(
    `Workers AI Llama chat failed after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

/**
 * Call Workers AI Llama and parse JSON response
 */
export async function callLlamaForJSON<T>(
  ai: Ai,
  prompt: string,
  options: TextGenerationOptions = {}
): Promise<{ data: T; rawText: string }> {
  const response = await callLlama(ai, prompt, options);
  const jsonText = extractJSON(response.text);

  try {
    const data = JSON.parse(jsonText) as T;
    return {
      data,
      rawText: response.text,
    };
  } catch (parseError) {
    throw new Error(
      `Failed to parse JSON from Workers AI response: ${(parseError as Error).message}\n\nRaw text: ${response.text}`
    );
  }
}

/**
 * Generate embeddings using Workers AI BGE model
 */
export async function generateEmbeddings(
  ai: Ai,
  texts: string | string[]
): Promise<NormalizedEmbeddingsResponse> {
  const textArray = Array.isArray(texts) ? texts : [texts];

  const input: AiEmbeddingsInput = {
    text: textArray,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.run<WorkersAIEmbeddingsResponse>(
        MODELS.WORKERS_AI.BGE_BASE_EN,
        input
      );

      if (!response || !Array.isArray(response.data)) {
        throw new Error('Invalid Workers AI embeddings response structure');
      }

      return {
        embeddings: response.data,
        model: MODELS.WORKERS_AI.BGE_BASE_EN,
        provider: 'workers_ai',
      };
    } catch (error) {
      console.error(
        `Workers AI BGE attempt ${attempt}/${MAX_RETRIES} failed:`,
        error
      );
      lastError = error as Error;

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw new Error(
    `Workers AI embeddings failed after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

/**
 * Estimate tokens from text (rough approximation)
 * For tracking purposes only - Workers AI doesn't return token counts
 */
export function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters for English
  // For Japanese, it's closer to 1 token ≈ 1-2 characters
  const hasJapanese = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(text);

  if (hasJapanese) {
    return Math.ceil(text.length / 1.5);
  }

  return Math.ceil(text.length / 4);
}
