import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/cloudflare';
import { getSentryConfig, captureException, captureMessage, setUser, addBreadcrumb } from '../../lib/sentry';
import type { Env } from '../../env';

// Mock Sentry SDK
vi.mock('@sentry/cloudflare', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn()
}));

const createMockEnv = (overrides?: Partial<Env['Bindings']>): Env['Bindings'] => ({
  DB: {} as D1Database,
  R2: {} as R2Bucket,
  DEV_MODE: 'false',
  STRIPE_SECRET_KEY: 'sk_test_xxx',
  STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
  STOREFRONT_BASE_URL: 'http://localhost:4321',
  CLERK_SECRET_KEY: 'sk_test_xxx',
  ...overrides
});

describe('getSentryConfig', () => {
  it('returns null when SENTRY_DSN is not configured', () => {
    const env = createMockEnv({ SENTRY_DSN: undefined });
    const config = getSentryConfig(env);
    expect(config).toBeNull();
  });

  it('returns null when SENTRY_DSN is empty string', () => {
    const env = createMockEnv({ SENTRY_DSN: '' });
    const config = getSentryConfig(env);
    expect(config).toBeNull();
  });

  it('returns config when SENTRY_DSN is configured', () => {
    const env = createMockEnv({
      SENTRY_DSN: 'https://xxx@sentry.io/123',
      CF_VERSION_METADATA: { id: 'v1.0.0' }
    });
    const config = getSentryConfig(env);

    expect(config).not.toBeNull();
    expect(config?.dsn).toBe('https://xxx@sentry.io/123');
    expect(config?.release).toBe('v1.0.0');
    expect(config?.environment).toBe('production');
  });

  it('sets environment to development when DEV_MODE is true', () => {
    const env = createMockEnv({
      SENTRY_DSN: 'https://xxx@sentry.io/123',
      DEV_MODE: 'true'
    });
    const config = getSentryConfig(env);

    expect(config?.environment).toBe('development');
  });

  it('uses unknown release when CF_VERSION_METADATA is not available', () => {
    const env = createMockEnv({
      SENTRY_DSN: 'https://xxx@sentry.io/123',
      CF_VERSION_METADATA: undefined
    });
    const config = getSentryConfig(env);

    expect(config?.release).toBe('unknown');
  });

  it('sets correct sample rates for production', () => {
    const env = createMockEnv({
      SENTRY_DSN: 'https://xxx@sentry.io/123',
      DEV_MODE: 'false'
    });
    const config = getSentryConfig(env);

    expect(config?.sampleRate).toBe(1.0);
    expect(config?.tracesSampleRate).toBe(0.1);
  });

  it('sets higher traces sample rate for development', () => {
    const env = createMockEnv({
      SENTRY_DSN: 'https://xxx@sentry.io/123',
      DEV_MODE: 'true'
    });
    const config = getSentryConfig(env);

    expect(config?.tracesSampleRate).toBe(1.0);
  });

  it('includes beforeSend that filters 4xx errors', () => {
    const env = createMockEnv({
      SENTRY_DSN: 'https://xxx@sentry.io/123'
    });
    const config = getSentryConfig(env);

    expect(config?.beforeSend).toBeDefined();

    // Test that 4xx errors are filtered
    const event400 = { contexts: { response: { status_code: 400 } } };
    expect(config?.beforeSend?.(event400 as any, {} as any)).toBeNull();

    const event404 = { contexts: { response: { status_code: 404 } } };
    expect(config?.beforeSend?.(event404 as any, {} as any)).toBeNull();

    // Test that 5xx errors pass through
    const event500 = { contexts: { response: { status_code: 500 } } };
    expect(config?.beforeSend?.(event500 as any, {} as any)).toEqual(event500);

    // Test that events without status code pass through
    const eventNoStatus = { contexts: {} };
    expect(config?.beforeSend?.(eventNoStatus as any, {} as any)).toEqual(eventNoStatus);
  });
});

describe('captureException', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing in dev mode', () => {
    const env = createMockEnv({ DEV_MODE: 'true', SENTRY_DSN: 'https://xxx@sentry.io/123' });
    const error = new Error('Test error');

    captureException(error, {
      path: '/api/test',
      method: 'GET',
      env
    });

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('logs to console when SENTRY_DSN is not configured', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = createMockEnv({ DEV_MODE: 'false', SENTRY_DSN: undefined });
    const error = new Error('Test error');

    captureException(error, {
      path: '/api/test',
      method: 'GET',
      env
    });

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('calls Sentry.captureException when SENTRY_DSN is configured', () => {
    const env = createMockEnv({ DEV_MODE: 'false', SENTRY_DSN: 'https://xxx@sentry.io/123' });
    const error = new Error('Test error');

    captureException(error, {
      path: '/api/test',
      method: 'POST',
      env,
      userId: 'user123'
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      extra: {
        path: '/api/test',
        method: 'POST',
        timestamp: expect.any(String)
      },
      user: { id: 'user123' },
      tags: {
        path: '/api/test',
        method: 'POST'
      }
    });
  });

  it('does not include user when userId is not provided', () => {
    const env = createMockEnv({ DEV_MODE: 'false', SENTRY_DSN: 'https://xxx@sentry.io/123' });
    const error = new Error('Test error');

    captureException(error, {
      path: '/api/test',
      method: 'GET',
      env
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({
      user: undefined
    }));
  });
});

describe('captureMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Sentry.captureMessage with correct parameters', () => {
    captureMessage('Test message', 'warning', { key: 'value' });

    expect(Sentry.captureMessage).toHaveBeenCalledWith('Test message', {
      level: 'warning',
      extra: { key: 'value' }
    });
  });

  it('uses info level by default', () => {
    captureMessage('Test message');

    expect(Sentry.captureMessage).toHaveBeenCalledWith('Test message', {
      level: 'info',
      extra: undefined
    });
  });
});

describe('setUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Sentry.setUser with user data', () => {
    setUser({ id: 'user123', email: 'test@example.com' });

    expect(Sentry.setUser).toHaveBeenCalledWith({
      id: 'user123',
      email: 'test@example.com'
    });
  });
});

describe('addBreadcrumb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Sentry.addBreadcrumb with correct parameters', () => {
    addBreadcrumb({
      category: 'api',
      message: 'API call started',
      level: 'debug',
      data: { endpoint: '/api/test' }
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'api',
      message: 'API call started',
      level: 'debug',
      data: { endpoint: '/api/test' }
    });
  });

  it('uses info level by default', () => {
    addBreadcrumb({
      category: 'api',
      message: 'API call'
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'api',
      message: 'API call',
      level: 'info'
    });
  });
});
