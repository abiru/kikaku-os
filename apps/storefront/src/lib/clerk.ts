// Client-side Clerk helpers using the global Clerk instance
// The Clerk Astro integration automatically loads Clerk on the client

declare global {
  interface Window {
    Clerk?: {
      loaded?: boolean;
      session?: {
        id: string;
        getToken: () => Promise<string | null>;
      } | null;
      user?: {
        id: string;
        primaryEmailAddress?: { emailAddress: string };
        firstName: string | null;
        lastName: string | null;
        imageUrl: string;
      } | null;
      signOut: () => Promise<void>;
    };
  }
}

const waitForClerk = (): Promise<NonNullable<Window['Clerk']>> => {
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
    if (!clerk.session) {
      return null;
    }
    return clerk.session.getToken();
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

export const getCurrentUser = async () => {
  try {
    const clerk = await waitForClerk();
    return clerk.user || null;
  } catch {
    return null;
  }
};

export const getClerk = async () => {
  try {
    return await waitForClerk();
  } catch {
    return null;
  }
};
