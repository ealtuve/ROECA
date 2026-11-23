/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
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
import { Suppliers } from './components/Suppliers.tsx';
import { FinancialReports } from './components/FinancialReports.tsx';
import { ExchangeRateModule } from './components/ExchangeRateModule.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { ExchangeRateModal } from './components/ExchangeRateModal.tsx';
import { BranchesModal } from './components/BranchesModal.tsx';
import { OperatorLoginModal } from './components/OperatorLoginModal.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { ExchangeRate, DashboardStats, ModuleKey } from './types/index.ts';
import { apiFetch } from './lib/firestoreStore.ts';
import { ShieldAlert, Loader2 } from 'lucide-react';

const NAV_ORDER: ModuleKey[] = [
  'dashboard',
  'billing',
  'inventory',
  'receiving',
  'cxc',
  'cxp',
  'clients',
  'suppliers',
  'reports',
];

function MainLayout() {
  const { user, firebaseUser, authReady, isSeeding, hasPermission } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);

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

  // If operator changes and current tab is no longer permitted, switch to first allowed module
  useEffect(() => {
    if (!user) return;
    if (!hasPermission(currentTab as ModuleKey)) {
      const firstAllowed = NAV_ORDER.find((m) => hasPermission(m));
      if (firstAllowed) {
        setCurrentTab(firstAllowed);
      }
    }
  }, [user, currentTab, hasPermission]);

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

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-[#0d1117] overflow-hidden text-slate-900 dark:text-slate-100 antialiased selection:bg-emerald-500 selection:text-white transition-colors">
      {/* Left Navigation Menu */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          if (tab === 'branches') {
            setIsBranchesModalOpen(true);
          } else {
            setCurrentTab(tab);
            if (tab !== 'inventory') setInitialLowStockFilter(false);
          }
        }}
        onOpenAuth={() => setIsAuthModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <Header
          exchangeRate={exchangeRate}
          onOpenExchangeModal={() => {
            if (currentTab !== 'billing' && hasPermission('dashboard')) {
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

        {/* Offline / Reconnect Sync Banner */}
        <OfflineIndicator variant="banner" />

        {/* Content Viewport */}
        <main
          className={`flex-1 ${
            currentTab === 'billing'
              ? 'overflow-y-auto lg:overflow-hidden p-2.5 sm:p-3 flex flex-col min-h-0'
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
