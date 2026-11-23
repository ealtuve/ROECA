import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  KeyRound,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ALL_MODULES } from '../types/index.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { user, loginOperator, lockOperatorSession } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const roleTitles: Record<string, string> = {
    admin: 'Administrador General',
    gerente: 'Administradora / Gerente',
    cajero: 'Operador de Caja',
    almacen: 'Supervisor de Almacén',
    contador: 'Contabilidad y Finanzas',
  };

  const handleSwitchOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!username.trim() || !password) {
      setErrorMsg('Ingrese usuario y clave para cambiar de operador.');
      return;
    }
    setIsSubmitting(true);
    try {
      await loginOperator(username.trim(), password);
      setUsername('');
      setPassword('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Credenciales incorrectas.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLock = async () => {
    onClose();
    await lockOperatorSession();
  };

  const allowedLabels = ALL_MODULES.filter((m) =>
    user?.allowedModules?.includes(m.key)
  ).map((m) => m.label);

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-lg font-bold">Seguridad de Sesión y Operador</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Todas las operaciones quedan auditadas bajo el usuario autenticado. Para cambiar de operador, valide sus credenciales.
          </p>
        </div>

        {/* Active operator info */}
        {user && (
          <div className="mb-5 p-4 bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c] rounded-xl text-xs space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Operador en turno:</span>
                <span className="font-bold text-sm text-slate-900 dark:text-white">{user.name}</span>
                <span className="block font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                  @{user.username || user.email.split('@')[0]}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 uppercase">
                {roleTitles[user.role] || user.role}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
                Módulos autorizados ({allowedLabels.length}):
              </span>
              <div className="flex flex-wrap gap-1">
                {allowedLabels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] text-[10px] text-slate-700 dark:text-slate-300"
                  >
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Switch operator with password */}
        <form onSubmit={handleSwitchOperator} className="space-y-3 text-xs">
          <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Cambiar de Usuario (Validación de Clave)</span>
          </h4>

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-700 dark:text-rose-300 font-medium">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Usuario
              </label>
              <div className="relative">
                <UserIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="admin, gerente, caja..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden focus:border-emerald-600"
                  required
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Clave
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-8 pr-9 py-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden focus:border-emerald-600"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Validando...
              </>
            ) : (
              <>
                <KeyRound className="w-3.5 h-3.5" />
                Iniciar Turno con Este Usuario
              </>
            )}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-[#262f3c] flex items-center justify-end">
          <button
            type="button"
            onClick={handleLock}
            className="px-4 py-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Bloquear Ventana / Salir de Turno</span>
          </button>
        </div>
      </div>
    </div>
  );
};
