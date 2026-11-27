import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Receipt,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Award,
  Package,
  RefreshCw,
  ArrowRight,
  Tag,
  Wallet,
  MapPin,
  HardDriveDownload,
  UserPlus,
  ClipboardList,
  Link2,
  GitBranch,
  Plus,
  Clock,
  CheckCircle2,
  PackagePlus,
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
  onNavigateToLowStock?: () => void;
  onRefresh?: () => void;
  requestedAdminTab?: { tab: AdminTab; seq: number } | null;
}

type CurrencyDisplay = 'VES' | 'USD';
type DueFilter = 'urgentes' | 'todas';

function getDueStatusInfo(daysUntilDue: number): {
  label: string;
  textClass: string;
} {
  if (daysUntilDue < 0) {
    const abs = Math.abs(daysUntilDue);
    return {
      label: abs === 1 ? 'Vencida hace 1 día' : `Vencida hace ${abs} días`,
      textClass: 'text-rose-600 dark:text-rose-400 font-semibold',
    };
  }
  if (daysUntilDue === 0) {
    return {
      label: 'Vence hoy',
      textClass: 'text-amber-700 dark:text-amber-400 font-semibold',
    };
  }
  if (daysUntilDue === 1) {
    return {
      label: 'Vence mañana',
      textClass: 'text-amber-700 dark:text-amber-400 font-semibold',
    };
  }
  if (daysUntilDue <= 7) {
    return {
      label: `Vence en ${daysUntilDue} días`,
      textClass: 'text-amber-700 dark:text-amber-400 font-medium',
    };
  }
  return {
    label: `Vence en ${daysUntilDue} días`,
    textClass: 'text-slate-500 dark:text-slate-400',
  };
}

export const Dashboard: React.FC<DashboardProps> = ({
  stats: propsStats,
  exchangeRate,
  onNavigate,
  onNavigateToPOS,
  onNavigateToCxC,
  onNavigateToCxP,
  onNavigateToLowStock,
  onRefresh,
  requestedAdminTab,
}) => {
  const { hasPermission } = useAuth();
  const [internalStats, setInternalStats] = useState<DashboardStats | null>(propsStats || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currencyMode, setCurrencyMode] = useState<CurrencyDisplay>('VES');
  const [cxcFilter, setCxcFilter] = useState<DueFilter>('urgentes');
  const [cxpFilter, setCxpFilter] = useState<DueFilter>('urgentes');
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);
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

  const fetchStatsDirect = async () => {
    setIsRefreshing(true);
    try {
      const r = await apiFetch('/api/dashboard/stats');
      if (r.ok) {
        setInternalStats(await r.json());
      }
      if (onRefresh) {
        await Promise.resolve(onRefresh());
      }
    } catch (e) {
      console.error('Error refreshing dashboard stats', e);
    } finally {
      setIsRefreshing(false);
    }
  };

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
  const rate = exchangeRate?.rate || stats?.currentExchangeRate || 76.5;

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

  const formatUsd = (val: number) =>
    `$${(Number(val) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatVes = (valUsd: number) =>
    `Bs. ${((Number(valUsd) || 0) * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatPrimary = (valUsd: number) => (currencyMode === 'VES' ? formatVes(valUsd) : formatUsd(valUsd));
  const formatSecondary = (valUsd: number) =>
    currencyMode === 'VES' ? `Ref. ${formatUsd(valUsd)}` : formatVes(valUsd);

  const monthLabel = useMemo(() => {
    const label = new Date().toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, []);

  const dayOfMonth = Math.max(1, new Date().getDate());

  const salesToday = stats?.salesTodayUsd || 0;
  const salesTodayCount = stats?.salesTodayCount || 0;
  const netProfitToday = stats?.netProfitTodayUsd || 0;

  const salesMonth = stats?.salesMonthUsd || 0;
  const salesMonthCount = stats?.salesMonthCount || 0;
  const dailyAvgMonth = salesMonth / dayOfMonth;

  const cogsMonth = stats?.cogsMonthUsd || 0;
  const netProfitMonth = stats?.netProfitMonthUsd || 0;
  const netProfitMarginPct = stats?.netProfitMarginPct || 0;

  const topProduct = stats?.topProduct || null;
  const topProducts = stats?.topProducts || [];
  const topProductScope = stats?.topProductScope || 'mes';

  const lowStockCount = stats?.lowStockCount || 0;
  const outOfStockCount = stats?.outOfStockCount || 0;
  const lowStockProducts = stats?.lowStockProducts || [];

  const allReceivables = stats?.upcomingReceivables || [];
  const filteredReceivables = useMemo(() => {
    if (cxcFilter === 'todas') return allReceivables;
    return allReceivables.filter((r) => r.daysUntilDue <= 7);
  }, [allReceivables, cxcFilter]);

  const allPayables = stats?.upcomingPayables || [];
  const filteredPayables = useMemo(() => {
    if (cxpFilter === 'todas') return allPayables;
    return allPayables.filter((p) => p.daysUntilDue <= 7);
  }, [allPayables, cxpFilter]);

  const dailyTrend = stats?.dailyTrend || [];
  const maxTrendUsd = useMemo(() => {
    const m = dailyTrend.reduce((acc, d) => Math.max(acc, d.salesUsd, Math.max(0, d.profitUsd)), 0);
    return m > 0 ? m : 1;
  }, [dailyTrend]);

  const activeDayPoint = hoveredDayIdx !== null ? dailyTrend[hoveredDayIdx] : null;

  const incomeTotal = stats?.incomeUsd || 0;
  const expenseTotal = stats?.expenseUsd || 0;
  const netFlow = stats?.netCashFlowUsd ?? incomeTotal - expenseTotal;

  const cxcTotal = stats?.cxcTotalUsd || 0;
  const cxpTotal = stats?.cxpTotalUsd || 0;
  const cxcUrgentCount = (stats?.cxcOverdueCount || 0) + (stats?.cxcDueSoonCount || 0);
  const cxcUrgentUsd = (stats?.cxcOverdueUsd || 0) + (stats?.cxcDueSoonUsd || 0);
  const cxpUrgentCount = (stats?.cxpOverdueCount || 0) + (stats?.cxpDueSoonCount || 0);
  const cxpUrgentUsd = (stats?.cxpOverdueUsd || 0) + (stats?.cxpDueSoonUsd || 0);

  return (
    <div className="space-y-6">
      {/* Executive Header Bar */}
      <div className="bg-white dark:bg-[#161b22] p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Dashboard Ejecutivo
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span>Distribuidora ROECA</span>
              <span aria-hidden="true">·</span>
              <span>{monthLabel}</span>
              <span aria-hidden="true">·</span>
              <span>
                Tasa BCV{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  {rate.toFixed(2)} Bs/$
                </strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Currency Segmented Toggle */}
            <div
              className="flex items-center p-1 bg-slate-100 dark:bg-[#0d1117] border border-slate-200 dark:border-[#262f3c] rounded-lg"
              role="group"
              aria-label="Moneda principal del dashboard"
            >
              <button
                type="button"
                onClick={() => setCurrencyMode('VES')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  currencyMode === 'VES'
                    ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Bolívares (Bs.)
              </button>
              <button
                type="button"
                onClick={() => setCurrencyMode('USD')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  currencyMode === 'USD'
                    ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Divisas ($ USD)
              </button>
            </div>

            <button
              type="button"
              onClick={() => void fetchStatsDirect()}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>

            {hasPermission('billing') && (
              <button
                type="button"
                onClick={() => navigateTo('billing')}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva Factura</span>
              </button>
            )}
          </div>
        </div>

        {/* Administrative Quick Shortcuts */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3.5 mt-4 border-t border-slate-100 dark:border-[#262f3c] text-xs">
          {hasPermission('exchange') && (
            <button
              type="button"
              onClick={() => openAdminSection('tasa')}
              className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Tasa BCV</span>
            </button>
          )}

          {hasPermission('branches') && (
            <button
              type="button"
              onClick={() => openAdminSection('sucursales')}
              className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Sucursales</span>
            </button>
          )}

          {hasPermission('inventory') && (
            <button
              type="button"
              onClick={() => openAdminSection('categorias')}
              className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Categorías</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => openAdminSection('zonas')}
            className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Zonas / Estados</span>
          </button>

          {hasPermission('users_admin') && (
            <button
              type="button"
              onClick={() => openAdminSection('operadores')}
              className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Usuarios y Permisos</span>
            </button>
          )}

          {hasPermission('backup') && (
            <>
              <button
                type="button"
                onClick={() => openAdminSection('backup')}
                className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <HardDriveDownload className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span>Respaldo</span>
              </button>
              <button
                type="button"
                onClick={() => openAdminSection('auditoria')}
                className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ClipboardList className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Registro de Actividad</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsShareModalOpen(true)}
            className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Link2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Enlace Remoto</span>
          </button>
        </div>
      </div>

      <PWAInstallButton
        externalOpen={isShareModalOpen}
        onExternalClose={() => setIsShareModalOpen(false)}
      />

      {/* Row 1: 4 Primary Executive KPIs */}
      {!stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#161b22] p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] h-36 animate-pulse"
            >
              <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded mb-4" />
              <div className="h-7 w-40 bg-slate-200 dark:bg-slate-800 rounded mb-3" />
              <div className="h-3 w-32 bg-slate-100 dark:bg-slate-800/70 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* KPI 1: Facturación del Día */}
          <div className="bg-white dark:bg-[#161b22] p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Facturación del Día
              </span>
              <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight truncate">
                {formatPrimary(salesToday)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-1 truncate">
                {formatSecondary(salesToday)}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono tabular-nums">
                {salesTodayCount} {salesTodayCount === 1 ? 'factura' : 'facturas'} hoy
              </span>
              <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                Util. {formatUsd(netProfitToday)}
              </span>
            </div>
          </div>

          {/* KPI 2: Facturación Mensual */}
          <div className="bg-white dark:bg-[#161b22] p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Facturación Mensual
              </span>
              <Calendar className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight truncate">
                {formatPrimary(salesMonth)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-1 truncate">
                {formatSecondary(salesMonth)}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono tabular-nums">
                {salesMonthCount} {salesMonthCount === 1 ? 'factura' : 'facturas'}
              </span>
              <span className="font-mono tabular-nums">
                Prom. {formatUsd(dailyAvgMonth)}/día
              </span>
            </div>
          </div>

          {/* KPI 3: Utilidad Neta Mensual */}
          <div className="bg-white dark:bg-[#161b22] p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Utilidad Neta Mensual
              </span>
              <TrendingUp
                className={`w-4 h-4 shrink-0 ${
                  netProfitMonth >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              />
            </div>
            <div className="mt-3">
              <p
                className={`text-2xl font-bold font-mono tabular-nums tracking-tight truncate ${
                  netProfitMonth >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatPrimary(netProfitMonth)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-1 truncate">
                {formatSecondary(netProfitMonth)}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-between text-xs">
              <span
                className={`font-semibold font-mono tabular-nums ${
                  netProfitMonth >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                Margen {netProfitMarginPct.toFixed(1)}%
              </span>
              <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Costo {formatUsd(cogsMonth)}
              </span>
            </div>
          </div>

          {/* KPI 4: Producto Más Vendido */}
          <div className="bg-white dark:bg-[#161b22] p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Producto Más Vendido
              </span>
              <Award className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            </div>

            {topProduct ? (
              <>
                <div className="mt-3 min-w-0">
                  <p
                    className="text-base font-bold text-slate-900 dark:text-white leading-snug line-clamp-2"
                    title={topProduct.productName}
                  >
                    {topProduct.productName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-1">
                    {topProduct.unitsSold} {topProduct.unit} vendidos · {formatPrimary(topProduct.revenueUsd)}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{topProductScope === 'mes' ? 'Líder del mes' : 'Líder histórico'}</span>
                  <span className="font-mono tabular-nums">
                    Stock: <strong className="text-slate-800 dark:text-slate-200">{topProduct.currentStock}</strong>
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-3 flex-1 flex flex-col justify-between">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Sin ventas registradas aún
                </p>
                {hasPermission('billing') && (
                  <button
                    type="button"
                    onClick={() => navigateTo('billing')}
                    className="mt-4 pt-3 border-t border-slate-100 dark:border-[#262f3c] text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline text-left cursor-pointer"
                  >
                    Registrar primera venta →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Row 2: Focal Analytics Split — 14-Day Sales & Net Profit Chart + Top 5 Best-Selling Products */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Left: 14-Day Billing vs Net Profit Trend */}
        <div className="xl:col-span-8 bg-white dark:bg-[#161b22] p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100 dark:border-[#262f3c]">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Facturación y Utilidad Neta (Últimos 14 días)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {activeDayPoint ? (
                  <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                    {activeDayPoint.date} · Facturado {formatPrimary(activeDayPoint.salesUsd)} · Utilidad{' '}
                    {formatPrimary(activeDayPoint.profitUsd)} · {activeDayPoint.count}{' '}
                    {activeDayPoint.count === 1 ? 'factura' : 'facturas'}
                  </span>
                ) : (
                  <span>Pase el cursor sobre cada día para consultar el detalle exacto</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300 shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-800 dark:bg-sky-400 inline-block" />
                Facturación
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                Utilidad Neta
              </span>
            </div>
          </div>

          {dailyTrend.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
              Cargando tendencia diaria...
            </div>
          ) : (
            <div className="pt-6 pb-2">
              <div className="h-52 flex items-end gap-1.5 sm:gap-2.5 border-b border-slate-200 dark:border-[#262f3c] pb-2">
                {dailyTrend.map((point, idx) => {
                  const salesPct = Math.max(point.salesUsd > 0 ? 4 : 0, Math.round((point.salesUsd / maxTrendUsd) * 100));
                  const profitPct = Math.max(
                    point.profitUsd > 0 ? 4 : 0,
                    Math.round((Math.max(0, point.profitUsd) / maxTrendUsd) * 100)
                  );
                  const isHovered = hoveredDayIdx === idx;
                  return (
                    <div
                      key={point.date}
                      onMouseEnter={() => setHoveredDayIdx(idx)}
                      onMouseLeave={() => setHoveredDayIdx(null)}
                      className={`flex-1 h-full flex flex-col justify-end items-center group cursor-pointer rounded-t-md transition-colors px-0.5 ${
                        isHovered ? 'bg-slate-100/80 dark:bg-[#1e2632]/70' : ''
                      }`}
                    >
                      <div className="w-full h-full flex items-end justify-center gap-0.5 sm:gap-1 pt-2">
                        <div
                          style={{ height: `${salesPct}%` }}
                          className="w-1/2 max-w-[14px] bg-slate-800 dark:bg-sky-400 rounded-t-xs transition-all duration-150 group-hover:opacity-90"
                          title={`${point.date} · Facturación: ${formatPrimary(point.salesUsd)}`}
                        />
                        <div
                          style={{ height: `${profitPct}%` }}
                          className="w-1/2 max-w-[14px] bg-emerald-500 rounded-t-xs transition-all duration-150 group-hover:opacity-90"
                          title={`${point.date} · Utilidad Neta: ${formatPrimary(point.profitUsd)}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2.5 mt-2">
                {dailyTrend.map((point, idx) => (
                  <div
                    key={point.date}
                    className={`flex-1 text-center text-[10px] font-mono tabular-nums truncate ${
                      hoveredDayIdx === idx
                        ? 'text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {idx % 2 === 0 || idx === dailyTrend.length - 1 ? point.label : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasPermission('reports') && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Cálculo basado en ventas activas menos costo unitario de inventario
              </span>
              <button
                type="button"
                onClick={() => navigateTo('reports')}
                className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Ver reportes completos</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Top 5 Best-Selling Products */}
        <div className="xl:col-span-4 bg-white dark:bg-[#161b22] p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-[#262f3c]">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Top Productos Más Vendidos
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {topProductScope === 'mes' ? `Ranking de ${monthLabel}` : 'Ranking histórico acumulado'}
                </p>
              </div>
              <Award className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            </div>

            {topProducts.length === 0 ? (
              <div className="py-12 text-center">
                <Package className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Sin historial de productos vendidos
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Los artículos más rotados aparecerán al emitir facturas.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3.5">
                {topProducts.map((item, idx) => {
                  const maxUnits = Math.max(1, topProducts[0]?.unitsSold || 1);
                  const barPct = Math.max(8, Math.round((item.unitsSold / maxUnits) * 100));
                  return (
                    <div key={`${item.productId}-${item.productCode}`} className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate" title={item.productName}>
                            <span className="font-mono text-slate-400 dark:text-slate-500 mr-1.5">
                              {String(idx + 1).padStart(2, '0')}.
                            </span>
                            {item.productName}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                            {item.productCode} · Stock {item.currentStock}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                            {item.unitsSold} {item.unit}
                          </p>
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                            {formatPrimary(item.revenueUsd)}
                          </p>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-[#0d1117] rounded-full overflow-hidden">
                        <div
                          style={{ width: `${barPct}%` }}
                          className={`h-full rounded-full ${
                            idx === 0
                              ? 'bg-emerald-500'
                              : 'bg-slate-400 dark:bg-slate-500'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {hasPermission('inventory') && (
            <div className="mt-5 pt-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-end">
              <button
                type="button"
                onClick={() => navigateTo('inventory')}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Ver catálogo completo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 3: 3 Critical Operational Alerts — Inventario Bajo, CxC Próximas a Vencerse, CxP Próximas a Vencerse */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Alert Panel 1: Alerta de Inventario Bajo */}
        <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
          <div>
            <div className="p-5 pb-4 border-b border-slate-100 dark:border-[#262f3c] flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 ${
                      lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Alerta de Inventario Bajo
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                  {lowStockCount} {lowStockCount === 1 ? 'producto' : 'productos'} bajo mínimo · {outOfStockCount}{' '}
                  {outOfStockCount === 1 ? 'agotado' : 'agotados'}
                </p>
              </div>
              {hasPermission('inventory') && (
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateToLowStock) onNavigateToLowStock();
                    else navigateTo('inventory');
                  }}
                  className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Revisar →
                </button>
              )}
            </div>

            {lowStockProducts.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Inventario en niveles óptimos
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Ningún artículo se encuentra por debajo del stock mínimo.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#262f3c] max-h-80 overflow-y-auto">
                {lowStockProducts.map((prod) => {
                  const isOut = prod.stock <= 0;
                  const isCritical = !isOut && prod.stock <= Math.max(1, prod.minStock * 0.4);
                  return (
                    <div
                      key={prod.id}
                      className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#1c222b] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate" title={prod.name}>
                          {prod.name}
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                          <span>{prod.code}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              isOut
                                ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                : isCritical
                                ? 'text-amber-700 dark:text-amber-400 font-semibold'
                                : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            {isOut ? 'Agotado' : isCritical ? 'Crítico' : 'Stock bajo'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <p
                          className={`text-xs font-bold ${
                            isOut ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {prod.stock} / {prod.minStock}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          {prod.unit}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              {lowStockCount > lowStockProducts.length
                ? `Mostrando ${lowStockProducts.length} de ${lowStockCount}`
                : 'Ordenado por urgencia'}
            </span>
            {hasPermission('receiving') && (
              <button
                type="button"
                onClick={() => navigateTo('receiving')}
                className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                <span>Cargar mercancía</span>
              </button>
            )}
          </div>
        </div>

        {/* Alert Panel 2: Cuentas por Cobrar Próximas a Vencerse (CxC) */}
        <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
          <div>
            <div className="p-5 pb-4 border-b border-slate-100 dark:border-[#262f3c] space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ArrowDownRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Cuentas por Cobrar por Vencer
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                    {cxcUrgentCount} {cxcUrgentCount === 1 ? 'urgente' : 'urgentes'} ({formatPrimary(cxcUrgentUsd)}) · Total{' '}
                    {formatUsd(cxcTotal)}
                  </p>
                </div>
                {hasPermission('cxc') && (
                  <button
                    type="button"
                    onClick={() => navigateTo('cxc')}
                    className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Ir a CxC →
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-[#0d1117] rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setCxcFilter('urgentes')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    cxcFilter === 'urgentes'
                      ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  ≤ 7 días / Vencidas ({cxcUrgentCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCxcFilter('todas')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    cxcFilter === 'todas'
                      ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Todas ({allReceivables.length})
                </button>
              </div>
            </div>

            {filteredReceivables.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {cxcFilter === 'urgentes'
                    ? 'Sin cobros vencidos ni por vencer en 7 días'
                    : 'No hay cuentas por cobrar pendientes'}
                </p>
                {cxcFilter === 'urgentes' && allReceivables.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCxcFilter('todas')}
                    className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Ver {allReceivables.length} facturas vigentes
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#262f3c] max-h-80 overflow-y-auto">
                {filteredReceivables.map((rec) => {
                  const dueInfo = getDueStatusInfo(rec.daysUntilDue);
                  return (
                    <div
                      key={rec.id}
                      onClick={() => hasPermission('cxc') && navigateTo('cxc')}
                      className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#1c222b] transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate" title={rec.clientName}>
                          {rec.clientName}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] mt-0.5">
                          <span className="font-mono text-slate-500 dark:text-slate-400">{rec.invoiceNumber}</span>
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          <span className={dueInfo.textClass}>{dueInfo.label}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          {formatPrimary(rec.balanceDueUsd)}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          Vence {rec.dueDate}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              {stats?.cxcOverdueCount || 0} vencidas · {stats?.cxcDueSoonCount || 0} esta semana
            </span>
            <span className="font-mono tabular-nums">{stats?.cxcDebtorsCount || 0} clientes</span>
          </div>
        </div>

        {/* Alert Panel 3: Cuentas por Pagar Próximas a Vencerse (CxP) */}
        <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
          <div>
            <div className="p-5 pb-4 border-b border-slate-100 dark:border-[#262f3c] space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Cuentas por Pagar por Vencer
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                    {cxpUrgentCount} {cxpUrgentCount === 1 ? 'urgente' : 'urgentes'} ({formatPrimary(cxpUrgentUsd)}) · Total{' '}
                    {formatUsd(cxpTotal)}
                  </p>
                </div>
                {hasPermission('cxp') && (
                  <button
                    type="button"
                    onClick={() => navigateTo('cxp')}
                    className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Ir a CxP →
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-[#0d1117] rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setCxpFilter('urgentes')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    cxpFilter === 'urgentes'
                      ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  ≤ 7 días / Vencidas ({cxpUrgentCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCxpFilter('todas')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    cxpFilter === 'todas'
                      ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Todas ({allPayables.length})
                </button>
              </div>
            </div>

            {filteredPayables.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {cxpFilter === 'urgentes'
                    ? 'Sin pagos vencidos ni por vencer en 7 días'
                    : 'No hay cuentas por pagar pendientes'}
                </p>
                {cxpFilter === 'urgentes' && allPayables.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCxpFilter('todas')}
                    className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    Ver {allPayables.length} facturas pendientes
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#262f3c] max-h-80 overflow-y-auto">
                {filteredPayables.map((pay) => {
                  const dueInfo = getDueStatusInfo(pay.daysUntilDue);
                  return (
                    <div
                      key={pay.id}
                      onClick={() => hasPermission('cxp') && navigateTo('cxp')}
                      className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#1c222b] transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate" title={pay.supplierName}>
                          {pay.supplierName}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] mt-0.5">
                          <span className="font-mono text-slate-500 dark:text-slate-400">{pay.invoiceNumber}</span>
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          <span className={dueInfo.textClass}>{dueInfo.label}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          {formatPrimary(pay.balanceDueUsd)}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          {pay.isEstimatedDueDate ? `Est. ${pay.dueDate}` : `Vence ${pay.dueDate}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              {stats?.cxpOverdueCount || 0} vencidas · {stats?.cxpDueSoonCount || 0} esta semana
            </span>
            <span className="font-mono tabular-nums">{stats?.cxpCreditorsCount || 0} proveedores</span>
          </div>
        </div>
      </div>

      {/* Row 4: Compact Real Cash Flow Strip */}
      <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] p-5 transition-colors">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-[#262f3c] gap-4 md:gap-0">
          <div className="md:pr-6">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Ingresos Cobrados (Clientes)</span>
              <ArrowDownRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums mt-1.5">
              {formatPrimary(incomeTotal)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              {formatSecondary(incomeTotal)}
            </p>
          </div>

          <div className="pt-4 md:pt-0 md:px-6">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Egresos Pagados (Proveedores)</span>
              <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <p className="text-lg font-bold text-rose-700 dark:text-rose-400 font-mono tabular-nums mt-1.5">
              {formatPrimary(expenseTotal)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              {formatSecondary(expenseTotal)}
            </p>
          </div>

          <div className="pt-4 md:pt-0 md:pl-6">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Flujo de Caja Neto</span>
              <Wallet className="w-4 h-4 text-slate-400" />
            </div>
            <p
              className={`text-lg font-bold font-mono tabular-nums mt-1.5 ${
                netFlow >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {formatPrimary(netFlow)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              {formatSecondary(netFlow)}
            </p>
          </div>
        </div>
      </div>

      {/* Centro de Administración: Tasa BCV, Categorías, Operadores, Zonas/Estados y Respaldo */}
      <ControlPanelAdmin
        exchangeRate={exchangeRate}
        onRateUpdated={onRefresh}
        initialTab={adminTab}
      />
    </div>
  );
};
