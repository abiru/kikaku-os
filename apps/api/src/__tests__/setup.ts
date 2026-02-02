import { vi } from 'vitest';

/**
 * Mock @cloudflare/playwright to prevent ERR_UNSUPPORTED_ESM_URL_SCHEME error.
 *
 * The @cloudflare/playwright package uses cloudflare:sockets protocol
 * which is not supported by Node.js ESM loader during testing.
 */
vi.mock('@cloudflare/playwright', () => ({
  launch: vi.fn().mockResolvedValue({
    newPage: vi.fn().mockResolvedValue({
      goto: vi.fn().mockResolvedValue(undefined),
      content: vi.fn().mockResolvedValue('<html></html>'),
      close: vi.fn().mockResolvedValue(undefined)
    }),
    close: vi.fn().mockResolvedValue(undefined)
  }),
  BrowserWorker: class MockBrowserWorker {}
}));
