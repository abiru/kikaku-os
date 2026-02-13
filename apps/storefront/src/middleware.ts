import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';

const isProtectedRoute = createRouteMatcher(['/admin(.*)', '/account(.*)']);
const isLoginRoute = createRouteMatcher(['/admin/login(.*)', '/sign-in(.*)', '/sign-up(.*)']);

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
