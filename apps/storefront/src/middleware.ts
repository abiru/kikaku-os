import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';

const isProtectedRoute = createRouteMatcher(['/admin(.*)']);
const isLoginRoute = createRouteMatcher(['/admin/login(.*)']);

export const onRequest = clerkMiddleware((auth, context) => {
  const { isAuthenticated, redirectToSignIn } = auth();

  // Allow access to login page without authentication
  if (isLoginRoute(context.request)) {
    return;
  }

  // Protect all other admin routes
  if (isProtectedRoute(context.request) && !isAuthenticated) {
    return redirectToSignIn();
  }
});
