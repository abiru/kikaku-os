import { createMiddleware } from 'hono/factory';
import { verifyToken } from '@clerk/backend';
import type { Env } from '../env';
import { jsonError } from '../lib/http';

export type AuthUser = {
  userId: string;
  email?: string;
  method: 'clerk' | 'api-key';
};

// Note: For RBAC functionality, use the rbacUser context variable
// which is set by the loadRbac middleware (see middleware/rbac.ts)

declare module 'hono' {
  interface ContextVariableMap {
    authUser: AuthUser | null;
  }
}

export const clerkAuth = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = await verifyToken(token, {
        secretKey: c.env.CLERK_SECRET_KEY,
      });

      c.set('authUser', {
        userId: payload.sub,
        email: (payload as { email?: string }).email,
        method: 'clerk',
      });
      return next();
    } catch (err) {
      console.error('Clerk token verification failed:', err);
    }
  }

  const apiKey = c.req.header('x-admin-key');

  if (apiKey && c.env.ADMIN_API_KEY && apiKey === c.env.ADMIN_API_KEY) {
    c.set('authUser', {
      userId: 'admin',
      method: 'api-key',
    });
    return next();
  }

  c.set('authUser', null);
  return jsonError(c, 'Unauthorized', 401);
});

export const optionalClerkAuth = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = await verifyToken(token, {
        secretKey: c.env.CLERK_SECRET_KEY,
      });

      c.set('authUser', {
        userId: payload.sub,
        email: (payload as { email?: string }).email,
        method: 'clerk',
      });
    } catch {
      c.set('authUser', null);
    }
  } else {
    const apiKey = c.req.header('x-admin-key');

    if (apiKey && c.env.ADMIN_API_KEY && apiKey === c.env.ADMIN_API_KEY) {
      c.set('authUser', {
        userId: 'admin',
        method: 'api-key',
      });
    } else {
      c.set('authUser', null);
    }
  }

  return next();
});

export const getActor = (c: { get: (key: 'authUser') => AuthUser | null }): string => {
  const user = c.get('authUser');
  if (!user) {
    return 'anonymous';
  }
  return user.email || user.userId;
};
