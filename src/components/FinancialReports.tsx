import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Download,
  Printer,
  MapPin,
  Users,
  Building2,
  Award,
  Layers,
} from 'lucide-react';
import {
  Sale,
  Payment,
  Client,
  Supplier,
  Product,
  Purchase,
  Zone,
  ExchangeRate,
} from '../types/index.ts';
import { VENEZUELA_STATES } from '../lib/venezuelaGeo.ts';
import { getCreditRatingMeta } from './Clients.tsx';

interface FinancialReportsProps {
  exchangeRate: ExchangeRate | null;
}

const normalizeText = (str: string) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const FinancialReports: React.FC<FinancialReportsProps> = ({ exchangeRate }) => {
  const [reportType, setReportType] = useState<'sales' | 'cashflow' | 'inventory' | 'geo'>('sales');

  // General Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('todos');

  // Geo Report Filters
  const [geoGroupBy, setGeoGroupBy] = useState<'state' | 'zone'>('state');
  const [geoScope, setGeoScope] = useState<'ambos' | 'clientes' | 'proveedores'>('ambos');
  const [geoStateFilter, setGeoStateFilter] = useState('');
  const [geoZoneFilter, setGeoZoneFilter] = useState('');
  const [geoRatingFilter, setGeoRatingFilter] = useState('');

  // Data states
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const rate = exchangeRate?.rate || 76.5;

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [sRes, purRes, pRes, cRes, supRes, prRes, zRes] = await Promise.all([
        apiFetch('/api/sales'),
        apiFetch('/api/purchases'),
        apiFetch('/api/payments'),
        apiFetch('/api/clients'),
        apiFetch('/api/suppliers'),
        apiFetch('/api/products'),
        apiFetch('/api/zones'),
      ]);
      if (sRes.ok) setSales(await sRes.json());
      if (purRes.ok) setPurchases(await purRes.json());
      if (pRes.ok) setPayments(await pRes.json());
      if (cRes.ok) setClients(await cRes.json());
      if (supRes.ok) setSuppliers(await supRes.json());
      if (prRes.ok) setProducts(await prRes.json());
      if (zRes.ok) setZones(await zRes.json());
    } catch (e) {
      console.error('Error fetching report data', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered Sales
  const filteredSales = sales.filter((s) => {
    const matchStart = !startDate || s.date >= startDate;
    const matchEnd = !endDate || s.date <= endDate;
    const matchClient = !clientFilter || String(s.clientId) === clientFilter;
    return matchStart && matchEnd && matchClient;
  });

  // Filtered Purchases (by date)
  const filteredPurchases = purchases.filter((p) => {
    const matchStart = !startDate || p.date >= startDate;
    const matchEnd = !endDate || p.date <= endDate;
    return matchStart && matchEnd;
  });

  // Filtered Payments (Flujo de caja)
  const filteredPayments = payments.filter((p) => {
    const pDate = p.createdAt.split('T')[0];
    const matchStart = !startDate || pDate >= startDate;
    const matchEnd = !endDate || pDate <= endDate;
    const matchMethod = methodFilter === 'todos' || p.paymentMethod === methodFilter;
    const matchClient = !clientFilter || (p.clientId && String(p.clientId) === clientFilter);
    const matchSupplier = !supplierFilter || (p.supplierId && String(p.supplierId) === supplierFilter);
    return matchStart && matchEnd && matchMethod && matchClient && matchSupplier;
  });

  // Available states & zones for Geo report
  const availableStates = useMemo(() => {
    const set = new Set<string>(VENEZUELA_STATES);
    zones.forEach((z) => z.state && set.add(z.state));
    clients.forEach((c) => c.state && set.add(c.state));
    suppliers.forEach((s) => s.state && set.add(s.state));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [zones, clients, suppliers]);

  const zonesForGeoState = useMemo(() => {
    if (!geoStateFilter) return zones;
    return zones.filter((z) => normalizeText(z.state) === normalizeText(geoStateFilter));
  }, [zones, geoStateFilter]);

  // Filtered Clients & Suppliers for Geo report
  const geoClients = useMemo(() => {
    return clients.filter((c) => {
      const st = c.state || 'Sin Estado';
      const zn = c.zoneName || 'Sin Zona';
      const matchState = !geoStateFilter || normalizeText(st) === normalizeText(geoStateFilter);
      const matchZone = !geoZoneFilter || normalizeText(zn) === normalizeText(geoZoneFilter);
      let matchRating = true;
      if (geoRatingFilter === 'suspendido') matchRating = Boolean(c.isSuspended);
      else if (geoRatingFilter === 'solo_contado') matchRating = c.creditEnabled === false;
      else if (['excelente', 'regular', 'malo', 'nuevo'].includes(geoRatingFilter)) {
        matchRating = (c.creditRating || 'nuevo') === geoRatingFilter;
      }
      return matchState && matchZone && matchRating;
    });
  }, [clients, geoStateFilter, geoZoneFilter, geoRatingFilter]);

  const geoSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const st = s.state || 'Sin Estado';
      const zn = s.zoneName || 'Sin Zona';
      const matchState = !geoStateFilter || normalizeText(st) === normalizeText(geoStateFilter);
      const matchZone = !geoZoneFilter || normalizeText(zn) === normalizeText(geoZoneFilter);
      return matchState && matchZone;
    });
  }, [suppliers, geoStateFilter, geoZoneFilter]);

  // Map clientId -> totalSalesUsd & supplierId -> totalPurchasesUsd
  const salesByClientId = useMemo(() => {
    const map = new Map<number, { count: number; totalUsd: number }>();
    filteredSales.forEach((s) => {
      const prev = map.get(s.clientId) || { count: 0, totalUsd: 0 };
      map.set(s.clientId, { count: prev.count + 1, totalUsd: prev.totalUsd + s.totalUsd });
    });
    return map;
  }, [filteredSales]);

  const purchasesBySupplierId = useMemo(() => {
    const map = new Map<number, { count: number; totalUsd: number }>();
    filteredPurchases.forEach((p) => {
      const prev = map.get(p.supplierId) || { count: 0, totalUsd: 0 };
      map.set(p.supplierId, { count: prev.count + 1, totalUsd: prev.totalUsd + p.totalUsd });
    });
    return map;
  }, [filteredPurchases]);

  // Aggregated Geo Groups (by Estado or by Zona)
  const geoGroups = useMemo(() => {
    interface GeoGroupRow {
      key: string;
      label: string;
      sublabel: string;
      clientsCount: number;
      salesCount: number;
      salesUsd: number;
      cxcBalanceUsd: number;
      suppliersCount: number;
      purchasesCount: number;
      purchasesUsd: number;
      cxpBalanceUsd: number;
    }

    const map = new Map<string, GeoGroupRow>();

    const ensure = (key: string, label: string, sublabel: string) => {
      let row = map.get(key);
      if (!row) {
        row = {
          key,
          label,
          sublabel,
          clientsCount: 0,
          salesCount: 0,
          salesUsd: 0,
          cxcBalanceUsd: 0,
          suppliersCount: 0,
          purchasesCount: 0,
          purchasesUsd: 0,
          cxpBalanceUsd: 0,
        };
        map.set(key, row);
      }
      return row;
    };

    if (geoScope === 'ambos' || geoScope === 'clientes') {
      geoClients.forEach((c) => {
        const st = c.state || 'Sin Estado Asignado';
        const zn = c.zoneName || 'Sin Zona Asignada';
        const key = geoGroupBy === 'state' ? st : `${st}::${zn}`;
        const label = geoGroupBy === 'state' ? st : zn;
        const sublabel = geoGroupBy === 'state' ? 'Estado' : st;
        const row = ensure(key, label, sublabel);
        const stSales = salesByClientId.get(c.id) || { count: 0, totalUsd: 0 };
        row.clientsCount += 1;
        row.salesCount += stSales.count;
        row.salesUsd += stSales.totalUsd;
        row.cxcBalanceUsd += c.currentBalanceUsd || 0;
      });
    }

    if (geoScope === 'ambos' || geoScope === 'proveedores') {
      geoSuppliers.forEach((s) => {
        const st = s.state || 'Sin Estado Asignado';
        const zn = s.zoneName || 'Sin Zona Asignada';
        const key = geoGroupBy === 'state' ? st : `${st}::${zn}`;
        const label = geoGroupBy === 'state' ? st : zn;
        const sublabel = geoGroupBy === 'state' ? 'Estado' : st;
        const row = ensure(key, label, sublabel);
        const stPur = purchasesBySupplierId.get(s.id) || { count: 0, totalUsd: 0 };
        row.suppliersCount += 1;
        row.purchasesCount += stPur.count;
        row.purchasesUsd += stPur.totalUsd;
        row.cxpBalanceUsd += s.currentBalanceUsd || 0;
      });
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        b.salesUsd + b.purchasesUsd + b.cxcBalanceUsd + b.cxpBalanceUsd -
        (a.salesUsd + a.purchasesUsd + a.cxcBalanceUsd + a.cxpBalanceUsd)
    );
  }, [geoClients, geoSuppliers, geoGroupBy, geoScope, salesByClientId, purchasesBySupplierId]);

  const geoTotals = useMemo(() => {
    return geoGroups.reduce(
      (acc, g) => ({
        clients: acc.clients + g.clientsCount,
        salesUsd: acc.salesUsd + g.salesUsd,
        cxcUsd: acc.cxcUsd + g.cxcBalanceUsd,
        suppliers: acc.suppliers + g.suppliersCount,
        purchasesUsd: acc.purchasesUsd + g.purchasesUsd,
        cxpUsd: acc.cxpUsd + g.cxpBalanceUsd,
      }),
      { clients: 0, salesUsd: 0, cxcUsd: 0, suppliers: 0, purchasesUsd: 0, cxpUsd: 0 }
    );
  }, [geoGroups]);

  // Export to CSV function
  const exportToCSV = () => {
    let csvRows: string[] = [];

    if (reportType === 'sales') {
      csvRows.push(
        ['Factura', 'Fecha', 'Cliente', 'RIF/CI', 'Tipo', 'Estado', 'Total USD', 'Total VES', 'Abonado USD', 'Saldo USD'].join(',')
      );
      filteredSales.forEach((s) => {
        csvRows.push(
          [
            `"${s.invoiceNumber}"`,
            `"${s.date}"`,
            `"${s.clientName}"`,
            `"${s.clientIdDoc || ''}"`,
            `"${s.paymentType}"`,
            `"${s.status}"`,
            s.totalUsd.toFixed(2),
            s.totalVes.toFixed(2),
            s.amountPaidUsd.toFixed(2),
            s.balanceDueUsd.toFixed(2),
          ].join(',')
        );
      });
    } else if (reportType === 'cashflow') {
      csvRows.push(
        ['ID', 'Tipo', 'Fecha', 'Metodo', 'Moneda', 'Monto Original', 'Tasa', 'Monto USD', 'Monto VES', 'Banco', 'Referencia'].join(',')
      );
      filteredPayments.forEach((p) => {
        csvRows.push(
          [
            p.id,
            `"${p.type}"`,
            `"${p.createdAt.split('T')[0]}"`,
            `"${p.paymentMethod}"`,
            `"${p.currency}"`,
            p.amountOriginal.toFixed(2),
            p.exchangeRate.toFixed(2),
            p.amountUsd.toFixed(2),
            p.amountVes.toFixed(2),
            `"${p.bank || ''}"`,
            `"${p.reference || ''}"`,
          ].join(',')
        );
      });
    } else if (reportType === 'inventory') {
      csvRows.push(
        ['Codigo', 'Nombre', 'Categoria', 'Unidad', 'Costo USD', 'Precio USD', 'Stock', 'Minimo', 'Valor Costo USD', 'Valor Venta USD'].join(',')
      );
      products.forEach((p) => {
        csvRows.push(
          [
            `"${p.code}"`,
            `"${p.name}"`,
            `"${p.categoryName || ''}"`,
            `"${p.unit}"`,
            p.costUsd.toFixed(2),
            p.priceUsd.toFixed(2),
            p.stock,
            p.minStock,
            (p.stock * p.costUsd).toFixed(2),
            (p.stock * p.priceUsd).toFixed(2),
          ].join(',')
        );
      });
    } else if (reportType === 'geo') {
      csvRows.push(
        [
          geoGroupBy === 'state' ? 'Estado' : 'Zona',
          'Referencia',
          'Clientes',
          'Ventas USD',
          'Saldo CxC USD',
          'Proveedores',
          'Compras USD',
          'Saldo CxP USD',
        ].join(',')
      );
      geoGroups.forEach((g) => {
        csvRows.push(
          [
            `"${g.label}"`,
            `"${g.sublabel}"`,
            g.clientsCount,
            g.salesUsd.toFixed(2),
            g.cxcBalanceUsd.toFixed(2),
            g.suppliersCount,
            g.purchasesUsd.toFixed(2),
            g.cxpBalanceUsd.toFixed(2),
          ].join(',')
        );
      });
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `reporte_roeca_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // KPI calculations for reports
  const totalSalesUsd = filteredSales.reduce((acc, s) => acc + s.totalUsd, 0);
  const totalCollectedUsd = filteredPayments
    .filter((p) => p.type === 'cliente_abono')
    .reduce((acc, p) => acc + p.amountUsd, 0);
  const totalPaidSuppliersUsd = filteredPayments
    .filter((p) => p.type === 'proveedor_pago')
    .reduce((acc, p) => acc + p.amountUsd, 0);

  const inventoryTotalCostUsd = products.reduce((acc, p) => acc + p.stock * p.costUsd, 0);
  const inventoryTotalPriceUsd = products.reduce((acc, p) => acc + p.stock * p.priceUsd, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-[#161b22] p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Reportes Financieros y Análisis Territorial
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#1c222b] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2d3748] font-semibold font-mono">
              Auditoría
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Reportes de ventas, flujo de caja, valoración de inventario y categorización por Estado o Zona.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Vista</span>
          </button>

          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Report Segmented Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#1c222b] border border-transparent dark:border-[#262f3c] rounded-xl text-xs font-semibold max-w-3xl transition-colors">
        <button
          onClick={() => setReportType('sales')}
          className={`flex-1 py-2 px-3 rounded-lg transition-colors cursor-pointer text-center whitespace-nowrap ${
            reportType === 'sales'
              ? 'bg-white dark:bg-[#252c38] text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Ventas por Fecha/Cliente
        </button>
        <button
          onClick={() => setReportType('cashflow')}
          className={`flex-1 py-2 px-3 rounded-lg transition-colors cursor-pointer text-center whitespace-nowrap ${
            reportType === 'cashflow'
              ? 'bg-white dark:bg-[#252c38] text-emerald-800 dark:text-emerald-300 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Flujo de Caja
        </button>
        <button
          onClick={() => setReportType('inventory')}
          className={`flex-1 py-2 px-3 rounded-lg transition-colors cursor-pointer text-center whitespace-nowrap ${
            reportType === 'inventory'
              ? 'bg-white dark:bg-[#252c38] text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Inventario
        </button>
        <button
          onClick={() => setReportType('geo')}
          className={`flex-1 py-2 px-3 rounded-lg transition-colors cursor-pointer text-center whitespace-nowrap flex items-center justify-center gap-1.5 ${
            reportType === 'geo'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Por Estado / Zona</span>
        </button>
      </div>

      {/* Filter Bar */}
      {reportType !== 'geo' ? (
        <div className="bg-white dark:bg-[#161b22] p-4 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs transition-colors">
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Fecha Desde:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full py-1.5 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] text-slate-900 dark:text-slate-100 rounded-lg focus:outline-hidden"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Fecha Hasta:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full py-1.5 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] text-slate-900 dark:text-slate-100 rounded-lg focus:outline-hidden"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Filtrar por Cliente:</label>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="w-full py-1.5 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] text-slate-900 dark:text-slate-100 rounded-lg focus:outline-hidden truncate"
            >
              <option value="">Todos los clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Método de Pago:</label>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="w-full py-1.5 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] text-slate-900 dark:text-slate-100 rounded-lg focus:outline-hidden"
            >
              <option value="todos">Todos los métodos</option>
              <option value="pago_movil">Pago Móvil</option>
              <option value="transferencia">Transferencia Bancaria</option>
              <option value="efectivo_usd">Efectivo USD ($)</option>
              <option value="efectivo_ves">Efectivo Bolívares</option>
              <option value="punto_de_venta">Punto de Venta</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setClientFilter('');
                setSupplierFilter('');
                setMethodFilter('todos');
              }}
              className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 rounded-lg font-semibold transition-colors cursor-pointer"
            >
              Limpiar Filtros
            </button>
          </div>
        </div>
      ) : (
        /* Geo Report Specific Controls */
        <div className="bg-white dark:bg-[#161b22] p-4 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs space-y-3 text-xs transition-colors">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Agrupar por Estado vs Zona */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                Agrupar por:
              </span>
              <div className="inline-flex p-0.5 bg-slate-100 dark:bg-[#1c222b] rounded-lg border border-slate-200 dark:border-[#2d3748]">
                <button
                  type="button"
                  onClick={() => setGeoGroupBy('state')}
                  className={`px-3 py-1 rounded-md font-bold cursor-pointer transition-colors ${
                    geoGroupBy === 'state'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Por Estado
                </button>
                <button
                  type="button"
                  onClick={() => setGeoGroupBy('zone')}
                  className={`px-3 py-1 rounded-md font-bold cursor-pointer transition-colors ${
                    geoGroupBy === 'zone'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Por Zona
                </button>
              </div>
            </div>

            {/* Scope: Combinado / Clientes / Proveedores */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setGeoScope('ambos')}
                className={`px-2.5 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                  geoScope === 'ambos'
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white border-transparent'
                    : 'bg-slate-50 dark:bg-[#1c222b] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2d3748]'
                }`}
              >
                Clientes y Proveedores
              </button>
              <button
                type="button"
                onClick={() => setGeoScope('clientes')}
                className={`px-2.5 py-1.5 rounded-lg border font-semibold cursor-pointer inline-flex items-center gap-1 ${
                  geoScope === 'clientes'
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white border-transparent'
                    : 'bg-slate-50 dark:bg-[#1c222b] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2d3748]'
                }`}
              >
                <Users className="w-3 h-3" />
                Solo Clientes
              </button>
              <button
                type="button"
                onClick={() => setGeoScope('proveedores')}
                className={`px-2.5 py-1.5 rounded-lg border font-semibold cursor-pointer inline-flex items-center gap-1 ${
                  geoScope === 'proveedores'
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white border-transparent'
                    : 'bg-slate-50 dark:bg-[#1c222b] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2d3748]'
                }`}
              >
                <Building2 className="w-3 h-3" />
                Solo Proveedores
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Estado:</label>
              <select
                value={geoStateFilter}
                onChange={(e) => {
                  setGeoStateFilter(e.target.value);
                  setGeoZoneFilter('');
                }}
                className="w-full py-1.5 px-2.5 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] text-slate-900 dark:text-slate-100 rounded-lg"
              >
                <option value="">Todos los Estados</option>
                {availableStates.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Zona:</label>
              <select
                value={geoZoneFilter}
                onChange={(e) => setGeoZoneFilter(e.target.value)}
                className="w-full py-1.5 px-2.5 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] text-slate-900 dark:text-slate-100 rounded-lg"
              >
                <option value="">Todas las Zonas</option>
                {zonesForGeoState.map((z) => (
                  <option key={z.id} value={z.name}>
                    {z.name} ({z.state})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Categoría Crediticia (Clientes):
              </label>
              <select
                value={geoRatingFilter}
                onChange={(e) => setGeoRatingFilter(e.target.value)}
                className="w-full py-1.5 px-2.5 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] text-slate-900 dark:text-slate-100 rounded-lg"
              >
                <option value="">Todas las Categorías</option>
                <option value="excelente">Excelente</option>
                <option value="regular">Regular</option>
                <option value="malo">Malo</option>
                <option value="nuevo">Nuevo</option>
                <option value="solo_contado">Solo Contado</option>
                <option value="suspendido">Suspendidos</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setGeoStateFilter('');
                  setGeoZoneFilter('');
                  setGeoRatingFilter('');
                }}
                className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 rounded-lg font-semibold cursor-pointer"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {reportType === 'sales' && (
          <>
            <div className="p-4 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Facturado Seleccionado:</span>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-1">
                ${totalSalesUsd.toFixed(2)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Bs. {(totalSalesUsd * rate).toFixed(2)}
              </p>
            </div>
            <div className="p-4 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Facturas Filtradas:</span>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-1">
                {filteredSales.length}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Comprobantes emitidos</p>
            </div>
            <div className="p-4 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Promedio por Venta:</span>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-1">
                ${filteredSales.length ? (totalSalesUsd / filteredSales.length).toFixed(2) : '0.00'}
              </p>
            </div>
          </>
        )}

        {reportType === 'cashflow' && (
          <>
            <div className="p-4 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs">
              <span className="text-xs text-emerald-800 dark:text-emerald-400 font-medium">Ingresos Cobrados (Clientes):</span>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 font-mono tabular-nums mt-1">
                ${totalCollectedUsd.toFixed(2)}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400/80 font-mono">
                Bs. {(totalCollectedUsd * rate).toFixed(2)}
              </p>
            </div>
            <div className="p-4 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs">
              <span className="text-xs text-rose-800 dark:text-rose-400 font-medium">Egresos Pagados (Proveedores):</span>
              <p className="text-xl font-bold text-rose-700 dark:text-rose-300 font-mono tabular-nums mt-1">
                ${totalPaidSuppliersUsd.toFixed(2)}
              </p>
              <p className="text-xs text-rose-600 dark:text-rose-400/80 font-mono">
                Bs. {(totalPaidSuppliersUsd * rate).toFixed(2)}
              </p>
            </div>
            <div className="p-4 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs">
              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">Flujo Neto en Período:</span>
              <p className="text-xl font-bold text-indigo-700 dark:text-indigo-400 font-mono tabular-nums mt-1">
                ${(totalCollectedUsd - totalPaidSuppliersUsd).toFixed(2)}
              </p>
            </div>
          </>
        )}

        {reportType === 'inventory' && (
          <>
            <div className="p-4 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Valoración Inventario (Costo):</span>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-1">
                ${inventoryTotalCostUsd.toFixed(2)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Bs. {(inventoryTotalCostUsd * rate).toFixed(2)}
              </p>
            </div>
            <div className="p-4 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Valoración Estimada (Venta):</span>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums mt-1">
                ${inventoryTotalPriceUsd.toFixed(2)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Bs. {(inventoryTotalPriceUsd * rate).toFixed(2)}
              </p>
            </div>
            <div className="p-4 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Margen Bruto Proyectado:</span>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-400 font-mono tabular-nums mt-1">
                ${(inventoryTotalPriceUsd - inventoryTotalCostUsd).toFixed(2)}
              </p>
            </div>
          </>
        )}

        {reportType === 'geo' && (
          <>
            <div className="p-4 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Territorios Activos ({geoGroupBy === 'state' ? 'Estados' : 'Zonas'}):
              </span>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-1">
                {geoGroups.length}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {geoTotals.clients} clientes · {geoTotals.suppliers} proveedores
              </p>
            </div>
            <div className="p-4 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                Ventas / CxC en Territorios Filtrados:
              </span>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 font-mono tabular-nums mt-1">
                ${geoTotals.salesUsd.toFixed(2)}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 font-mono">
                Saldo CxC: ${geoTotals.cxcUsd.toFixed(2)} (Bs. {(geoTotals.cxcUsd * rate).toFixed(0)})
              </p>
            </div>
            <div className="p-4 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs">
              <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">
                Compras / CxP en Territorios Filtrados:
              </span>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-1">
                ${geoTotals.purchasesUsd.toFixed(2)}
              </p>
              <p className="text-xs text-rose-600 dark:text-rose-400 font-mono">
                Saldo CxP: ${geoTotals.cxpUsd.toFixed(2)} (Bs. {(geoTotals.cxpUsd * rate).toFixed(0)})
              </p>
            </div>
          </>
        )}
      </div>

      {/* Main Report Tables */}
      {isLoading ? (
        <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] p-10 text-center text-xs text-slate-400">
          Generando reporte...
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs overflow-hidden transition-colors">
            {reportType === 'sales' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#1f2530] border-b border-slate-200 dark:border-[#262f3c] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Factura N°</th>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Condición</th>
                      <th className="py-3 px-4 text-right">Total USD</th>
                      <th className="py-3 px-4 text-right">Total VES</th>
                      <th className="py-3 px-4 text-right">Abonado USD</th>
                      <th className="py-3 px-4 text-right">Saldo USD</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]">
                    {filteredSales.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-[#1f2530]">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">{s.invoiceNumber}</td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono">{s.date}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{s.clientName}</td>
                        <td className="py-3 px-4 uppercase text-[11px] font-semibold text-slate-600 dark:text-slate-300">{s.paymentType}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                          ${s.totalUsd.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          Bs. {s.totalVes.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          ${s.amountPaidUsd.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-700 dark:text-rose-400 font-bold">
                          ${s.balanceDueUsd.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              s.status === 'pagada'
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                : s.status === 'parcial'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                            }`}
                          >
                            {s.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'cashflow' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#1f2530] border-b border-slate-200 dark:border-[#262f3c] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Naturaleza</th>
                      <th className="py-3 px-4">Cliente / Proveedor</th>
                      <th className="py-3 px-4">Método</th>
                      <th className="py-3 px-4">Banco &amp; Referencia</th>
                      <th className="py-3 px-4 text-right">Monto Original</th>
                      <th className="py-3 px-4 text-right">Tasa</th>
                      <th className="py-3 px-4 text-right">Equivalente USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]">
                    {filteredPayments.map((p) => {
                      const isIncome = p.type === 'cliente_abono';
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-[#1f2530]">
                          <td className="py-3 px-4 font-mono text-slate-500">#{p.id}</td>
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">{p.createdAt.split('T')[0]}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isIncome
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                              }`}
                            >
                              {isIncome ? 'INGRESO (COBRO)' : 'EGRESO (PAGO)'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                            {p.clientName || p.supplierName || 'Venta mostrador'}
                          </td>
                          <td className="py-3 px-4 uppercase text-slate-700 dark:text-slate-300 font-medium">
                            {p.paymentMethod.replace('_', ' ')}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                            {p.bank || 'Caja'} {p.reference ? `· Ref: ${p.reference}` : ''}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                            {p.amountOriginal.toLocaleString()} {p.currency}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                            {p.exchangeRate.toFixed(2)} Bs/$
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono tabular-nums font-bold text-sm ${
                              isIncome ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            {isIncome ? '+' : '-'}${p.amountUsd.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'inventory' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#1f2530] border-b border-slate-200 dark:border-[#262f3c] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Código</th>
                      <th className="py-3 px-4">Producto</th>
                      <th className="py-3 px-4">Categoría</th>
                      <th className="py-3 px-4 text-center">Stock</th>
                      <th className="py-3 px-4 text-center">Mínimo</th>
                      <th className="py-3 px-4 text-right">Costo Unit.</th>
                      <th className="py-3 px-4 text-right">Precio Unit.</th>
                      <th className="py-3 px-4 text-right">Valor Costo</th>
                      <th className="py-3 px-4 text-right">Valor Venta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]">
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-[#1f2530]">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">{p.code}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{p.name}</td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{p.categoryName || 'General'}</td>
                        <td className="py-3 px-4 text-center font-mono font-bold">{p.stock}</td>
                        <td className="py-3 px-4 text-center font-mono text-slate-400">{p.minStock}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">${p.costUsd.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 font-bold">
                          ${p.priceUsd.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                          ${(p.stock * p.costUsd).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-800 dark:text-emerald-400">
                          ${(p.stock * p.priceUsd).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'geo' && (
              <div className="overflow-x-auto">
                <div className="px-4 py-3 bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      Resumen Consolidado Agrupado {geoGroupBy === 'state' ? 'por Estado' : 'por Zona'}
                    </span>
                  </h3>
                  <span className="text-[11px] font-mono text-slate-500">
                    {geoGroups.length} agrupaciones
                  </span>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#1f2530] border-b border-slate-200 dark:border-[#262f3c] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">{geoGroupBy === 'state' ? 'Estado' : 'Zona / Sector'}</th>
                      <th className="py-3 px-4 text-center">Clientes</th>
                      <th className="py-3 px-4 text-right">Ventas ($)</th>
                      <th className="py-3 px-4 text-right">Saldo CxC ($)</th>
                      <th className="py-3 px-4 text-center">Proveedores</th>
                      <th className="py-3 px-4 text-right">Compras ($)</th>
                      <th className="py-3 px-4 text-right">Saldo CxP ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]">
                    {geoGroups.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No hay clientes ni proveedores para los filtros geográficos seleccionados.
                        </td>
                      </tr>
                    ) : (
                      geoGroups.map((g) => (
                        <tr key={g.key} className="hover:bg-slate-50/80 dark:hover:bg-[#1f2530]">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 dark:text-slate-100">{g.label}</div>
                            {geoGroupBy === 'zone' && (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">{g.sublabel}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                            {g.clientsCount}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                            ${g.salesUsd.toFixed(2)}
                            <span className="block text-[10px] font-normal text-slate-400">
                              Bs. {(g.salesUsd * rate).toFixed(0)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                            ${g.cxcBalanceUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                            {g.suppliersCount}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                            ${g.purchasesUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-rose-700 dark:text-rose-400">
                            ${g.cxpBalanceUsd.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Geo Detailed Breakdown: Clients & Suppliers by Territory */}
          {reportType === 'geo' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {(geoScope === 'ambos' || geoScope === 'clientes') && (
                <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Detalle de Clientes ({geoClients.length})</span>
                    </h4>
                  </div>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/70 dark:bg-[#1f2530] border-b border-slate-200 dark:border-[#262f3c] text-slate-500 uppercase text-[10px]">
                        <tr>
                          <th className="py-2 px-3">Cliente</th>
                          <th className="py-2 px-3">Estado / Zona</th>
                          <th className="py-2 px-3 text-center">Categoría</th>
                          <th className="py-2 px-3 text-right">CxC ($)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]">
                        {geoClients.map((c) => {
                          const meta = getCreditRatingMeta(c.creditRating);
                          return (
                            <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-[#1f2530]">
                              <td className="py-2 px-3">
                                <div className="font-semibold text-slate-900 dark:text-slate-100">{c.name}</div>
                                <div className="text-[10px] font-mono text-slate-400">{c.idDoc}</div>
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-medium text-slate-700 dark:text-slate-300">{c.state || '—'}</div>
                                <div className="text-[10px] text-slate-400">{c.zoneName || '—'}</div>
                              </td>
                              <td className="py-2 px-3 text-center">
                                {c.isSuspended ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-600 text-white">
                                    SUSPENDIDO
                                  </span>
                                ) : c.creditEnabled === false ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    CONTADO
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border ${meta.cls}`}>
                                    <Award className="w-2.5 h-2.5" />
                                    {meta.label}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-rose-700 dark:text-rose-400">
                                ${c.currentBalanceUsd.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(geoScope === 'ambos' || geoScope === 'proveedores') && (
                <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Detalle de Proveedores ({geoSuppliers.length})</span>
                    </h4>
                  </div>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/70 dark:bg-[#1f2530] border-b border-slate-200 dark:border-[#262f3c] text-slate-500 uppercase text-[10px]">
                        <tr>
                          <th className="py-2 px-3">Proveedor</th>
                          <th className="py-2 px-3">Estado / Zona</th>
                          <th className="py-2 px-3 text-right">Compras ($)</th>
                          <th className="py-2 px-3 text-right">CxP ($)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]">
                        {geoSuppliers.map((s) => {
                          const pur = purchasesBySupplierId.get(s.id) || { count: 0, totalUsd: 0 };
                          return (
                            <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-[#1f2530]">
                              <td className="py-2 px-3">
                                <div className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</div>
                                <div className="text-[10px] font-mono text-slate-400">{s.idDoc}</div>
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-medium text-slate-700 dark:text-slate-300">{s.state || '—'}</div>
                                <div className="text-[10px] text-slate-400">{s.zoneName || '—'}</div>
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                ${pur.totalUsd.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-rose-700 dark:text-rose-400">
                                ${s.currentBalanceUsd.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
