import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';

const isProtectedRoute = createRouteMatcher(['/admin(.*)']);
const isAccountRoute = createRouteMatcher(['/account(.*)']);
const isLoginRoute = createRouteMatcher(['/admin/login(.*)']);

export const onRequest = clerkMiddleware((auth, context) => {
  const { isAuthenticated, redirectToSignIn } = auth();

  // Allow access to login page without authentication
  if (isLoginRoute(context.request)) {
    return;
  }

  // Protect admin routes
  if (isProtectedRoute(context.request) && !isAuthenticated) {
    return redirectToSignIn();
  }

  // Protect account routes (customer payment history, etc.)
  if (isAccountRoute(context.request) && !isAuthenticated) {
    return redirectToSignIn();
  }
});
