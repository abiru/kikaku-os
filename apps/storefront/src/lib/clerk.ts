// Client-side Clerk helpers using the global Clerk instance
// The Clerk Astro integration automatically loads Clerk on the client

type LoadedClerkInstance = NonNullable<Window['Clerk']>;
type ClerkUser = NonNullable<LoadedClerkInstance['user']>;

const waitForClerk = (): Promise<LoadedClerkInstance> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Clerk is only available in the browser'));
      return;
    }

    if (window.Clerk?.loaded) {
      resolve(window.Clerk);
      return;
    }

    // Wait for Clerk to load (max 10 seconds)
    let attempts = 0;
    const maxAttempts = 100;
    const interval = setInterval(() => {
      attempts++;
      if (window.Clerk?.loaded) {
        clearInterval(interval);
        resolve(window.Clerk);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        reject(new Error('Clerk failed to load'));
      }
    }, 100);
  });
};

export const getToken = async (): Promise<string | null> => {
  try {
    const clerk = await waitForClerk();
    const session = clerk.session;
    if (!session) {
      return null;
    }
    return (await session.getToken()) ?? null;
  } catch {
    return null;
  }
};

export const isSignedIn = async (): Promise<boolean> => {
  try {
    const clerk = await waitForClerk();
    return !!clerk.session;
  } catch {
    return false;
  }
};

export const signOut = async (): Promise<void> => {
  const clerk = await waitForClerk();
  await clerk.signOut();
};

export const getCurrentUser = async (): Promise<ClerkUser | null> => {
  try {
    const clerk = await waitForClerk();
    return clerk.user || null;
  } catch {
    return null;
  }
};

export const getClerk = async (): Promise<LoadedClerkInstance | null> => {
  try {
    return await waitForClerk();
  } catch {
    return null;
  }
};
