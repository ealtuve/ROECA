import React from 'react';
import { RefreshCw, TrendingUp, AlertTriangle, Building, KeyRound, Moon, Sun, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { ExchangeRate } from '../types/index.ts';
import { OfflineIndicator } from './OfflineIndicator.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface HeaderProps {
  exchangeRate: ExchangeRate | null;
  onOpenExchangeModal: () => void;
  onOpenBranchesModal: () => void;
  onOpenAuthModal: () => void;
  lowStockCount: number;
  onNavigateToLowStock: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  exchangeRate,
  onOpenExchangeModal,
  onOpenBranchesModal,
  onOpenAuthModal,
  lowStockCount,
  onNavigateToLowStock,
}) => {
  const { user, activeBranch, branches, setActiveBranch, hasPermission, lockOperatorSession } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const roleNames: Record<string, string> = {
    admin: 'Administrador',
    gerente: 'Administradora / Gerente',
    cajero: 'Caja / Ventas',
    almacen: 'Almacén / Inventario',
    contador: 'Contabilidad',
  };

  return (
    <header className="h-16 bg-white dark:bg-[#161b22] border-b border-slate-200 dark:border-[#262f3c] px-4 sm:px-6 flex items-center justify-between gap-2 shrink-0 shadow-xs transition-colors">
      {/* Left zone: Active branch switcher & Date */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300">
          <Building className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">{activeBranch?.code || 'ROEC-01'}:</span>
          <select
            value={activeBranch?.id || ''}
            onChange={(e) => {
              const b = branches.find((branch) => branch.id === Number(e.target.value));
              if (b) setActiveBranch(b);
            }}
            className="bg-transparent border-none text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-hidden cursor-pointer dark:bg-[#1c222b] max-w-[140px] truncate"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id} className="dark:bg-[#1c222b] dark:text-slate-200">
                {b.name}
              </option>
            ))}
          </select>
          {hasPermission('branches') && (
            <button
              onClick={onOpenBranchesModal}
              className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium ml-1 cursor-pointer hidden md:inline"
            >
              Gestionar
            </button>
          )}
        </div>

        <div className="hidden 2xl:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      {/* Right zone: Sync Status, Share/PWA, Exchange rate, Alerts, Theme, Operator */}
      <div className="flex items-center gap-2">
        <OfflineIndicator variant="badge" />
        <PWAInstallButton compact />

        {/* Low Stock Indicator */}
        {lowStockCount > 0 && hasPermission('inventory') && (
          <button
            onClick={onNavigateToLowStock}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-300 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
            title="Ver productos con stock mínimo o crítico"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>
              <span className="font-bold">{lowStockCount}</span> stock
            </span>
          </button>
        )}

        {/* Exchange Rate Badge */}
        <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-lg px-2.5 py-1.5 text-xs">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="hidden md:inline text-slate-600 dark:text-slate-400 font-medium">BCV:</span>
          <span className="font-bold text-emerald-800 dark:text-emerald-300 font-mono tabular-nums">
            {exchangeRate ? `${exchangeRate.rate.toFixed(2)} Bs/$` : 'BCV'}
          </span>
          {hasPermission('exchange') && (
            <button
              onClick={onOpenExchangeModal}
              className="p-0.5 hover:bg-emerald-200/50 dark:hover:bg-emerald-900/60 rounded text-emerald-700 dark:text-emerald-400 transition-colors cursor-pointer"
              title="Actualizar tasa de cambio USD/VES"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Soft Dark Mode Eye-Friendly Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] border border-slate-200 dark:border-[#2d3748] text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          title={isDark ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro Suave'}
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-500" />}
        </button>

        {/* Quick Lock Button */}
        <button
          onClick={() => void lockOperatorSession()}
          className="p-2 rounded-lg bg-slate-100 hover:bg-amber-100 dark:bg-[#1c222b] dark:hover:bg-amber-950/50 border border-slate-200 dark:border-[#2d3748] text-slate-600 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-pointer"
          title="Bloquear pantalla y pedir usuario y clave"
        >
          <Lock className="w-3.5 h-3.5" />
        </button>

        {/* Active Operator Trigger */}
        <button
          onClick={onOpenAuthModal}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] border border-slate-200 dark:border-[#2d3748] text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
          title="Cambiar de operador o revisar permisos"
        >
          <div className="w-6 h-6 rounded-full bg-slate-900 dark:bg-emerald-700 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
            {user?.name.charAt(0) || 'U'}
          </div>
          <div className="text-left hidden sm:block">
            <span className="block font-semibold text-slate-900 dark:text-slate-100 leading-none max-w-[120px] truncate">
              @{user?.username || user?.name}
            </span>
            <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-none">
              {user ? roleNames[user.role] || user.role : 'Sin sesión'}
            </span>
          </div>
          <KeyRound className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
        </button>
      </div>
    </header>
  );
};
