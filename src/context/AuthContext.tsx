import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  UserRole,
  UserProfile,
  Branch,
  ModuleKey,
  ROLE_DEFAULT_MODULES,
} from '../types/index.ts';
import {
  auth,
  googleAuthProvider,
  setGmailAccessToken,
  clearGmailAccessToken,
} from '../lib/firebase.ts';
import {
  seedMeridaTucaniData,
  ensureDefaultOperators,
  setActiveOperatorContext,
  apiFetch,
} from '../lib/firestoreStore.ts';
import {
  signInAnonymously,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  User as FirebaseUser,
} from 'firebase/auth';

const OPERATOR_SESSION_KEY = 'roeca_active_operator_v2';

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  authReady: boolean;
  isSeeding: boolean;
  isAnonymousAuthDisabled: boolean;
  workspaceAuthError: string | null;
  activeBranch: Branch | null;
  setActiveBranch: (branch: Branch) => void;
  branches: Branch[];
  loadBranches: () => Promise<void>;
  connectWorkspaceAnonymously: () => Promise<boolean>;
  loginWithGoogle: () => Promise<void>;
  loginOperator: (username: string, password: string) => Promise<UserProfile>;
  lockOperatorSession: () => Promise<void>;
  refreshOperatorProfile: () => Promise<void>;
  logout: () => Promise<void>;
  triggerMeridaSeed: (force?: boolean) => Promise<string>;
  hasPermission: (module: ModuleKey) => boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isAnonymousAuthDisabled, setIsAnonymousAuthDisabled] = useState(false);
  const [workspaceAuthError, setWorkspaceAuthError] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const autoAnonAttemptedRef = useRef(false);

  const loadBranches = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const res = await apiFetch('/api/branches');
      if (res.ok) {
        const data: Branch[] = await res.json();
        setBranches(data);
        if (data.length > 0) {
          setActiveBranch((prev) => {
            if (prev && data.some((b) => b.id === prev.id)) return prev;
            return data.find((b) => b.isMain) || data[0];
          });
        }
      }
    } catch (err) {
      console.warn('Could not load branches from Firestore', err);
    }
  }, []);

  const persistOperatorSession = (profile: UserProfile | null) => {
    setActiveOperatorContext(profile);
    try {
      if (profile) {
        sessionStorage.setItem(OPERATOR_SESSION_KEY, JSON.stringify({ profile }));
      } else {
        sessionStorage.removeItem(OPERATOR_SESSION_KEY);
      }
    } catch {
      // Ignore storage restrictions
    }
  };

  const connectWorkspaceAnonymously = useCallback(async (): Promise<boolean> => {
    if (auth.currentUser) {
      setIsAnonymousAuthDisabled(false);
      setWorkspaceAuthError(null);
      return true;
    }
    setIsLoading(true);
    setWorkspaceAuthError(null);
    try {
      await signInAnonymously(auth);
      setIsAnonymousAuthDisabled(false);
      setWorkspaceAuthError(null);
      return true;
    } catch (err: any) {
      const code = String(err?.code || '');
      if (
        code === 'auth/admin-restricted-operation' ||
        code === 'auth/operation-not-allowed'
      ) {
        setIsAnonymousAuthDisabled(true);
        setWorkspaceAuthError(
          'Falta activar el acceso directo (Anónimo) una sola vez en Firebase Console para conectar sin pedir correo.'
        );
      } else if (code === 'auth/network-request-failed') {
        setWorkspaceAuthError(
          'Sin conexión a internet para inicializar la base de datos por primera vez en este equipo.'
        );
      } else {
        setWorkspaceAuthError(
          err?.message || 'No se pudo conectar automáticamente con la base de datos.'
        );
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setFirebaseUser(null);

        // Silently establish an Anonymous Firebase Auth session so users never see a Google/email prompt
        if (!autoAnonAttemptedRef.current) {
          autoAnonAttemptedRef.current = true;
          const ok = await connectWorkspaceAnonymously();
          if (ok) {
            // onAuthStateChanged will fire again with the signed-in anonymous user
            return;
          }
        }

        setUser(null);
        persistOperatorSession(null);
        setBranches([]);
        setActiveBranch(null);
        setIsSeeding(false);
        setAuthReady(true);
        return;
      }

      setFirebaseUser(fbUser);
      setIsAnonymousAuthDisabled(false);
      setWorkspaceAuthError(null);
      setIsSeeding(true);

      try {
        // Ensure Mérida / Tucaní initial data and the 3 default operators (admin, gerente, caja) exist
        await seedMeridaTucaniData(false);
        await ensureDefaultOperators();
        await loadBranches();

        // Restore operator session if already verified in this browser tab (preserved even if Gmail OAuth is later linked)
        let restored: UserProfile | null = null;
        try {
          const raw = sessionStorage.getItem(OPERATOR_SESSION_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.profile?.id) {
              const uRes = await apiFetch('/api/users');
              if (uRes.ok) {
                const allUsers: UserProfile[] = await uRes.json();
                const fresh = allUsers.find((u) => u.id === parsed.profile.id && u.isActive);
                if (fresh) {
                  restored = fresh;
                }
              } else {
                restored = parsed.profile;
              }
            }
          }
        } catch {
          restored = null;
        }

        if (restored) {
          setUser(restored);
          persistOperatorSession(restored);
        } else {
          setUser(null);
          persistOperatorSession(null);
        }
      } catch (e) {
        console.error('Error initializing ROECA workspace:', e);
      } finally {
        setIsSeeding(false);
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, [loadBranches, connectWorkspaceAnonymously]);

  const loginWithGoogle = async () => {
    setIsLoading(true);
    setWorkspaceAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
      if (oauthCred?.accessToken) {
        setGmailAccessToken(oauthCred.accessToken, cred.user.email || null);
      }
      setIsAnonymousAuthDisabled(false);
    } catch (err) {
      console.error('Login error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const loginOperator = async (username: string, password: string): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      if (!auth.currentUser) {
        const connected = await connectWorkspaceAnonymously();
        if (!connected || !auth.currentUser) {
          throw new Error(
            'Active el acceso directo (Anónimo) en Firebase Console o conéctese a internet para iniciar sesión.'
          );
        }
        await seedMeridaTucaniData(false);
        await ensureDefaultOperators();
      }

      const res = await apiFetch('/api/auth/operator-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Usuario o clave incorrectos.');
      }
      const profile = data as UserProfile;
      setUser(profile);
      persistOperatorSession(profile);
      await loadBranches();
      return profile;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshOperatorProfile = async () => {
    if (!user || !auth.currentUser) return;
    try {
      const res = await apiFetch('/api/users');
      if (res.ok) {
        const list: UserProfile[] = await res.json();
        const fresh = list.find((u) => u.id === user.id);
        if (fresh && fresh.isActive) {
          setUser(fresh);
          persistOperatorSession(fresh);
        } else if (fresh && !fresh.isActive) {
          setUser(null);
          persistOperatorSession(null);
        }
      }
    } catch (e) {
      console.warn('Could not refresh operator profile:', e);
    }
  };

  const lockOperatorSession = async () => {
    if (user) {
      try {
        await apiFetch('/api/audit-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'Bloqueo / cierre de turno',
            module: 'auth',
            details: `Operador @${user.username || user.email} bloqueó la ventana de seguridad`,
          }),
        });
      } catch {
        // Non-blocking
      }
    }
    setUser(null);
    persistOperatorSession(null);
  };

  const triggerMeridaSeed = async (force = true): Promise<string> => {
    setIsSeeding(true);
    try {
      const result = await seedMeridaTucaniData(force);
      await loadBranches();
      return result.summary;
    } finally {
      setIsSeeding(false);
    }
  };

  const logout = async () => {
    try {
      clearGmailAccessToken();
      persistOperatorSession(null);
      autoAnonAttemptedRef.current = false;
      await fbSignOut(auth);
    } catch (e) {
      console.warn('Sign out warning', e);
    }
    setUser(null);
  };

  const hasPermission = (module: ModuleKey): boolean => {
    if (!user || !user.isActive) return false;

    const allowed = Array.isArray(user.allowedModules)
      ? user.allowedModules
      : ROLE_DEFAULT_MODULES[user.role as UserRole] || [];

    if (module === 'settings') {
      return (
        user.role === 'admin' ||
        allowed.includes('exchange') ||
        allowed.includes('users_admin') ||
        allowed.includes('backup')
      );
    }

    if (module === 'client_analytics') {
      return (
        user.role === 'admin' ||
        allowed.includes('client_analytics') ||
        (allowed.includes('clients') && allowed.includes('reports'))
      );
    }

    return allowed.includes(module);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        authReady,
        isSeeding,
        isAnonymousAuthDisabled,
        workspaceAuthError,
        activeBranch,
        setActiveBranch,
        branches,
        loadBranches,
        connectWorkspaceAnonymously,
        loginWithGoogle,
        loginOperator,
        lockOperatorSession,
        refreshOperatorProfile,
        logout,
        triggerMeridaSeed,
        hasPermission,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
