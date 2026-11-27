import React from 'react';
import {
  LayoutDashboard,
  ReceiptText,
  Package,
  CreditCard,
  Landmark,
  Users,
  Building2,
  BarChart3,
  ShieldAlert,
  Lock,
  UserCheck,
  PackagePlus,
  PieChart,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ModuleKey } from '../types/index.ts';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenAuth: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab, onOpenAuth }) => {
  const { user, activeBranch, hasPermission, lockOperatorSession } = useAuth();

  const menuItems: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    module: ModuleKey;
    description: string;
  }> = [
    {
      id: 'dashboard',
      label: 'Panel de Control',
      icon: LayoutDashboard,
      module: 'dashboard',
      description: 'Métricas, tasa BCV, sucursales y usuarios',
    },
    {
      id: 'billing',
      label: 'Facturación (POS)',
      icon: ReceiptText,
      module: 'billing',
      description: 'Ventas contado y crédito',
    },
    {
      id: 'inventory',
      label: 'Inventario',
      icon: Package,
      module: 'inventory',
      description: 'Víveres y stock mínimo',
    },
    {
      id: 'receiving',
      label: 'Cargar Mercancía',
      icon: PackagePlus,
      module: 'receiving',
      description: 'Con factura o entrada manual',
    },
    {
      id: 'cxc',
      label: 'Cuentas por Cobrar',
      icon: CreditCard,
      module: 'cxc',
      description: 'Créditos y abonos clientes',
    },
    {
      id: 'cxp',
      label: 'Cuentas por Pagar',
      icon: Landmark,
      module: 'cxp',
      description: 'Facturas proveedores y pagos',
    },
    {
      id: 'clients',
      label: 'Clientes',
      icon: Users,
      module: 'clients',
      description: 'Crédito, zonas y categoría',
    },
    {
      id: 'client_analytics',
      label: 'Análisis de Clientes',
      icon: PieChart,
      module: 'client_analytics',
      description: 'Top 10 productos y facturas/mes',
    },
    {
      id: 'suppliers',
      label: 'Proveedores',
      icon: Building2,
      module: 'suppliers',
      description: 'Gestión y compras',
    },
    {
      id: 'reports',
      label: 'Reportes Financieros',
      icon: BarChart3,
      module: 'reports',
      description: 'Ventas, estados y zonas',
    },
  ];

  const roleLabels: Record<string, { label: string; badge: string }> = {
    admin: {
      label: 'Administrador',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/80',
    },
    gerente: {
      label: 'Administradora / Gerente',
      badge: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800/80',
    },
    cajero: {
      label: 'Caja',
      badge: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800/80',
    },
    almacen: {
      label: 'Almacén / Inventario',
      badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800/80',
    },
    contador: {
      label: 'Contador',
      badge: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800/80',
    },
  };

  const userRoleInfo = user
    ? roleLabels[user.role] || {
        label: user.role,
        badge: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      }
    : {
        label: 'Sin rol',
        badge: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };

  return (
    <aside className="w-72 bg-slate-200 dark:bg-[#10141b] text-slate-900 dark:text-slate-100 flex flex-col shrink-0 h-screen border-r border-slate-300 dark:border-[#283242] select-none transition-colors">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-300 dark:border-[#283242]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white tracking-wider shadow-xs">
            DR
          </div>
          <div className="overflow-hidden">
            <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight leading-none whitespace-nowrap">
              Distribuidora ROECA
            </h1>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mt-1 truncate">
              {activeBranch?.name || 'Sede Principal'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {menuItems.map((item) => {
          const allowed = hasPermission(item.module);
          const isActive = currentTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (allowed) {
                  setCurrentTab(item.id);
                }
              }}
              disabled={!allowed}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : allowed
                  ? 'text-slate-800 dark:text-slate-200 hover:bg-slate-300/75 dark:hover:bg-[#1a212c] hover:text-slate-950 dark:hover:text-white cursor-pointer'
                  : 'text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 ${
                  isActive
                    ? 'text-white'
                    : allowed
                    ? 'text-slate-600 dark:text-slate-400'
                    : 'text-slate-400 dark:text-slate-600'
                }`}
              />
              <div className="flex-1 truncate">
                <span className="block leading-tight truncate">{item.label}</span>
                <span
                  className={`block text-[11px] font-normal truncate ${
                    isActive ? 'text-emerald-50/90' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {item.description}
                </span>
              </div>
              {!allowed && (
                <span title="Módulo no habilitado para este usuario" className="shrink-0">
                  <ShieldAlert className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User profile & Session control */}
      <div className="p-4 border-t border-slate-300 dark:border-[#283242] bg-slate-300/60 dark:bg-[#0b0e14]">
        <div className="flex items-center justify-between mb-2">
          <div className="overflow-hidden pr-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {user?.name || 'Invitado'}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-mono truncate">
              @{user?.username || 'sin-usuario'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-2">
          <button
            onClick={onOpenAuth}
            className={`text-xs px-2.5 py-1 rounded border font-medium flex items-center gap-1.5 transition-colors ${userRoleInfo.badge} hover:brightness-95 dark:hover:brightness-110 cursor-pointer truncate`}
            title="Cambiar de operador con clave"
          >
            <UserCheck className="w-3 h-3 shrink-0" />
            <span className="truncate">{userRoleInfo.label}</span>
          </button>

          <button
            onClick={() => void lockOperatorSession()}
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-slate-300 dark:hover:bg-[#1a212c] rounded transition-colors cursor-pointer shrink-0"
            title="Bloquear ventana de seguridad"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
