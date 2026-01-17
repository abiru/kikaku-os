export type Env = {
  Bindings: {
    DB: D1Database;
    R2: R2Bucket;
    ADMIN_API_KEY: string;
    DEV_MODE: string;
    STRIPE_API_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    STOREFRONT_BASE_URL: string;
  };
};
