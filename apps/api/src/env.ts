// Cloudflare Browser Rendering binding type
// Uses the Fetcher interface from Cloudflare Workers
interface BrowserWorker {
  fetch: typeof fetch;
}

// Cloudflare Workers AI binding type
export interface Ai {
  run<T = unknown>(
    model: string,
    inputs: AiTextGenerationInput | AiEmbeddingsInput
  ): Promise<T>;
}

// Workers AI input types
export interface AiTextGenerationInput {
  prompt?: string;
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

export interface AiEmbeddingsInput {
  text: string | string[];
}

export type Env = {
  Bindings: {
    DB: D1Database;
    R2: R2Bucket;
    BROWSER?: BrowserWorker;
    AI?: Ai;
    ADMIN_API_KEY?: string;
    DEV_MODE: string;
    STRIPE_SECRET_KEY: string;
    STRIPE_PUBLISHABLE_KEY?: string;
    STRIPE_WEBHOOK_SECRET: string;
    STOREFRONT_BASE_URL: string;
    SHIPPING_FEE_AMOUNT?: string;
    FREE_SHIPPING_THRESHOLD?: string;
    SLACK_WEBHOOK_URL?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
    CLERK_SECRET_KEY: string;
    CLAUDE_API_KEY?: string;
    AI_GATEWAY_ACCOUNT_ID?: string;
    AI_GATEWAY_ID?: string;
    COMPANY_NAME?: string;
    COMPANY_POSTAL_CODE?: string;
    COMPANY_ADDRESS?: string;
    COMPANY_PHONE?: string;
    COMPANY_EMAIL?: string;
    COMPANY_LOGO_URL?: string;
    SENTRY_DSN?: string;
    NEWSLETTER_SECRET?: string;
    CF_VERSION_METADATA?: { id: string };
  };
};
