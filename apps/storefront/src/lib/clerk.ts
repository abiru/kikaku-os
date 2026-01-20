import { $clerkStore, $authStore, $userStore, $sessionStore } from '@clerk/astro/client';

export const getToken = async (): Promise<string | null> => {
  const session = $sessionStore.get();
  if (!session) {
    return null;
  }
  return session.getToken();
};

export const isSignedIn = (): boolean => {
  const auth = $authStore.get();
  return !!auth?.userId;
};

export const signOut = async (): Promise<void> => {
  const clerk = $clerkStore.get();
  if (clerk) {
    await clerk.signOut();
  }
};

export const getCurrentUser = () => {
  return $userStore.get();
};

export const getClerk = () => {
  return $clerkStore.get();
};
