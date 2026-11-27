import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Users,
  Receipt,
  Package,
  DollarSign,
  Award,
  Search,
  RefreshCw,
  Download,
  BarChart3,
  Calendar,
  ShoppingBag,
  ChevronRight,
} from 'lucide-react';
import { apiFetch } from '../lib/firestoreStore.ts';
import {
  ClientAnalyticsResponse,
  ClientAnalyticsRow,
  ExchangeRate,
} from '../types/index.ts';

interface ClientAnalyticsProps {
  exchangeRate: ExchangeRate | null;
}

type SortByKey = 'invoices' | 'amount' | 'articles';
type TopScope = 'period' | 'allTime';
type TopSortKey = 'quantity' | 'spent';
type CurrencyDisplay = 'VES' | 'USD';

function formatMonthLabel(ym: string): string {
  if (ym === 'all') return 'Todo el histórico';
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const d = new Date(Date.UTC(y, m - 1, 15));
  const txt = d.toLocaleDateString('es-VE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export const ClientAnalytics: React.FC<ClientAnalyticsProps> = ({ exchangeRate }) => {
  const currentYm = useMemo(() => new Date().toISOString().substring(0, 7), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYm);
  const [data, setData] = useState<ClientAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [currencyMode, setCurrencyMode] = useState<CurrencyDisplay>('VES');
  const [sortBy, setSortBy] = useState<SortByKey>('invoices');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [onlyActiveClients, setOnlyActiveClients] = useState<boolean>(true);

  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [topScope, setTopScope] = useState<TopScope>('period');
  const [topSortBy, setTopSortBy] = useState<TopSortKey>('quantity');
  const [chartMetric, setChartMetric] = useState<SortByKey>('invoices');

  const fetchAnalytics = useCallback(async (month: string) => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await apiFetch(`/api/analytics/clients?month=${encodeURIComponent(month)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo cargar el análisis de clientes.');
      }
      const json: ClientAnalyticsResponse = await res.json();
      setData(json);
      setSelectedClientId((prev) => {
        if (prev && json.clients.some((c) => c.clientId === prev)) return prev;
        const firstActive = json.clients.find((c) => c.invoiceCount > 0) || json.clients[0];
        return firstActive ? firstActive.clientId : null;
      });
    } catch (e: any) {
      setErrorMsg(e?.message || 'Error al consultar datos de análisis.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAnalytics(selectedMonth);
  }, [selectedMonth, fetchAnalytics]);

  const rate = exchangeRate?.rate || data?.currentExchangeRate || 76.5;

  const formatUsd = (val: number) =>
    `$${(Number(val) || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formatVes = (valUsd: number) =>
    `Bs. ${((Number(valUsd) || 0) * rate).toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formatPrimary = (valUsd: number) =>
    currencyMode === 'VES' ? formatVes(valUsd) : formatUsd(valUsd);

  const formatSecondary = (valUsd: number) =>
    currencyMode === 'VES' ? `Ref. ${formatUsd(valUsd)}` : formatVes(valUsd);

  const rankedClients = useMemo(() => {
    const list = data?.clients || [];
    const q = searchTerm.trim().toLowerCase();

    const filtered = list.filter((c) => {
      if (onlyActiveClients && c.invoiceCount === 0) return false;
      if (!q) return true;
      return (
        c.clientName.toLowerCase().includes(q) ||
        c.clientIdDoc.toLowerCase().includes(q) ||
        (c.zoneName && c.zoneName.toLowerCase().includes(q)) ||
        (c.state && c.state.toLowerCase().includes(q))
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'amount') {
        return (
          b.totalAmountUsd - a.totalAmountUsd ||
          b.invoiceCount - a.invoiceCount ||
          b.totalArticles - a.totalArticles
        );
      }
      if (sortBy === 'articles') {
        return (
          b.totalArticles - a.totalArticles ||
          b.totalAmountUsd - a.totalAmountUsd ||
          b.invoiceCount - a.invoiceCount
        );
      }
      return (
        b.invoiceCount - a.invoiceCount ||
        b.totalAmountUsd - a.totalAmountUsd ||
        b.totalArticles - a.totalArticles
      );
    });
  }, [data, searchTerm, onlyActiveClients, sortBy]);

  const selectedClient: ClientAnalyticsRow | null = useMemo(() => {
    const list = data?.clients || [];
    if (selectedClientId !== null) {
      const found = list.find((c) => c.clientId === selectedClientId);
      if (found) return found;
    }
    return rankedClients[0] || list[0] || null;
  }, [data, selectedClientId, rankedClients]);

  const selectedClientTop10 = useMemo(() => {
    if (!selectedClient) return [];
    const raw =
      topScope === 'period' ? selectedClient.topProductsPeriod : selectedClient.topProductsAllTime;
    return [...raw]
      .sort((a, b) =>
        topSortBy === 'spent'
          ? b.totalSpentUsd - a.totalSpentUsd || b.totalQuantity - a.totalQuantity
          : b.totalQuantity - a.totalQuantity || b.totalSpentUsd - a.totalSpentUsd
      )
      .slice(0, 10);
  }, [selectedClient, topScope, topSortBy]);

  const maxInvoicesInTable = useMemo(
    () => Math.max(1, ...rankedClients.map((c) => c.invoiceCount)),
    [rankedClients]
  );

  const comparativeClients = useMemo(() => {
    const active = (data?.clients || []).filter((c) => c.invoiceCount > 0);
    return [...active]
      .sort((a, b) => {
        if (chartMetric === 'amount') return b.totalAmountUsd - a.totalAmountUsd;
        if (chartMetric === 'articles') return b.totalArticles - a.totalArticles;
        return b.invoiceCount - a.invoiceCount || b.totalAmountUsd - a.totalAmountUsd;
      })
      .slice(0, 8);
  }, [data, chartMetric]);

  const maxChartValue = useMemo(() => {
    if (comparativeClients.length === 0) return 1;
    const maxVal = comparativeClients.reduce((acc, c) => {
      const v =
        chartMetric === 'amount'
          ? c.totalAmountUsd
          : chartMetric === 'articles'
          ? c.totalArticles
          : c.invoiceCount;
      return Math.max(acc, v);
    }, 0);
    return maxVal > 0 ? maxVal : 1;
  }, [comparativeClients, chartMetric]);

  const handleExportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    const rankingRows = rankedClients.map((c, idx) => ({
      '#': idx + 1,
      Cliente: c.clientName,
      'RIF / Cédula': c.clientIdDoc,
      Zona: c.zoneName || '',
      Facturas: c.invoiceCount,
      Artículos: c.totalArticles,
      'Productos Distintos': c.distinctProductsCount,
      'Monto Total ($ USD)': Number(c.totalAmountUsd.toFixed(2)),
      'Monto Total (Bs.)': Number((c.totalAmountUsd * rate).toFixed(2)),
      'Ticket Promedio ($ USD)': Number(c.avgTicketUsd.toFixed(2)),
      'Artículos / Factura': c.avgArticlesPerInvoice,
      'Participación (%)': c.shareOfRevenuePct,
      'Última Factura': c.lastInvoiceDate || '',
    }));

    const wsRanking = XLSX.utils.json_to_sheet(rankingRows);
    XLSX.utils.book_append_sheet(wb, wsRanking, 'Ranking Clientes');

    if (selectedClient) {
      const topRows = selectedClientTop10.map((p, idx) => ({
        Top: idx + 1,
        Cliente: selectedClient.clientName,
        Código: p.productCode,
        Producto: p.productName,
        Unidad: p.unit,
        'Cantidad Comprada': p.totalQuantity,
        'Facturas con Producto': p.purchaseFrequency,
        'Monto Comprado ($ USD)': Number(p.totalSpentUsd.toFixed(2)),
        'Monto Comprado (Bs.)': Number((p.totalSpentUsd * rate).toFixed(2)),
        'Precio Promedio ($ USD)': Number(p.avgUnitPriceUsd.toFixed(2)),
        '% del Gasto del Cliente': p.shareOfClientSpendPct,
      }));
      const wsTop = XLSX.utils.json_to_sheet(topRows);
      XLSX.utils.book_append_sheet(wb, wsTop, 'Top 10 Productos');
    }

    const suffix = selectedMonth === 'all' ? 'historico' : selectedMonth;
    XLSX.writeFile(wb, `analisis_clientes_roeca_${suffix}.xlsx`);
  };

  const summary = data?.summary;
  const availableMonths = data?.availableMonths || [currentYm];

  return (
    <div className="space-y-6">
      {/* Header & Global Filters */}
      <div className="bg-white dark:bg-[#161b22] p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] transition-colors">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Análisis de Clientes
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span>Top 10 productos más comprados por cliente</span>
              <span aria-hidden="true">·</span>
              <span>Ranking mensual por facturas, montos y artículos</span>
              <span aria-hidden="true">·</span>
              <span>
                Tasa{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  {rate.toFixed(2)} Bs/$
                </strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Period Selector */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#262f3c] rounded-lg px-3 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                aria-label="Seleccionar mes de análisis"
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-hidden cursor-pointer dark:bg-[#0d1117]"
              >
                {availableMonths.map((ym) => (
                  <option key={ym} value={ym} className="dark:bg-[#161b22] dark:text-slate-100">
                    {formatMonthLabel(ym)}
                  </option>
                ))}
                <option value="all" className="dark:bg-[#161b22] dark:text-slate-100">
                  Todo el histórico
                </option>
              </select>
            </div>

            {/* Currency Toggle */}
            <div
              className="flex items-center p-1 bg-slate-100 dark:bg-[#0d1117] border border-slate-200 dark:border-[#262f3c] rounded-lg"
              role="group"
              aria-label="Moneda principal"
            >
              <button
                type="button"
                onClick={() => setCurrencyMode('VES')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  currencyMode === 'VES'
                    ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Bs.
              </button>
              <button
                type="button"
                onClick={() => setCurrencyMode('USD')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  currencyMode === 'USD'
                    ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                $ USD
              </button>
            </div>

            <button
              type="button"
              onClick={() => void fetchAnalytics(selectedMonth)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!data || rankedClients.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Excel</span>
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 px-4 py-3 rounded-xl text-xs font-medium">
          {errorMsg}
        </div>
      )}

      {/* Row 1: 4 Executive KPI Cards */}
      {isLoading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#161b22] p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] h-36 animate-pulse"
            >
              <div className="h-3.5 w-32 bg-slate-200 dark:bg-slate-800 rounded mb-4" />
              <div className="h-6 w-44 bg-slate-200 dark:bg-slate-800 rounded mb-3" />
              <div className="h-3 w-36 bg-slate-100 dark:bg-slate-800/70 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Card 1: Más Facturas del Mes */}
          <div className="bg-white dark:bg-[#161b22] p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Cliente con Más Facturas
              </span>
              <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            </div>
            {summary?.topByInvoices ? (
              <>
                <div className="mt-3 min-w-0">
                  <p
                    className="text-base font-bold text-slate-900 dark:text-white truncate"
                    title={summary.topByInvoices.clientName}
                  >
                    {summary.topByInvoices.clientName}
                  </p>
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums mt-1">
                    {summary.topByInvoices.invoiceCount}{' '}
                    {summary.topByInvoices.invoiceCount === 1 ? 'factura' : 'facturas'}
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>{formatPrimary(summary.topByInvoices.totalAmountUsd)}</span>
                  <span>{summary.topByInvoices.totalArticles} art.</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                Sin facturas en este período
              </p>
            )}
          </div>

          {/* Card 2: Mayor Monto Facturado */}
          <div className="bg-white dark:bg-[#161b22] p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Mayor Monto Facturado
              </span>
              <DollarSign className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            </div>
            {summary?.topByAmount ? (
              <>
                <div className="mt-3 min-w-0">
                  <p
                    className="text-base font-bold text-slate-900 dark:text-white truncate"
                    title={summary.topByAmount.clientName}
                  >
                    {summary.topByAmount.clientName}
                  </p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-1 truncate">
                    {formatPrimary(summary.topByAmount.totalAmountUsd)}
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>{formatSecondary(summary.topByAmount.totalAmountUsd)}</span>
                  <span className="text-sky-700 dark:text-sky-400 font-semibold">
                    {summary.topByAmount.shareOfRevenuePct.toFixed(1)}% del mes
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                Sin montos facturados en este período
              </p>
            )}
          </div>

          {/* Card 3: Mayor Volumen de Artículos */}
          <div className="bg-white dark:bg-[#161b22] p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Mayor Volumen de Artículos
              </span>
              <Package className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            </div>
            {summary?.topByArticles ? (
              <>
                <div className="mt-3 min-w-0">
                  <p
                    className="text-base font-bold text-slate-900 dark:text-white truncate"
                    title={summary.topByArticles.clientName}
                  >
                    {summary.topByArticles.clientName}
                  </p>
                  <p className="text-xl font-bold text-amber-700 dark:text-amber-400 font-mono tabular-nums mt-1">
                    {summary.topByArticles.totalArticles.toLocaleString('es-VE')} artículos
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>{summary.topByArticles.invoiceCount} fact.</span>
                  <span>Prom. {summary.topByArticles.avgArticlesPerInvoice} art./fact.</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                Sin artículos facturados en este período
              </p>
            )}
          </div>

          {/* Card 4: Resumen General del Período */}
          <div className="bg-white dark:bg-[#161b22] p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Actividad del Período
              </span>
              <Users className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            </div>
            <div className="mt-3">
              <p className="text-xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                {summary?.activeClientsCount || 0} clientes activos
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-1 truncate">
                {summary?.totalInvoices || 0} facturas · {formatPrimary(summary?.totalAmountUsd || 0)}
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#262f3c] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span>{(summary?.totalArticles || 0).toLocaleString('es-VE')} artículos</span>
              <span>de {summary?.totalClientsCount || 0} registrados</span>
            </div>
          </div>
        </div>
      )}

      {/* Row 2: Primary Split — Monthly Client Ranking Table (Left) + Top 10 Products per Client (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Panel (7 cols): Clientes con Más Facturas del Mes (Montos y Artículos) */}
        <div className="xl:col-span-7 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden transition-colors">
          <div className="p-5 border-b border-slate-100 dark:border-[#262f3c] space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Clientes con Más Facturas ({formatMonthLabel(selectedMonth)})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Seleccione un cliente de la tabla para inspeccionar su Top 10 de productos comprados
                </p>
              </div>
              <div
                className="flex items-center p-0.5 bg-slate-100 dark:bg-[#0d1117] border border-slate-200 dark:border-[#262f3c] rounded-lg w-fit shrink-0"
                role="group"
                aria-label="Ordenar clientes por"
              >
                <button
                  type="button"
                  onClick={() => setSortBy('invoices')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    sortBy === 'invoices'
                      ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Facturas
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('amount')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    sortBy === 'amount'
                      ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Montos
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('articles')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    sortBy === 'articles'
                      ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Artículos
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar cliente por nombre, RIF/Cédula o zona..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#262f3c] rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap shrink-0">
                <input
                  type="checkbox"
                  checked={onlyActiveClients}
                  onChange={(e) => setOnlyActiveClients(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Solo con compras</span>
              </label>
            </div>
          </div>

          {rankedClients.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                No hay clientes para mostrar en este filtro
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Pruebe seleccionando otro mes, "Todo el histórico" o desmarcando "Solo con compras".
              </p>
              {onlyActiveClients && (
                <button
                  type="button"
                  onClick={() => setOnlyActiveClients(false)}
                  className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Mostrar todos los clientes registrados
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#262f3c] bg-slate-50/70 dark:bg-[#12171e] text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pl-4 pr-2 w-10">#</th>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3 text-right">Facturas</th>
                    <th className="py-2.5 px-3 text-right">Artículos</th>
                    <th className="py-2.5 px-3 text-right">Monto Total</th>
                    <th className="py-2.5 pl-3 pr-4 text-right hidden sm:table-cell">Ticket Prom.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c] text-xs">
                  {rankedClients.map((client, idx) => {
                    const isSelected = selectedClient?.clientId === client.clientId;
                    const invBarPct = Math.round((client.invoiceCount / maxInvoicesInTable) * 100);
                    return (
                      <tr
                        key={client.clientId}
                        onClick={() => setSelectedClientId(client.clientId)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-emerald-50/80 dark:bg-emerald-950/30'
                            : 'hover:bg-slate-50 dark:hover:bg-[#1c222b]'
                        }`}
                      >
                        <td className="py-3 pl-4 pr-2 font-mono tabular-nums text-slate-400 dark:text-slate-500 font-semibold">
                          {String(idx + 1).padStart(2, '0')}
                        </td>
                        <td className="py-3 px-3 min-w-[180px] max-w-[260px]">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-semibold truncate ${
                                isSelected
                                  ? 'text-emerald-800 dark:text-emerald-300'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                              title={client.clientName}
                            >
                              {client.clientName}
                            </span>
                            {isSelected && (
                              <ChevronRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            <span className="font-mono">{client.clientIdDoc}</span>
                            {client.zoneName && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate">{client.zoneName}</span>
                              </>
                            )}
                            {client.useCostPrice && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-sky-700 dark:text-sky-400 font-medium">
                                  Precio costo
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {client.invoiceCount}
                          </span>
                          <div className="w-14 h-1 bg-slate-100 dark:bg-[#0d1117] rounded-full overflow-hidden ml-auto mt-1">
                            <div
                              style={{ width: `${invBarPct}%` }}
                              className="h-full bg-emerald-500 rounded-full"
                            />
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {client.totalArticles.toLocaleString('es-VE')}
                          </span>
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                            {client.avgArticlesPerInvoice}/fact.
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {formatPrimary(client.totalAmountUsd)}
                          </span>
                          <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                            {formatSecondary(client.totalAmountUsd)} · {client.shareOfRevenuePct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 pl-3 pr-4 text-right font-mono tabular-nums whitespace-nowrap hidden sm:table-cell text-slate-600 dark:text-slate-300">
                          {formatPrimary(client.avgTicketUsd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Panel (5 cols): Top 10 Productos Más Comprados por Cliente */}
        <div className="xl:col-span-5 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden transition-colors">
          <div className="p-5 border-b border-slate-100 dark:border-[#262f3c] space-y-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Top 10 Productos por Cliente
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Artículos con mayor compra y volumen para el cliente seleccionado
                </p>
              </div>
            </div>

            {/* Client Dropdown Selector */}
            <div>
              <label
                htmlFor="analytics-client-select"
                className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1"
              >
                Cliente seleccionado
              </label>
              <select
                id="analytics-client-select"
                value={selectedClient?.clientId || ''}
                onChange={(e) => setSelectedClientId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#262f3c] rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 cursor-pointer"
              >
                {(data?.clients || []).map((c) => (
                  <option
                    key={c.clientId}
                    value={c.clientId}
                    className="dark:bg-[#161b22] dark:text-slate-100"
                  >
                    {c.clientName} ({c.invoiceCount} fact. · {c.totalArticles} art.)
                  </option>
                ))}
              </select>
            </div>

            {/* Scope & Sort Segmented Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                className="flex items-center p-0.5 bg-slate-100 dark:bg-[#0d1117] border border-slate-200 dark:border-[#262f3c] rounded-lg"
                role="group"
                aria-label="Alcance del Top 10"
              >
                <button
                  type="button"
                  onClick={() => setTopScope('period')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    topScope === 'period'
                      ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {selectedMonth === 'all' ? 'Histórico' : 'Mes actual'}
                </button>
                <button
                  type="button"
                  onClick={() => setTopScope('allTime')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    topScope === 'allTime'
                      ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Histórico total
                </button>
              </div>

              <div
                className="flex items-center p-0.5 bg-slate-100 dark:bg-[#0d1117] border border-slate-200 dark:border-[#262f3c] rounded-lg"
                role="group"
                aria-label="Orden del Top 10"
              >
                <button
                  type="button"
                  onClick={() => setTopSortBy('quantity')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    topSortBy === 'quantity'
                      ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Por Cantidad
                </button>
                <button
                  type="button"
                  onClick={() => setTopSortBy('spent')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    topSortBy === 'spent'
                      ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Por Monto
                </button>
              </div>
            </div>

            {selectedClient && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 pt-1 font-mono tabular-nums">
                <span>
                  {topScope === 'period'
                    ? selectedClient.invoiceCount
                    : selectedClient.allTimeInvoiceCount}{' '}
                  facturas
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {(topScope === 'period'
                    ? selectedClient.totalArticles
                    : selectedClient.allTimeArticles
                  ).toLocaleString('es-VE')}{' '}
                  artículos
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatPrimary(
                    topScope === 'period'
                      ? selectedClient.totalAmountUsd
                      : selectedClient.allTimeTotalUsd
                  )}
                </span>
              </div>
            )}
          </div>

          {!selectedClient || selectedClientTop10.length === 0 ? (
            <div className="p-10 text-center">
              <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Sin productos comprados en este período
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {selectedClient
                  ? `${selectedClient.clientName} no registra compras en ${formatMonthLabel(selectedMonth)}.`
                  : 'Seleccione un cliente para ver sus productos más comprados.'}
              </p>
              {selectedClient &&
                topScope === 'period' &&
                selectedClient.topProductsAllTime.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTopScope('allTime')}
                    className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Ver Top 10 histórico del cliente ({selectedClient.topProductsAllTime.length} productos) →
                  </button>
                )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#262f3c]">
              {selectedClientTop10.map((prod, idx) => {
                const maxVal =
                  topSortBy === 'spent'
                    ? Math.max(0.01, selectedClientTop10[0]?.totalSpentUsd || 1)
                    : Math.max(1, selectedClientTop10[0]?.totalQuantity || 1);
                const curVal = topSortBy === 'spent' ? prod.totalSpentUsd : prod.totalQuantity;
                const barPct = Math.max(6, Math.round((curVal / maxVal) * 100));

                return (
                  <div
                    key={`${prod.productId}-${prod.productCode}`}
                    className="px-5 py-3 hover:bg-slate-50 dark:hover:bg-[#1c222b] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="text-xs font-semibold text-slate-900 dark:text-white truncate"
                          title={prod.productName}
                        >
                          <span className="font-mono text-slate-400 dark:text-slate-500 mr-1.5">
                            {String(idx + 1).padStart(2, '0')}.
                          </span>
                          {prod.productName}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                          <span>{prod.productCode}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            En {prod.purchaseFrequency}{' '}
                            {prod.purchaseFrequency === 1 ? 'factura' : 'facturas'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{prod.shareOfClientSpendPct.toFixed(1)}% del gasto</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          {prod.totalQuantity.toLocaleString('es-VE')} {prod.unit}
                        </p>
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                          {formatPrimary(prod.totalSpentUsd)}
                        </p>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-[#0d1117] rounded-full overflow-hidden mt-2">
                      <div
                        style={{ width: `${barPct}%` }}
                        className={`h-full rounded-full ${
                          idx === 0
                            ? 'bg-emerald-500'
                            : idx < 3
                            ? 'bg-sky-500 dark:bg-sky-400'
                            : 'bg-slate-400 dark:bg-slate-600'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Visual Comparison of Top Clients in Selected Month (Invoices vs Amount vs Articles) */}
      <div className="bg-white dark:bg-[#161b22] p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100 dark:border-[#262f3c]">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Comparativa de Clientes Líderes ({formatMonthLabel(selectedMonth)})
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Relación directa entre frecuencia de facturación, monto facturado y volumen de artículos
            </p>
          </div>

          <div
            className="flex items-center p-0.5 bg-slate-100 dark:bg-[#0d1117] border border-slate-200 dark:border-[#262f3c] rounded-lg w-fit shrink-0"
            role="group"
            aria-label="Métrica del gráfico comparativo"
          >
            <button
              type="button"
              onClick={() => setChartMetric('invoices')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                chartMetric === 'invoices'
                  ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Facturas
            </button>
            <button
              type="button"
              onClick={() => setChartMetric('amount')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                chartMetric === 'amount'
                  ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Montos
            </button>
            <button
              type="button"
              onClick={() => setChartMetric('articles')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                chartMetric === 'articles'
                  ? 'bg-white dark:bg-[#1e2632] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Artículos
            </button>
          </div>
        </div>

        {comparativeClients.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            No hay facturación registrada en {formatMonthLabel(selectedMonth)} para generar la comparativa.
          </div>
        ) : (
          <div className="mt-4 space-y-3.5">
            {comparativeClients.map((c, idx) => {
              const metricVal =
                chartMetric === 'amount'
                  ? c.totalAmountUsd
                  : chartMetric === 'articles'
                  ? c.totalArticles
                  : c.invoiceCount;
              const pct = Math.max(4, Math.round((metricVal / maxChartValue) * 100));
              const isSelected = selectedClient?.clientId === c.clientId;

              return (
                <div
                  key={c.clientId}
                  onClick={() => setSelectedClientId(c.clientId)}
                  className={`p-2.5 -mx-2.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/25'
                      : 'hover:bg-slate-50 dark:hover:bg-[#1c222b]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-slate-400 dark:text-slate-500 font-semibold w-5 shrink-0">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white truncate">
                        {c.clientName}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono tabular-nums text-[11px] shrink-0 pl-7 sm:pl-0">
                      <span
                        className={
                          chartMetric === 'invoices'
                            ? 'font-bold text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {c.invoiceCount} {c.invoiceCount === 1 ? 'factura' : 'facturas'}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                      <span
                        className={
                          chartMetric === 'amount'
                            ? 'font-bold text-sky-700 dark:text-sky-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {formatPrimary(c.totalAmountUsd)}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                      <span
                        className={
                          chartMetric === 'articles'
                            ? 'font-bold text-amber-700 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {c.totalArticles.toLocaleString('es-VE')} art.
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-[#0d1117] rounded-full overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full rounded-full transition-all duration-200 ${
                        chartMetric === 'amount'
                          ? 'bg-sky-500 dark:bg-sky-400'
                          : chartMetric === 'articles'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
