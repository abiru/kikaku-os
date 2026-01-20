import type { Clerk as ClerkType } from '@clerk/clerk-js';

let clerkInstance: ClerkType | null = null;
let clerkLoadPromise: Promise<ClerkType> | null = null;

export const getClerkPublishableKey = (): string => {
  const key =
    (typeof import.meta !== 'undefined' &&
      typeof import.meta.env !== 'undefined' &&
      import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY) ||
    '';

  if (!key || key === 'pk_test_CHANGE_ME') {
    console.warn('Clerk publishable key not configured');
  }

  return key;
};

export const loadClerk = async (): Promise<ClerkType> => {
  if (clerkInstance) {
    return clerkInstance;
  }

  if (clerkLoadPromise) {
    return clerkLoadPromise;
  }

  clerkLoadPromise = (async () => {
    const publishableKey = getClerkPublishableKey();
    if (!publishableKey) {
      throw new Error('PUBLIC_CLERK_PUBLISHABLE_KEY is not set');
    }

    const { Clerk } = await import('@clerk/clerk-js');
    const clerk = new Clerk(publishableKey);
    await clerk.load();
    clerkInstance = clerk;
    return clerk;
  })();

  return clerkLoadPromise;
};

export const getClerk = (): ClerkType | null => {
  return clerkInstance;
};

export const getToken = async (): Promise<string | null> => {
  const clerk = await loadClerk();
  if (!clerk.session) {
    return null;
  }
  return clerk.session.getToken();
};

export const isSignedIn = async (): Promise<boolean> => {
  const clerk = await loadClerk();
  return !!clerk.session;
};

export const signOut = async (): Promise<void> => {
  const clerk = await loadClerk();
  await clerk.signOut();
};

export const openSignIn = async (): Promise<void> => {
  const clerk = await loadClerk();
  clerk.openSignIn({
    afterSignInUrl: '/admin/',
    afterSignUpUrl: '/admin/',
  });
};

export const mountSignIn = async (element: HTMLDivElement): Promise<void> => {
  const clerk = await loadClerk();
  clerk.mountSignIn(element, {
    afterSignInUrl: '/admin/',
    afterSignUpUrl: '/admin/',
  });
};

export const unmountSignIn = async (element: HTMLDivElement): Promise<void> => {
  const clerk = await loadClerk();
  clerk.unmountSignIn(element);
};

export const mountUserButton = async (element: HTMLDivElement): Promise<void> => {
  const clerk = await loadClerk();
  clerk.mountUserButton(element, {
    afterSignOutUrl: '/admin/login',
  });
};

export const unmountUserButton = async (element: HTMLDivElement): Promise<void> => {
  const clerk = await loadClerk();
  clerk.unmountUserButton(element);
};

export const getCurrentUser = async () => {
  const clerk = await loadClerk();
  return clerk.user;
};
