import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

// Initialize Firebase if not already initialized
const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Add Gmail scopes
provider.addScope('https://mail.google.com/');
provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
provider.addScope('https://www.googleapis.com/auth/gmail.compose');
provider.addScope('https://www.googleapis.com/auth/gmail.send');

// Add Drive scopes
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/drive.file');

// Add Tasks scopes
provider.addScope('https://www.googleapis.com/auth/tasks');

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory.
let cachedAccessToken: string | null = null;

// Google OAuth access tokens are only returned from the popup result, so on a
// page reload the in-memory cache is gone even though the Firebase session
// persists. Cache the token for the session so a reload doesn't force re-auth.
const TOKEN_STORAGE_KEY = 'djtech_google_access_token';

const getTokenExpiry = (token: string): number | null => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

const storeAccessToken = (token: string) => {
  cachedAccessToken = token;
  const exp = getTokenExpiry(token);
  if (exp) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token, exp }));
  }
};

const restoreAccessToken = (): string | null => {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const { token, exp } = JSON.parse(raw);
    if (!token || (exp && Date.now() > exp)) {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = cachedAccessToken || restoreAccessToken();
      if (token) {
        cachedAccessToken = token;
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    storeAccessToken(credential.accessToken);
    return { user: result.user, accessToken: cachedAccessToken! };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken) {
    cachedAccessToken = restoreAccessToken();
  }
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
};
