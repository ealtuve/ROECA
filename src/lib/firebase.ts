import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  // Fallback when Firestore is already initialized (e.g. fast reload)
  firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = firestoreInstance;

// Startup Firestore connectivity validation (skipped quietly when operating offline)
async function testConnection() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Operating in offline cache mode until connection resumes.');
    }
  }
}
testConnection();

// Structured Firestore Error Handling (required for permission diagnostics)
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Workspace OAuth scopes (least privilege: send emails only)
export const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

export const googleAuthProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleAuthProvider.addScope(scope));

// In-memory only cache for Google OAuth access token (never stored in localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedAccountEmail: string | null = null;
const tokenListeners = new Set<(token: string | null, email: string | null) => void>();

const notifyTokenListeners = () => {
  tokenListeners.forEach((listener) => listener(cachedAccessToken, cachedAccountEmail));
};

// Clear cached access token automatically when Firebase Auth signs out
onAuthStateChanged(auth, (user: User | null) => {
  if (!user) {
    cachedAccessToken = null;
    cachedAccountEmail = null;
    notifyTokenListeners();
  } else if (!cachedAccessToken && !isSigningIn) {
    cachedAccessToken = null;
    cachedAccountEmail = user.email || null;
    notifyTokenListeners();
  }
});

export const subscribeGmailToken = (
  listener: (token: string | null, email: string | null) => void
) => {
  tokenListeners.add(listener);
  listener(cachedAccessToken, cachedAccountEmail);
  return () => {
    tokenListeners.delete(listener);
  };
};

export const setGmailAccessToken = (token: string | null, email?: string | null) => {
  cachedAccessToken = token;
  if (email !== undefined) {
    cachedAccountEmail = email;
  }
  notifyTokenListeners();
};

export const getGmailAccessToken = (): string | null => cachedAccessToken;
export const getGmailAccountEmail = (): string | null => cachedAccountEmail;

export const clearGmailAccessToken = () => {
  cachedAccessToken = null;
  cachedAccountEmail = null;
  notifyTokenListeners();
};

export const googleSignInForGmail = async (): Promise<{
  user: User;
  accessToken: string;
}> => {
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    SCOPES.forEach((scope) => provider.addScope(scope));
    provider.setCustomParameters({ prompt: 'consent select_account' });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el permiso de envío de Gmail desde Google.');
    }

    cachedAccessToken = credential.accessToken;
    cachedAccountEmail = result.user.email || null;
    notifyTokenListeners();
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};
