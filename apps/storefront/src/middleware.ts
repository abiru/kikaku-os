import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';
import { LOGIN_ROUTE_PATTERNS, PROTECTED_ROUTE_PATTERNS } from './lib/routeAccess';

const isProtectedRoute = createRouteMatcher(PROTECTED_ROUTE_PATTERNS);
const isLoginRoute = createRouteMatcher(LOGIN_ROUTE_PATTERNS);

export const onRequest = clerkMiddleware((auth, context) => {
  const { isAuthenticated, redirectToSignIn } = auth();

  // Allow access to login and sign-in/sign-up pages without authentication
  if (isLoginRoute(context.request)) {
    return;
  }

  // Protect admin and account routes
  if (isProtectedRoute(context.request) && !isAuthenticated) {
    return redirectToSignIn();
  }
});
