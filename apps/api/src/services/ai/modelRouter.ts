import type { Ai } from '../../env';

/**
 * AI task types that determine model selection
 */
export const AITaskType = {
  TRIAGE: 'triage',
  CLASSIFICATION: 'classification',
  TRANSLATION: 'translation',
  EMBEDDINGS: 'embeddings',
  CONTENT_GENERATION: 'content_generation',
  CUSTOMER_RESPONSE: 'customer_response',
} as const;

export type AITaskType = (typeof AITaskType)[keyof typeof AITaskType];

/**
 * AI model providers
 */
export const AIProvider = {
  WORKERS_AI: 'workers_ai',
  CLAUDE: 'claude',
} as const;

export type AIProvider = (typeof AIProvider)[keyof typeof AIProvider];

/**
 * Model configuration for each provider
 */
export const MODELS = {
  WORKERS_AI: {
    LLAMA_3_1_8B: '@cf/meta/llama-3.1-8b-instruct',
    BGE_BASE_EN: '@cf/baai/bge-base-en-v1.5',
    BGE_SMALL_EN: '@cf/baai/bge-small-en-v1.5',
  },
  CLAUDE: {
    SONNET: 'claude-sonnet-4-5-20250929',
  },
} as const;

/**
 * Task to model mapping
 * Determines which model/provider to use for each task type
 */
const TASK_MODEL_MAP: Record<
  AITaskType,
  { primary: AIProvider; fallback: AIProvider }
> = {
  [AITaskType.TRIAGE]: {
    primary: AIProvider.WORKERS_AI,
    fallback: AIProvider.CLAUDE,
  },
  [AITaskType.CLASSIFICATION]: {
    primary: AIProvider.WORKERS_AI,
    fallback: AIProvider.CLAUDE,
  },
  [AITaskType.TRANSLATION]: {
    primary: AIProvider.WORKERS_AI,
    fallback: AIProvider.CLAUDE,
  },
  [AITaskType.EMBEDDINGS]: {
    primary: AIProvider.WORKERS_AI,
    fallback: AIProvider.WORKERS_AI, // No fallback for embeddings
  },
  [AITaskType.CONTENT_GENERATION]: {
    primary: AIProvider.CLAUDE,
    fallback: AIProvider.CLAUDE, // High-quality tasks always use Claude
  },
  [AITaskType.CUSTOMER_RESPONSE]: {
    primary: AIProvider.CLAUDE,
    fallback: AIProvider.CLAUDE, // High-quality tasks always use Claude
  },
};

/**
 * Environment bindings needed for AI operations
 */
export interface AIBindings {
  AI?: Ai;
  CLAUDE_API_KEY?: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
}

/**
 * Result of model selection
 */
export interface ModelSelectionResult {
  provider: AIProvider;
  model: string;
  canFallback: boolean;
  fallbackProvider?: AIProvider;
  fallbackModel?: string;
}

/**
 * Select the appropriate model for a given task
 */
export function selectModel(
  taskType: AITaskType,
  env: AIBindings
): ModelSelectionResult {
  const mapping = TASK_MODEL_MAP[taskType];
  const hasWorkersAI = Boolean(env.AI);
  const hasClaude = Boolean(env.CLAUDE_API_KEY);

  // Determine if primary provider is available
  const primaryAvailable =
    (mapping.primary === AIProvider.WORKERS_AI && hasWorkersAI) ||
    (mapping.primary === AIProvider.CLAUDE && hasClaude);

  // Determine if fallback provider is available
  const fallbackAvailable =
    (mapping.fallback === AIProvider.WORKERS_AI && hasWorkersAI) ||
    (mapping.fallback === AIProvider.CLAUDE && hasClaude);

  // Get models for each provider
  const getModelForProvider = (
    provider: AIProvider,
    task: AITaskType
  ): string => {
    if (provider === AIProvider.WORKERS_AI) {
      if (task === AITaskType.EMBEDDINGS) {
        return MODELS.WORKERS_AI.BGE_BASE_EN;
      }
      return MODELS.WORKERS_AI.LLAMA_3_1_8B;
    }
    return MODELS.CLAUDE.SONNET;
  };

  // If primary is available, use it
  if (primaryAvailable) {
    const canFallback =
      fallbackAvailable && mapping.primary !== mapping.fallback;
    return {
      provider: mapping.primary,
      model: getModelForProvider(mapping.primary, taskType),
      canFallback,
      fallbackProvider: canFallback ? mapping.fallback : undefined,
      fallbackModel: canFallback
        ? getModelForProvider(mapping.fallback, taskType)
        : undefined,
    };
  }

  // Fall back to secondary if primary not available
  if (fallbackAvailable) {
    return {
      provider: mapping.fallback,
      model: getModelForProvider(mapping.fallback, taskType),
      canFallback: false,
    };
  }

  // No AI available
  throw new Error(
    `No AI provider available for task: ${taskType}. ` +
      `Required: ${mapping.primary} (primary) or ${mapping.fallback} (fallback)`
  );
}

/**
 * Check if Workers AI is available for lightweight tasks
 */
export function isWorkersAIAvailable(env: AIBindings): boolean {
  return Boolean(env.AI);
}

/**
 * Check if Claude API is available for high-quality tasks
 */
export function isClaudeAvailable(env: AIBindings): boolean {
  return Boolean(env.CLAUDE_API_KEY);
}

/**
 * Get estimated cost multiplier for a provider
 * Workers AI is significantly cheaper than Claude
 */
export function getCostMultiplier(provider: AIProvider): number {
  if (provider === AIProvider.WORKERS_AI) {
    return 0.1; // ~10% of Claude cost
  }
  return 1.0; // Claude baseline
}
