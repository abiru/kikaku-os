export type Env = {
  Bindings: {
    DB: D1Database;
    R2: R2Bucket;
    ADMIN_API_KEY?: string;
    DEV_MODE: string;
    STRIPE_API_KEY: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET: string;
    STOREFRONT_BASE_URL: string;
    SHIPPING_FEE_AMOUNT?: string;
    FREE_SHIPPING_THRESHOLD?: string;
    SLACK_WEBHOOK_URL?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
    CLERK_SECRET_KEY: string;
  };
};
