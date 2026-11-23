import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Receipt,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Calendar,
  Wallet,
  Tag,
  Users,
  MapPin,
  HardDriveDownload,
  UserPlus,
  ClipboardList,
  Link2,
  GitBranch,
} from 'lucide-react';
import { DashboardStats, ExchangeRate } from '../types/index.ts';
import { ControlPanelAdmin, AdminTab } from './ControlPanelAdmin.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface DashboardProps {
  stats?: DashboardStats | null;
  exchangeRate: ExchangeRate | null;
  onNavigate?: (tab: string) => void;
  onNavigateToPOS?: () => void;
  onNavigateToCxC?: () => void;
  onNavigateToCxP?: () => void;
  onRefresh?: () => void;
  requestedAdminTab?: { tab: AdminTab; seq: number } | null;
}

export const Dashboard: React.FC<DashboardProps> = ({
  stats: propsStats,
  exchangeRate,
  onNavigate,
  onNavigateToPOS,
  onNavigateToCxC,
  onNavigateToCxP,
  onRefresh,
  requestedAdminTab,
}) => {
  const { hasPermission } = useAuth();
  const [internalStats, setInternalStats] = useState<DashboardStats | null>(propsStats || null);
  const [adminTab, setAdminTab] = useState<AdminTab>('tasa');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const openAdminSection = (tab: AdminTab) => {
    setAdminTab(tab);
    setTimeout(() => {
      document.getElementById('panel-admin-config')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  useEffect(() => {
    if (requestedAdminTab?.tab) {
      openAdminSection(requestedAdminTab.tab);
    }
  }, [requestedAdminTab]);

  useEffect(() => {
    if (propsStats) {
      setInternalStats(propsStats);
    } else {
      apiFetch('/api/dashboard/stats')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setInternalStats(data);
        })
        .catch(console.error);
    }
  }, [propsStats]);

  const stats = propsStats || internalStats;
  const rate = exchangeRate?.rate || 76.5;

  const navigateTo = (tab: string) => {
    if (tab === 'billing' && onNavigateToPOS) {
      onNavigateToPOS();
    } else if (tab === 'cxc' && onNavigateToCxC) {
      onNavigateToCxC();
    } else if (tab === 'cxp' && onNavigateToCxP) {
      onNavigateToCxP();
    } else if (onNavigate) {
      onNavigate(tab);
    }
  };

  const formatUsd = (val: number) => `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatVes = (valUsd: number) => `Bs. ${(valUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const salesToday = stats?.salesTodayUsd || 0;
  const salesMonth = stats?.salesMonthUsd || 0;
  const cxcTotal = stats?.cxcTotalUsd || 0;
  const cxpTotal = stats?.cxpTotalUsd || 0;
  const incomeTotal = stats?.incomeUsd || 0;
  const expenseTotal = stats?.expenseUsd || 0;
  const netFlow = stats?.netCashFlowUsd || (incomeTotal - expenseTotal);
  const lowStockCount = stats?.lowStockCount || 0;

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions with Soft Dark Mode */}
      <div className="flex flex-col gap-4 bg-white dark:bg-[#161b22] p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs transition-colors">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Panel de Control y Flujo de Caja
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Distribuidora ROECA · Resumen consolidado en tiempo real con tasa oficial de{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-200 font-mono tabular-nums">{rate.toFixed(2)} Bs/$</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasPermission('users_admin') && (
              <button
                onClick={() => openAdminSection('operadores')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Crear Usuarios y Claves</span>
              </button>
            )}

            {hasPermission('backup') && (
              <button
                onClick={() => openAdminSection('backup')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              >
                <HardDriveDownload className="w-4 h-4" />
                <span>Copia de Seguridad</span>
              </button>
            )}
          </div>
        </div>

        {/* Secondary Administrative Shortcuts */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-[#262f3c]">
          {hasPermission('exchange') && (
            <button
              onClick={() => openAdminSection('tasa')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span>Tasa del Día (BCV)</span>
            </button>
          )}

          {hasPermission('branches') && (
            <button
              onClick={() => openAdminSection('sucursales')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5 text-teal-500" />
              <span>Sucursales</span>
            </button>
          )}

          {hasPermission('inventory') && (
            <button
              onClick={() => openAdminSection('categorias')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5 text-sky-500" />
              <span>Categorías</span>
            </button>
          )}

          <button
            onClick={() => openAdminSection('zonas')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5 text-amber-500" />
            <span>Zonas / Estados</span>
          </button>

          {hasPermission('backup') && (
            <button
              onClick={() => openAdminSection('auditoria')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <ClipboardList className="w-3.5 h-3.5 text-purple-500" />
              <span>Registro por Usuario</span>
            </button>
          )}

          <button
            onClick={() => setIsShareModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            <Link2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Enlace Remoto / App Offline</span>
          </button>

          {hasPermission('users_admin') && (
            <button
              onClick={() => openAdminSection('operadores')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>Permisos por Módulo</span>
            </button>
          )}
        </div>
      </div>

      <PWAInstallButton
        externalOpen={isShareModalOpen}
        onExternalClose={() => setIsShareModalOpen(false)}
      />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* 1. Ventas de Hoy */}
        <div className="bg-white dark:bg-[#161b22] p-4 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">Ventas de Hoy</span>
            <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">{formatVes(salesToday)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums truncate">Ref. {formatUsd(salesToday)}</p>
          <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            {stats?.salesTodayCount || 0} comprobantes
          </div>
        </div>

        {/* 2. Ventas del Mes */}
        <div className="bg-white dark:bg-[#161b22] p-4 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">Ventas del Mes</span>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">{formatVes(salesMonth)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums truncate">Ref. {formatUsd(salesMonth)}</p>
          <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Acumulado mensual</div>
        </div>

        {/* 3. Cuentas por Cobrar (CxC) */}
        <div className="bg-white dark:bg-[#161b22] p-4 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">Por Cobrar (CxC)</span>
            <ArrowDownRight className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-base font-bold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">{formatVes(cxcTotal)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums truncate">Ref. {formatUsd(cxcTotal)}</p>
          <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            {stats?.cxcDebtorsCount || 0} clientes crédito
          </div>
        </div>

        {/* 4. Cuentas por Pagar (CxP) */}
        <div className="bg-white dark:bg-[#161b22] p-4 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">Por Pagar (CxP)</span>
            <ArrowUpRight className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-base font-bold text-rose-700 dark:text-rose-400 font-mono tabular-nums">{formatVes(cxpTotal)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums truncate">Ref. {formatUsd(cxpTotal)}</p>
          <div className="mt-2 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
            {stats?.cxpCreditorsCount || 0} proveedores
          </div>
        </div>

        {/* 5. Flujo de Caja Neto */}
        <div className="bg-white dark:bg-[#161b22] p-4 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">Flujo Neto Caja</span>
            <Wallet className="w-4 h-4 text-indigo-400" />
          </div>
          <p className={`text-base font-bold font-mono tabular-nums ${netFlow >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {formatVes(netFlow)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums truncate">Ref. {formatUsd(netFlow)}</p>
          <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Cobros vs Pagos</div>
        </div>

        {/* 6. Alertas de Stock Bajo */}
        <div className={`p-4 rounded-xl border shadow-xs transition-colors ${
          lowStockCount > 0 ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60' : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-[#262f3c]'
        }`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">Alertas Stock</span>
            <AlertTriangle className={`w-4 h-4 ${lowStockCount > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <p className={`text-lg font-bold font-mono tabular-nums ${lowStockCount > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-slate-900 dark:text-slate-100'}`}>
            {lowStockCount} ítems
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Bajo mínimo</p>
          <div className="mt-2">
            <button
              onClick={() => navigateTo('inventory')}
              className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline font-semibold cursor-pointer"
            >
              Revisar reposición →
            </button>
          </div>
        </div>
      </div>

      {/* Flujo de Caja & Métodos de Pago Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ingresos Cobrados vs Egresos Pagados */}
        <div className="bg-white dark:bg-[#161b22] p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs transition-colors">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#262f3c]">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Flujo de Efectivo Real</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Cobros recibidos de clientes vs pagos realizados a proveedores</p>
            </div>
            <span className="text-xs px-2.5 py-1 bg-slate-100 dark:bg-[#1c222b] text-slate-700 dark:text-slate-300 rounded-md font-medium border border-slate-200 dark:border-[#2d3748]">
              Multimoneda USD/VES
            </span>
          </div>

          <div className="mt-4 space-y-3.5">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-[#16231e] border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-emerald-800 dark:text-emerald-400">Total Ingresos Cobrados (Clientes)</span>
                <p className="text-lg font-bold text-emerald-950 dark:text-emerald-300 font-mono tabular-nums">{formatVes(incomeTotal)}</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400/80 font-mono tabular-nums">Ref. {formatUsd(incomeTotal)}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
                <ArrowDownRight className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-rose-50 dark:bg-[#24171d] border border-rose-100 dark:border-rose-900/50 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-rose-800 dark:text-rose-400">Total Egresos Pagados (Proveedores)</span>
                <p className="text-lg font-bold text-rose-950 dark:text-rose-300 font-mono tabular-nums">{formatVes(expenseTotal)}</p>
                <p className="text-xs text-rose-700 dark:text-rose-400/80 font-mono tabular-nums">Ref. {formatUsd(expenseTotal)}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-700 dark:text-rose-300">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Saldo Neto en Caja:</span>
              <span className={`font-bold font-mono tabular-nums text-base ${netFlow >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                {formatVes(netFlow)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(Ref. {formatUsd(netFlow)})</span>
              </span>
            </div>
          </div>
        </div>

        {/* Canales de Pago Admitidos */}
        <div className="bg-white dark:bg-[#161b22] p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs transition-colors">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#262f3c]">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Métodos de Pago y Validación</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Mecanismos con conversión automática y registro de recibos</p>
            </div>
            <DollarSign className="w-5 h-5 text-slate-400" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-[#2d3748] bg-slate-50 dark:bg-[#1c222b]">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block">Efectivo Divisas ($)</span>
              <span className="text-slate-500 dark:text-slate-400 text-[11px] block mt-0.5">Dólares en físico caja chica</span>
              <span className="inline-block mt-2 font-mono font-medium text-emerald-700 dark:text-emerald-400">Tasa 1:1 USD</span>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-[#2d3748] bg-slate-50 dark:bg-[#1c222b]">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block">Punto de Venta (POS)</span>
              <span className="text-slate-500 dark:text-slate-400 text-[11px] block mt-0.5">Tarjetas débito/crédito</span>
              <span className="inline-block mt-2 font-mono font-medium text-sky-600 dark:text-sky-400">En Bolívares</span>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-[#2d3748] bg-slate-50 dark:bg-[#1c222b]">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block">Pago Móvil Interbancario</span>
              <span className="text-slate-500 dark:text-slate-400 text-[11px] block mt-0.5">Validación de referencia</span>
              <span className="inline-block mt-2 font-mono font-medium text-purple-600 dark:text-purple-400">Comprobante</span>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-[#2d3748] bg-slate-50 dark:bg-[#1c222b]">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block">Transferencias Bancarias</span>
              <span className="text-slate-500 dark:text-slate-400 text-[11px] block mt-0.5">Banesco, Mercantil, BDV</span>
              <span className="inline-block mt-2 font-mono font-medium text-indigo-600 dark:text-indigo-400">N° confirmación</span>
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-100 dark:bg-[#1c222b] rounded-lg text-xs text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#2d3748] flex items-center justify-between">
            <span>¿Desea cambiar la tasa de cambio del día?</span>
            <button
              onClick={() => openAdminSection('tasa')}
              className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
            >
              Configurar Tasa
            </button>
          </div>
        </div>
      </div>

      {/* Centro de Administración en el Panel de Control: Tasa BCV, Categorías, Operadores y Zonas/Estados */}
      <ControlPanelAdmin
        exchangeRate={exchangeRate}
        onRateUpdated={onRefresh}
        initialTab={adminTab}
      />
    </div>
  );
};
