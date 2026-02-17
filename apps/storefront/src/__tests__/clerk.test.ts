import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the module in isolation, so we re-implement the tests
// by mocking window.Clerk at different states

describe('clerk.ts', () => {
  let getToken: typeof import('../lib/clerk').getToken;
  let isSignedIn: typeof import('../lib/clerk').isSignedIn;
  let getCurrentUser: typeof import('../lib/clerk').getCurrentUser;
  let getClerk: typeof import('../lib/clerk').getClerk;
  let signOut: typeof import('../lib/clerk').signOut;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    // Ensure window exists (jsdom)
    (window as Record<string, unknown>).Clerk = undefined;

    const mod = await import('../lib/clerk');
    getToken = mod.getToken;
    isSignedIn = mod.isSignedIn;
    getCurrentUser = mod.getCurrentUser;
    getClerk = mod.getClerk;
    signOut = mod.signOut;
  });

  afterEach(() => {
    vi.useRealTimers();
    (window as Record<string, unknown>).Clerk = undefined;
  });

  describe('waitForClerk (via getClerk)', () => {
    it('resolves immediately when Clerk is already loaded', async () => {
      const mockClerk = { loaded: true, session: null, user: null, signOut: vi.fn() };
      (window as Record<string, unknown>).Clerk = mockClerk;

      const result = await getClerk();
      expect(result).toBe(mockClerk);
    });

    it('resolves when Clerk becomes ready after polling', async () => {
      const mockClerk = { loaded: true, session: null, user: null, signOut: vi.fn() };

      // Clerk not ready initially
      (window as Record<string, unknown>).Clerk = { loaded: false };

      const promise = getClerk();

      // Advance a few intervals, then make Clerk ready
      await vi.advanceTimersByTimeAsync(300);
      (window as Record<string, unknown>).Clerk = mockClerk;
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result).toBe(mockClerk);
    });

    it('returns null (rejects internally) when Clerk fails to load within timeout', async () => {
      (window as Record<string, unknown>).Clerk = { loaded: false };

      const promise = getClerk();

      // Advance past the 10s timeout (100 attempts * 100ms)
      await vi.advanceTimersByTimeAsync(10_100);

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe('getToken', () => {
    it('returns token when session is active', async () => {
      const mockClerk = {
        loaded: true,
        session: {
          getToken: vi.fn().mockResolvedValue('test-token-123'),
        },
        user: null,
        signOut: vi.fn(),
      };
      (window as Record<string, unknown>).Clerk = mockClerk;

      const token = await getToken();
      expect(token).toBe('test-token-123');
    });

    it('returns null when no session exists', async () => {
      const mockClerk = {
        loaded: true,
        session: null,
        user: null,
        signOut: vi.fn(),
      };
      (window as Record<string, unknown>).Clerk = mockClerk;

      const token = await getToken();
      expect(token).toBeNull();
    });

    it('returns null when getToken returns undefined', async () => {
      const mockClerk = {
        loaded: true,
        session: {
          getToken: vi.fn().mockResolvedValue(undefined),
        },
        user: null,
        signOut: vi.fn(),
      };
      (window as Record<string, unknown>).Clerk = mockClerk;

      const token = await getToken();
      expect(token).toBeNull();
    });

    it('returns null when Clerk fails to load', async () => {
      (window as Record<string, unknown>).Clerk = { loaded: false };

      const promise = getToken();
      await vi.advanceTimersByTimeAsync(10_100);

      const token = await promise;
      expect(token).toBeNull();
    });
  });

  describe('isSignedIn', () => {
    it('returns true when session exists', async () => {
      const mockClerk = {
        loaded: true,
        session: { getToken: vi.fn() },
        user: null,
        signOut: vi.fn(),
      };
      (window as Record<string, unknown>).Clerk = mockClerk;

      const result = await isSignedIn();
      expect(result).toBe(true);
    });

    it('returns false when no session exists', async () => {
      const mockClerk = {
        loaded: true,
        session: null,
        user: null,
        signOut: vi.fn(),
      };
      (window as Record<string, unknown>).Clerk = mockClerk;

      const result = await isSignedIn();
      expect(result).toBe(false);
    });

    it('returns false when Clerk fails to load', async () => {
      (window as Record<string, unknown>).Clerk = { loaded: false };

      const promise = isSignedIn();
      await vi.advanceTimersByTimeAsync(10_100);

      const result = await promise;
      expect(result).toBe(false);
    });
  });

  describe('getCurrentUser', () => {
    it('returns user when authenticated', async () => {
      const mockUser = { id: 'user_123', firstName: 'Test' };
      const mockClerk = {
        loaded: true,
        session: { getToken: vi.fn() },
        user: mockUser,
        signOut: vi.fn(),
      };
      (window as Record<string, unknown>).Clerk = mockClerk;

      const user = await getCurrentUser();
      expect(user).toBe(mockUser);
    });

    it('returns null when no user', async () => {
      const mockClerk = {
        loaded: true,
        session: null,
        user: null,
        signOut: vi.fn(),
      };
      (window as Record<string, unknown>).Clerk = mockClerk;

      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it('returns null when Clerk fails to load', async () => {
      (window as Record<string, unknown>).Clerk = { loaded: false };

      const promise = getCurrentUser();
      await vi.advanceTimersByTimeAsync(10_100);

      const user = await promise;
      expect(user).toBeNull();
    });
  });

  describe('signOut', () => {
    it('calls Clerk signOut', async () => {
      const mockSignOut = vi.fn().mockResolvedValue(undefined);
      const mockClerk = {
        loaded: true,
        session: null,
        user: null,
        signOut: mockSignOut,
      };
      (window as Record<string, unknown>).Clerk = mockClerk;

      await signOut();
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
