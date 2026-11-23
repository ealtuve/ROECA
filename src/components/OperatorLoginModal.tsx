import React, { useState } from 'react';
import {
  Building2,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  WifiOff,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  MapPin,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { OfflineIndicator } from './OfflineIndicator.tsx';
import firebaseConfig from '../../firebase-applet-config.json';

export const OperatorLoginModal: React.FC = () => {
  const {
    firebaseUser,
    isAnonymousAuthDisabled,
    workspaceAuthError,
    connectWorkspaceAnonymously,
    loginWithGoogle,
    loginOperator,
    isLoading,
  } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firebaseProvidersUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Ingrese su usuario y clave de acceso.');
      return;
    }

    setIsSubmitting(true);
    try {
      await loginOperator(username.trim(), password);
      setPassword('');
    } catch (err: any) {
      setError(err?.message || 'Credenciales inválidas. Verifique usuario y clave.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetryDirectConnection = async () => {
    setError(null);
    await connectWorkspaceAnonymously();
  };

  const handleFallbackGoogle = async () => {
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Se cerró la ventana de acceso.');
      } else {
        setError(err?.message || 'No se pudo completar la conexión alternativa.');
      }
    }
  };

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(16, 185, 129, 0.35), transparent 45%), radial-gradient(circle at 80% 80%, rgba(14, 165, 233, 0.25), transparent 50%)',
        }}
      />

      {/* Top status bar */}
      <div className="relative flex items-center justify-between max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Control de Acceso por Operador · Registro de Auditoría Activo</span>
        </div>
        <div className="flex items-center gap-2">
          <OfflineIndicator variant="badge" />
        </div>
      </div>

      {/* Center Security Window */}
      <div className="relative flex-1 flex items-center justify-center py-6">
        <div className="w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl p-7 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-white">
                Distribuidora ROECA C.A.
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Mérida · Tucaní · Acceso con Usuario y Clave</span>
              </p>
            </div>
          </div>

          {isOffline && (
            <div className="mb-4 p-3 rounded-xl bg-amber-950/60 border border-amber-700/70 text-xs text-amber-200 flex items-start gap-2">
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>
                Sin conexión a internet. Puede ingresar con su usuario habitual y seguir facturando localmente; sus movimientos se sincronizarán al reconectar.
              </span>
            </div>
          )}

          {!firebaseUser && isAnonymousAuthDisabled && (
            <div className="mb-4 p-3.5 rounded-xl bg-amber-950/70 border border-amber-700/80 text-xs text-amber-100 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-200">
                    Activación única pendiente para entrar sin correo
                  </p>
                  <p className="text-[11px] text-amber-100/90 leading-relaxed">
                    El administrador debe activar el proveedor <strong>Anónimo (Anonymous)</strong> una sola vez en Firebase Console para que cualquier computadora entre directo con Usuario y Clave.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={firebaseProvidersUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir Firebase Console
                </a>
                <button
                  type="button"
                  onClick={handleRetryDirectConnection}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-[11px] cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  Reintentar Conexión
                </button>
              </div>
              <button
                type="button"
                onClick={handleFallbackGoogle}
                disabled={isLoading}
                className="text-[11px] text-amber-300 hover:text-amber-200 underline underline-offset-2 cursor-pointer"
              >
                O conectar temporalmente con Google mientras se activa
              </button>
            </div>
          )}

          {!firebaseUser && workspaceAuthError && !isAnonymousAuthDisabled && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-xs text-rose-200 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span>{workspaceAuthError}</span>
              </div>
              <button
                type="button"
                onClick={handleRetryDirectConnection}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-900/70 hover:bg-rose-800 text-rose-100 font-semibold text-[11px] cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Reintentar Conexión
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-xs text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Usuario
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  placeholder="Ej: admin, gerente, caja..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Clave de Acceso
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Ingrese su clave secreta"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-md"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando credenciales...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Ingresar al Sistema
                </>
              )}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-800 text-[11px] text-slate-500">
            Cada operación realizada quedará registrada bajo su usuario y nivel de seguridad asignado.
          </div>
        </div>
      </div>

      <div className="relative text-center text-[11px] text-slate-600">
        Distribuidora ROECA C.A. · Mérida / Tucaní · Almacenamiento Persistente en la Nube y Modo Offline
      </div>
    </div>
  );
};
