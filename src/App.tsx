/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ThemeProvider, useTheme } from './context/ThemeContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { AdminTab } from './components/ControlPanelAdmin.tsx';
import { POSBilling } from './components/POSBilling.tsx';
import { Inventory } from './components/Inventory.tsx';
import { MerchandiseEntry } from './components/MerchandiseEntry.tsx';
import { AccountsReceivable } from './components/AccountsReceivable.tsx';
import { AccountsPayable } from './components/AccountsPayable.tsx';
import { Clients } from './components/Clients.tsx';
import { ClientAnalytics } from './components/ClientAnalytics.tsx';
import { Suppliers } from './components/Suppliers.tsx';
import { FinancialReports } from './components/FinancialReports.tsx';
import { ExchangeRateModule } from './components/ExchangeRateModule.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { ExchangeRateModal } from './components/ExchangeRateModal.tsx';
import { BranchesModal } from './components/BranchesModal.tsx';
import { OperatorLoginModal } from './components/OperatorLoginModal.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { ExchangeRate, DashboardStats, ModuleKey, UserProfile } from './types/index.ts';
import { apiFetch } from './lib/firestoreStore.ts';
import {
  ShieldAlert,
  Loader2,
  Menu,
  TrendingUp,
  Sun,
  Moon,
  KeyRound,
  Lock,
} from 'lucide-react';

const isCashierFullscreenUser = (u: UserProfile | null): boolean => {
  if (!u) return false;
  const uname = (u.username || '').trim().toLowerCase();
  const displayName = (u.name || '').trim().toLowerCase();
  const emailPrefix = (u.email || '').split('@')[0].trim().toLowerCase();
  const cajaRegex = /^caja[\s_-]*[1-6]$/;
  const isNamedCaja1To6 =
    cajaRegex.test(uname) || cajaRegex.test(displayName) || cajaRegex.test(emailPrefix);
  return isNamedCaja1To6 || u.role === 'cajero';
};

const NAV_ORDER: ModuleKey[] = [
  'dashboard',
  'billing',
  'inventory',
  'receiving',
  'cxc',
  'cxp',
  'clients',
  'client_analytics',
  'suppliers',
  'reports',
];

function MainLayout() {
  const { user, firebaseUser, authReady, isSeeding, hasPermission, activeBranch, lockOperatorSession } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isPosMenuOpen, setIsPosMenuOpen] = useState<boolean>(false);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const lastOperatorIdRef = useRef<number | null>(null);

  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
  const [isBranchesModalOpen, setIsBranchesModalOpen] = useState(false);
  const [initialLowStockFilter, setInitialLowStockFilter] = useState(false);
  const [dashboardAdminRequest, setDashboardAdminRequest] = useState<{ tab: AdminTab; seq: number } | null>(null);

  // Fetch exchange rate & dashboard statistics only when authenticated
  const fetchGlobalData = useCallback(async () => {
    if (!firebaseUser || !user) return;
    try {
      const [rateRes, statsRes] = await Promise.all([
        apiFetch('/api/exchange-rate'),
        apiFetch('/api/dashboard/stats'),
      ]);
      if (rateRes.ok) setExchangeRate(await rateRes.json());
      if (statsRes.ok) setDashboardStats(await statsRes.json());
    } catch (e) {
      console.error('Error fetching global store data', e);
    }
  }, [firebaseUser, user]);

  useEffect(() => {
    if (authReady && firebaseUser && user && !isSeeding) {
      fetchGlobalData();
    }
  }, [authReady, firebaseUser, user, isSeeding, fetchGlobalData]);

  // Automatically open Facturación (POS) when caja1..caja6 or any cajero signs in
  useEffect(() => {
    if (!user) {
      lastOperatorIdRef.current = null;
      setIsPosMenuOpen(false);
      return;
    }

    if (lastOperatorIdRef.current !== user.id) {
      lastOperatorIdRef.current = user.id;
      setIsPosMenuOpen(false);
      if (isCashierFullscreenUser(user) && hasPermission('billing')) {
        setCurrentTab('billing');
        return;
      }
    }

    if (!hasPermission(currentTab as ModuleKey)) {
      const firstAllowed = NAV_ORDER.find((m) => hasPermission(m));
      if (firstAllowed) {
        setCurrentTab(firstAllowed);
      }
    }
  }, [user, currentTab, hasPermission]);

  // Close the POS left menu drawer whenever navigating or pressing Escape
  useEffect(() => {
    setIsPosMenuOpen(false);
  }, [currentTab]);

  useEffect(() => {
    if (!isPosMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPosMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPosMenuOpen]);

  if (!authReady || isSeeding) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-[#0d1117] flex flex-col items-center justify-center p-6 text-slate-700 dark:text-slate-200">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
        <p className="text-sm font-semibold">
          {isSeeding
            ? 'Preparando base de datos, usuarios y catálogo de Mérida / Tucaní...'
            : 'Cargando Distribuidora ROECA C.A....'}
        </p>
      </div>
    );
  }

  // Direct Security Window: Usuario y Clave (no Google email gate)
  if (!user) {
    return <OperatorLoginModal />;
  }

  const handleNavigateToLowStock = () => {
    if (hasPermission('inventory')) {
      setInitialLowStockFilter(true);
      setCurrentTab('inventory');
    }
  };

  const isTabAllowed = (tab: string): boolean => {
    return hasPermission(tab as ModuleKey);
  };

  // Entering Facturación (POS) always expands to full screen; left menu only appears via the "Menú" button
  const isFullScreenBillingActive =
    currentTab === 'billing' && isTabAllowed('billing');

  const handleSelectSidebarTab = (tab: string) => {
    setIsPosMenuOpen(false);
    if (tab === 'branches') {
      setIsBranchesModalOpen(true);
    } else {
      setCurrentTab(tab);
      if (tab !== 'inventory') setInitialLowStockFilter(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-100 dark:bg-[#0d1117] overflow-hidden text-slate-900 dark:text-slate-100 antialiased selection:bg-emerald-500 selection:text-white transition-colors">
      {/* Persistent Left Navigation Menu on non-POS screens */}
      {!isFullScreenBillingActive && (
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={handleSelectSidebarTab}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
      )}

      {/* On-Demand Left Menu Drawer in Full-Screen POS Mode (opened only when user clicks "Menú") */}
      {isFullScreenBillingActive && isPosMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menú principal"
        >
          <div className="relative z-10 h-full shadow-2xl">
            <Sidebar
              currentTab={currentTab}
              setCurrentTab={handleSelectSidebarTab}
              onOpenAuth={() => {
                setIsPosMenuOpen(false);
                setIsAuthModalOpen(true);
              }}
              onClose={() => setIsPosMenuOpen(false)}
            />
          </div>
          <button
            type="button"
            aria-label="Cerrar menú lateral"
            onClick={() => setIsPosMenuOpen(false)}
            className="flex-1 bg-slate-950/45 backdrop-blur-[1px] cursor-pointer"
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header — ultra-compact strip in full-screen POS mode with "Menú" toggle button */}
        {isFullScreenBillingActive ? (
          <header className="h-11 bg-white dark:bg-[#161b22] border-b border-slate-200 dark:border-[#262f3c] px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setIsPosMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-[#212834] dark:hover:bg-[#2b3444] border border-slate-300 dark:border-[#344054] text-xs font-bold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Abrir menú lateral"
                aria-expanded={isPosMenuOpen}
              >
                <Menu className="w-3.5 h-3.5 shrink-0" />
                <span>Menú</span>
              </button>

              <div className="w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center font-bold text-white text-xs tracking-wider shrink-0 hidden sm:flex">
                DR
              </div>
              <div className="flex items-center gap-2 min-w-0 text-xs">
                <span className="font-bold text-slate-900 dark:text-white whitespace-nowrap shrink-0">
                  Facturación POS
                </span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600 hidden sm:inline">·</span>
                <span className="text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
                  {activeBranch?.name || 'Sede Principal'}
                </span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600 hidden md:inline">·</span>
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0 hidden md:inline">
                  @{user.username || user.name}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasPermission('exchange') ? (
                <button
                  type="button"
                  onClick={() => setIsExchangeModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/60 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                  title="Actualizar tasa BCV"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-bold">
                    {exchangeRate ? `${exchangeRate.rate.toFixed(2)} Bs/$` : 'BCV'}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 whitespace-nowrap shrink-0">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-bold">
                    {exchangeRate ? `${exchangeRate.rate.toFixed(2)} Bs/$` : 'BCV'}
                  </span>
                </div>
              )}

              <OfflineIndicator variant="badge" />

              <button
                type="button"
                onClick={toggleTheme}
                className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] border border-slate-200 dark:border-[#2d3748] text-slate-700 dark:text-slate-300 transition-colors cursor-pointer shrink-0"
                title={isDark ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
              >
                {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-500" />}
              </button>

              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] border border-slate-200 dark:border-[#2d3748] text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Cambiar de operador con usuario y clave"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span className="hidden lg:inline">Cambiar Usuario</span>
              </button>

              <button
                type="button"
                onClick={() => void lockOperatorSession()}
                className="p-1.5 rounded-md bg-slate-100 hover:bg-amber-100 dark:bg-[#1c222b] dark:hover:bg-amber-950/50 border border-slate-200 dark:border-[#2d3748] text-slate-600 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-pointer shrink-0"
                title="Bloquear caja y cerrar turno"
              >
                <Lock className="w-3.5 h-3.5" />
              </button>
            </div>
          </header>
        ) : (
          <Header
            exchangeRate={exchangeRate}
            onOpenExchangeModal={() => {
              if (hasPermission('dashboard')) {
                setCurrentTab('dashboard');
                setDashboardAdminRequest({ tab: 'tasa', seq: Date.now() });
              } else {
                setIsExchangeModalOpen(true);
              }
            }}
            onOpenBranchesModal={() => {
              if (hasPermission('dashboard')) {
                setCurrentTab('dashboard');
                setDashboardAdminRequest({ tab: 'sucursales', seq: Date.now() });
              } else {
                setIsBranchesModalOpen(true);
              }
            }}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            lowStockCount={dashboardStats?.lowStockCount || 0}
            onNavigateToLowStock={handleNavigateToLowStock}
          />
        )}

        {/* Offline / Reconnect Sync Banner */}
        <OfflineIndicator variant="banner" />

        {/* Content Viewport */}
        <main
          className={`flex-1 ${
            currentTab === 'billing'
              ? isFullScreenBillingActive
                ? 'overflow-y-auto lg:overflow-hidden p-2 flex flex-col min-h-0 w-full'
                : 'overflow-y-auto lg:overflow-hidden p-2.5 sm:p-3 flex flex-col min-h-0'
              : 'overflow-y-auto p-6'
          }`}
        >
          {!isTabAllowed(currentTab) ? (
            <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center max-w-lg mx-auto mt-12 shadow-xs">
              <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Módulo con Acceso Restringido</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-6">
                El usuario <span className="font-bold font-mono text-slate-800 dark:text-slate-200">@{user.username}</span> no tiene habilitado este módulo en su perfil de seguridad.
              </p>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors shadow-xs"
              >
                Cambiar de Usuario con Clave
              </button>
            </div>
          ) : (
            <>
              {currentTab === 'dashboard' && (
                <Dashboard
                  stats={dashboardStats}
                  exchangeRate={exchangeRate}
                  onNavigate={(tab) => {
                    setCurrentTab(tab);
                    if (tab === 'inventory') setInitialLowStockFilter(false);
                  }}
                  onNavigateToLowStock={handleNavigateToLowStock}
                  onRefresh={fetchGlobalData}
                  requestedAdminTab={dashboardAdminRequest}
                />
              )}

              {currentTab === 'billing' && (
                <POSBilling
                  exchangeRate={exchangeRate}
                  onSaleCompleted={fetchGlobalData}
                />
              )}

              {currentTab === 'inventory' && (
                <Inventory
                  exchangeRate={exchangeRate}
                  initialLowStockFilter={initialLowStockFilter}
                />
              )}

              {currentTab === 'receiving' && (
                <MerchandiseEntry
                  exchangeRate={exchangeRate}
                  onEntryCompleted={fetchGlobalData}
                  onNavigate={(tab) => setCurrentTab(tab)}
                />
              )}

              {currentTab === 'cxc' && (
                <AccountsReceivable
                  exchangeRate={exchangeRate}
                  onPaymentRegistered={fetchGlobalData}
                />
              )}

              {currentTab === 'cxp' && (
                <AccountsPayable
                  exchangeRate={exchangeRate}
                  onPaymentRegistered={fetchGlobalData}
                />
              )}

              {currentTab === 'clients' && (
                <Clients
                  exchangeRate={exchangeRate}
                  onNavigateToCxC={() => setCurrentTab('cxc')}
                  onPaymentRegistered={fetchGlobalData}
                />
              )}

              {currentTab === 'client_analytics' && (
                <ClientAnalytics exchangeRate={exchangeRate} />
              )}

              {currentTab === 'suppliers' && (
                <Suppliers
                  exchangeRate={exchangeRate}
                  onNavigateToCxP={() => setCurrentTab('cxp')}
                />
              )}

              {currentTab === 'reports' && (
                <FinancialReports exchangeRate={exchangeRate} />
              )}

              {currentTab === 'exchange' && (
                <ExchangeRateModule
                  currentRate={exchangeRate}
                  onRateUpdated={fetchGlobalData}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <ExchangeRateModal
        isOpen={isExchangeModalOpen}
        onClose={() => setIsExchangeModalOpen(false)}
        currentRate={exchangeRate}
        onRateUpdated={fetchGlobalData}
      />

      <BranchesModal
        isOpen={isBranchesModalOpen}
        onClose={() => setIsBranchesModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <MainLayout />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
