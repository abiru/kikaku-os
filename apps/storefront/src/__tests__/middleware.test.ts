import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the variable is available when the mock factory runs
const { mockRedirectToSignIn, mockAuth, capturedRef } = vi.hoisted(() => {
  const mockRedirectToSignIn = vi.fn();
  const mockAuth = vi.fn();
  const capturedRef: { handler: ((auth: typeof mockAuth, ctx: { request: Request }) => void) | null } = { handler: null };
  return { mockRedirectToSignIn, mockAuth, capturedRef };
});

vi.mock('@clerk/astro/server', () => ({
  clerkMiddleware: (handler: (auth: typeof mockAuth, context: { request: Request }) => void) => {
    capturedRef.handler = handler;
    return handler;
  },
  createRouteMatcher: (patterns: string[]) => {
    const regexes = patterns.map((p) => {
      const escaped = p.replace(/\(/g, '(?:').replace(/\.\.\./g, '.*');
      return new RegExp(`^${escaped}`);
    });
    return (req: Request) => {
      const url = new URL(req.url);
      return regexes.some((r) => r.test(url.pathname));
    };
  },
}));

// Import after mocks are set up — triggers clerkMiddleware call
import '../middleware';

function callMiddleware(pathname: string, authenticated: boolean) {
  mockAuth.mockReturnValue({
    isAuthenticated: authenticated,
    redirectToSignIn: mockRedirectToSignIn,
  });

  const request = new Request(`http://localhost:4321${pathname}`);
  return capturedRef.handler!(mockAuth, { request });
}

describe('middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a handler via clerkMiddleware', () => {
    expect(capturedRef.handler).toBeTypeOf('function');
  });

  // Public routes: unauthenticated access allowed
  it('allows unauthenticated access to public routes', () => {
    callMiddleware('/', false);
    expect(mockRedirectToSignIn).not.toHaveBeenCalled();
  });

  it('allows unauthenticated access to /products', () => {
    callMiddleware('/products', false);
    expect(mockRedirectToSignIn).not.toHaveBeenCalled();
  });

  // Login routes: always accessible
  it('allows unauthenticated access to /sign-in', () => {
    callMiddleware('/sign-in', false);
    expect(mockRedirectToSignIn).not.toHaveBeenCalled();
  });

  it('allows unauthenticated access to /sign-up', () => {
    callMiddleware('/sign-up', false);
    expect(mockRedirectToSignIn).not.toHaveBeenCalled();
  });

  it('allows unauthenticated access to /admin/login', () => {
    callMiddleware('/admin/login', false);
    expect(mockRedirectToSignIn).not.toHaveBeenCalled();
  });

  // Protected routes: redirect when unauthenticated
  it('redirects unauthenticated users from /admin', () => {
    callMiddleware('/admin', false);
    expect(mockRedirectToSignIn).toHaveBeenCalled();
  });

  it('redirects unauthenticated users from /admin/orders', () => {
    callMiddleware('/admin/orders', false);
    expect(mockRedirectToSignIn).toHaveBeenCalled();
  });

  it('redirects unauthenticated users from /account', () => {
    callMiddleware('/account', false);
    expect(mockRedirectToSignIn).toHaveBeenCalled();
  });

  it('redirects unauthenticated users from /account/orders', () => {
    callMiddleware('/account/orders', false);
    expect(mockRedirectToSignIn).toHaveBeenCalled();
  });

  // Protected routes: allow when authenticated
  it('allows authenticated access to /admin', () => {
    callMiddleware('/admin', true);
    expect(mockRedirectToSignIn).not.toHaveBeenCalled();
  });

  it('allows authenticated access to /account', () => {
    callMiddleware('/account', true);
    expect(mockRedirectToSignIn).not.toHaveBeenCalled();
  });

  it('allows authenticated access to /admin/orders/123', () => {
    callMiddleware('/admin/orders/123', true);
    expect(mockRedirectToSignIn).not.toHaveBeenCalled();
  });
});
