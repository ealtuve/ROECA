import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Search,
  Filter,
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  X,
  History,
  TrendingUp,
  Smartphone,
  ArrowRightLeft,
  Banknote,
  RotateCcw,
  Receipt,
  Building,
  Eye,
  Printer,
  Mail,
  FileDown,
  Award,
} from 'lucide-react';
import { Sale, SaleItem, Payment, ExchangeRate, Client } from '../types/index.ts';
import { EmailInvoiceModal } from './EmailInvoiceModal.tsx';
import { InvoicePdfData, downloadInvoicePdf } from '../lib/invoicePdf.ts';
import { getCreditRatingMeta } from './Clients.tsx';

interface SaleInvoiceDetail extends Sale {
  items: SaleItem[];
  payments: Payment[];
}

interface AccountsReceivableProps {
  exchangeRate: ExchangeRate | null;
  onPaymentRegistered: () => void;
}

export const AccountsReceivable: React.FC<AccountsReceivableProps> = ({
  exchangeRate,
  onPaymentRegistered,
}) => {
  const [salesList, setSalesList] = useState<Sale[]>([]);
  const [clientsMap, setClientsMap] = useState<Record<number, Client>>({});
  const [statusFilter, setStatusFilter] = useState<'todas' | 'pendiente' | 'parcial' | 'pagada'>('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Multi-Payment Abono Modal States
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [amountUsdCash, setAmountUsdCash] = useState<string>('');
  const [amountPos, setAmountPos] = useState<string>('');
  const [refPos, setRefPos] = useState<string>('');
  const [amountTransfer, setAmountTransfer] = useState<string>('');
  const [bankTransfer, setBankTransfer] = useState<string>('Banesco');
  const [refTransfer, setRefTransfer] = useState<string>('');
  const [amountPagoMovil, setAmountPagoMovil] = useState<string>('');
  const [phonePagoMovil, setPhonePagoMovil] = useState<string>('');
  const [refPagoMovil, setRefPagoMovil] = useState<string>('');
  const [amountVesCash, setAmountVesCash] = useState<string>('');
  const [abonoNotes, setAbonoNotes] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // History Modal states
  const [historySale, setHistorySale] = useState<Sale | null>(null);
  const [historyPayments, setHistoryPayments] = useState<Payment[]>([]);

  // View Full Invoice Modal states
  const [invoiceDetail, setInvoiceDetail] = useState<SaleInvoiceDetail | null>(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);
  const [showEmailInvoiceModal, setShowEmailInvoiceModal] = useState(false);

  const rate = exchangeRate?.rate || 76.5;

  const buildPdfDataFromDetail = (detail: SaleInvoiceDetail): InvoicePdfData => {
    const activeRate = rate;
    return {
      invoiceNumber: detail.invoiceNumber,
      date: detail.date,
      paymentType: detail.paymentType,
      status: detail.status,
      exchangeRate: activeRate,
      clientId: detail.clientId,
      clientName: detail.clientName,
      clientIdDoc: detail.clientIdDoc,
      clientEmail: detail.clientEmail || null,
      clientPhone: detail.clientPhone || null,
      clientAddress: detail.clientAddress || null,
      items: detail.items.map((item) => ({
        code: item.productCode,
        name: item.productName,
        quantity: item.quantity,
        unitPriceVes: item.unitPriceUsd * activeRate,
        unitPriceUsd: item.unitPriceUsd,
        lineTotalVes: item.subtotalUsd * activeRate,
        lineTotalUsd: item.subtotalUsd,
      })),
      totalVes: detail.totalUsd * activeRate,
      totalUsd: detail.totalUsd,
      amountPaidUsd: detail.amountPaidUsd,
      balanceDueUsd: detail.balanceDueUsd,
      payments: detail.payments.map((p) => ({
        paymentMethod: p.paymentMethod,
        amountOriginal: p.amountOriginal,
        currency: p.currency,
        bank: p.bank,
        reference: p.reference,
      })),
      notes: detail.notes || null,
    };
  };

  const loadSales = async () => {
    setIsLoading(true);
    try {
      const [res, cRes] = await Promise.all([
        apiFetch('/api/sales?paymentType=credito'),
        apiFetch('/api/clients'),
      ]);
      if (res.ok) {
        const data: Sale[] = await res.json();
        setSalesList(data);
      }
      if (cRes.ok) {
        const cls: Client[] = await cRes.json();
        const map: Record<number, Client> = {};
        cls.forEach((c) => {
          map[c.id] = c;
        });
        setClientsMap(map);
      }
    } catch (err) {
      console.error('Error fetching sales for CxC', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  const openAbonoModal = (sale: Sale) => {
    setSelectedSale(sale);
    // Reset inputs
    setAmountUsdCash('');
    setAmountPos('');
    setRefPos('');
    setAmountTransfer('');
    setBankTransfer('Banesco');
    setRefTransfer('');
    setAmountPagoMovil('');
    setPhonePagoMovil('');
    setRefPagoMovil('');
    setAmountVesCash('');
    setAbonoNotes('');
    setFormError('');
  };

  const openHistoryModal = async (sale: Sale) => {
    setHistorySale(sale);
    try {
      const res = await apiFetch(`/api/payments?saleId=${sale.id}`);
      if (res.ok) {
        const paymentsData = await res.json();
        setHistoryPayments(paymentsData);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const openInvoiceDetailModal = async (sale: Sale) => {
    setIsLoadingInvoice(true);
    setInvoiceDetail({
      ...sale,
      items: [],
      payments: [],
    });
    try {
      const res = await apiFetch(`/api/sales/${sale.id}`);
      if (res.ok) {
        const detail: SaleInvoiceDetail = await res.json();
        setInvoiceDetail(detail);
      }
    } catch (e) {
      console.error('Error loading invoice detail', e);
    } finally {
      setIsLoadingInvoice(false);
    }
  };

  // Calculations for Multi-Payment breakdown
  const usdCashNum = Number(amountUsdCash) || 0;
  const usdCashInBs = usdCashNum * rate;

  const posNumBs = Number(amountPos) || 0;
  const transferNumBs = Number(amountTransfer) || 0;
  const pagoMovilNumBs = Number(amountPagoMovil) || 0;
  const vesCashNumBs = Number(amountVesCash) || 0;

  // Total entered in Bolívares
  const totalAbonoBs = usdCashInBs + posNumBs + transferNumBs + pagoMovilNumBs + vesCashNumBs;
  // Total equivalent in USD
  const totalAbonoUsd = totalAbonoBs / rate;

  const saleDebtUsd = selectedSale?.balanceDueUsd || 0;
  const saleDebtBs = saleDebtUsd * rate;

  const remainingDebtBs = Math.max(0, saleDebtBs - totalAbonoBs);
  const remainingDebtUsd = Math.max(0, saleDebtUsd - totalAbonoUsd);

  const isOverpaying = totalAbonoUsd > saleDebtUsd + 0.1;
  const isFullPayment = totalAbonoUsd >= saleDebtUsd - 0.05 && !isOverpaying;

  // Quick Action Fillers
  const fillAllInUsd = () => {
    setAmountUsdCash(saleDebtUsd.toFixed(2));
    setAmountPos('');
    setAmountTransfer('');
    setAmountPagoMovil('');
    setAmountVesCash('');
    setFormError('');
  };

  const fillAllInPos = () => {
    setAmountUsdCash('');
    setAmountPos(saleDebtBs.toFixed(2));
    setAmountTransfer('');
    setAmountPagoMovil('');
    setAmountVesCash('');
    setFormError('');
  };

  const fillAllInPagoMovil = () => {
    setAmountUsdCash('');
    setAmountPos('');
    setAmountTransfer('');
    setAmountPagoMovil(saleDebtBs.toFixed(2));
    setAmountVesCash('');
    setFormError('');
  };

  const fillAllInTransfer = () => {
    setAmountUsdCash('');
    setAmountPos('');
    setAmountTransfer(saleDebtBs.toFixed(2));
    setAmountPagoMovil('');
    setAmountVesCash('');
    setFormError('');
  };

  const clearAllAmounts = () => {
    setAmountUsdCash('');
    setAmountPos('');
    setAmountTransfer('');
    setAmountPagoMovil('');
    setAmountVesCash('');
    setFormError('');
  };

  const handleRegisterMultiAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale) return;

    if (totalAbonoBs <= 0.01) {
      setFormError('Debe ingresar un monto a abonar en al menos uno de los métodos de pago.');
      return;
    }

    if (isOverpaying) {
      setFormError(
        `El total abonado (Bs. ${totalAbonoBs.toFixed(2)} / $${totalAbonoUsd.toFixed(2)}) supera el saldo deudor de la factura (Bs. ${saleDebtBs.toFixed(2)} / $${saleDebtUsd.toFixed(2)}). Por favor ajuste los montos.`
      );
      return;
    }

    if (transferNumBs > 0 && !refTransfer.trim()) {
      setFormError('Para el abono por Transferencia Bancaria es obligatorio ingresar el número de referencia para validar el recibo.');
      return;
    }

    if (pagoMovilNumBs > 0 && !refPagoMovil.trim()) {
      setFormError('Para el abono por Pago Móvil es obligatorio ingresar el número de referencia.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    // Build paymentsList
    const paymentsList = [];
    if (usdCashNum > 0) {
      paymentsList.push({
        paymentMethod: 'efectivo_usd',
        amountOriginal: usdCashNum,
        currency: 'USD' as const,
        notes: `Abono en Efectivo Dólares ($${usdCashNum.toFixed(2)}) convertido a tasa BCV ${rate.toFixed(2)} Bs/$`,
      });
    }
    if (posNumBs > 0) {
      paymentsList.push({
        paymentMethod: 'punto_de_venta',
        amountOriginal: posNumBs,
        currency: 'VES' as const,
        reference: refPos.trim() || undefined,
        notes: `Abono Punto de Venta / Tarjeta`,
      });
    }
    if (transferNumBs > 0) {
      paymentsList.push({
        paymentMethod: 'transferencia',
        amountOriginal: transferNumBs,
        currency: 'VES' as const,
        bank: bankTransfer.trim() || undefined,
        reference: refTransfer.trim(),
        notes: `Abono Transferencia Bancaria ${bankTransfer}`,
      });
    }
    if (pagoMovilNumBs > 0) {
      paymentsList.push({
        paymentMethod: 'pago_movil',
        amountOriginal: pagoMovilNumBs,
        currency: 'VES' as const,
        bank: phonePagoMovil.trim() || undefined,
        reference: refPagoMovil.trim(),
        notes: `Abono Pago Móvil`,
      });
    }
    if (vesCashNumBs > 0) {
      paymentsList.push({
        paymentMethod: 'efectivo_ves',
        amountOriginal: vesCashNumBs,
        currency: 'VES' as const,
        notes: `Abono Efectivo Bolívares`,
      });
    }

    try {
      const res = await apiFetch('/api/payments/abono', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cliente_abono',
          saleId: selectedSale.id,
          paymentsList,
          notes: abonoNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al procesar el abono');
      }
      const abonoResult = await res.json().catch(() => ({}));
      const ratingNote = abonoResult?.clientCreditRating
        ? ` · Categoría del cliente actualizada: ${String(abonoResult.clientCreditRating).toUpperCase()}.`
        : '';

      setSelectedSale(null);
      setSuccessMsg(
        `¡Abono registrado exitosamente! Total abonado: Bs. ${totalAbonoBs.toFixed(2)} (Ref. $${totalAbonoUsd.toFixed(2)}).${ratingNote}`
      );
      setTimeout(() => setSuccessMsg(''), 7000);
      loadSales();
      onPaymentRegistered();
    } catch (err: any) {
      setFormError(err.message || 'Error en el servidor al registrar el pago');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSales = salesList.filter((s) => {
    const matchesSearch =
      s.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'todas' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalOutstandingUsd = salesList.reduce((sum, s) => sum + s.balanceDueUsd, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner with Eye-Friendly Soft Dark Styling */}
      <div className="bg-white dark:bg-[#161b22] p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Cuentas por Cobrar (CxC a Clientes)
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/60 font-semibold font-mono">
              Créditos Comerciales
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Control de cobranzas con abonos multidivisa: Dólares a tasa BCV oficial, Punto de Venta, Transferencias y Pago Móvil.
          </p>
        </div>

        <div className="p-3.5 bg-emerald-50 dark:bg-[#1a2322] rounded-xl border border-emerald-200 dark:border-emerald-900/60 text-right shrink-0">
          <span className="text-xs font-medium text-emerald-800 dark:text-emerald-400 block">Deuda Pendiente Global de Clientes:</span>
          <span className="text-xl font-bold text-emerald-950 dark:text-emerald-300 font-mono tabular-nums block">
            Bs. {(totalOutstandingUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-emerald-700 dark:text-emerald-400/80 font-mono tabular-nums">
            Ref. ${totalOutstandingUsd.toFixed(2)} USD (Tasa BCV: {rate.toFixed(2)} Bs/$)
          </span>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#161b22] p-4 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between transition-colors">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por cliente o N° de factura (ej. Los Andes, FAC-00102)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-600 dark:focus:border-emerald-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="py-2 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-hidden cursor-pointer"
          >
            <option value="todas">Todos los estados</option>
            <option value="pendiente">Solo Pendientes</option>
            <option value="parcial">Solo Parciales (Con abonos)</option>
            <option value="pagada">Solo Totalmente Pagadas</option>
          </select>
        </div>
      </div>

      {/* Credit Sales Table */}
      <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1f2530] border-b border-slate-200 dark:border-[#262f3c] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Factura N°</th>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4 text-right">Total Factura (Bs.)</th>
                <th className="py-3 px-4 text-right">Abonado (Bs.)</th>
                <th className="py-3 px-4 text-right">Saldo Deudor (Bs.)</th>
                <th className="py-3 px-4 text-right">Saldo Ref. ($)</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#222936]">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 dark:text-slate-500">
                    No hay facturas a crédito con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const isPaid = sale.status === 'pagada' || sale.balanceDueUsd <= 0.01;
                  const isPartial = sale.status === 'parcial' && sale.balanceDueUsd > 0.01;
                  const clientObj = clientsMap[sale.clientId];
                  const ratingMeta = clientObj ? getCreditRatingMeta(clientObj.creditRating) : null;
                  const todayIso = new Date().toISOString().split('T')[0];
                  const overdueDays =
                    !isPaid && sale.dueDate
                      ? Math.floor(
                          (new Date(`${todayIso}T12:00:00Z`).getTime() -
                            new Date(`${sale.dueDate}T12:00:00Z`).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : 0;

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/80 dark:hover:bg-[#1a2028] transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                        <button
                          type="button"
                          onClick={() => openInvoiceDetailModal(sale)}
                          className="hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline cursor-pointer text-left"
                          title="Ver detalle completo de la factura"
                        >
                          {sale.invoiceNumber}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono">
                        <div>{sale.date}</div>
                        {sale.dueDate && (
                          <div
                            className={`text-[10px] font-semibold ${
                              overdueDays > 7
                                ? 'text-rose-600 dark:text-rose-400'
                                : overdueDays > 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-400'
                            }`}
                          >
                            Vence: {sale.dueDate}
                            {!isPaid && overdueDays > 0 && ` (+${overdueDays}d mora)`}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-200">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{sale.clientName}</span>
                          {ratingMeta && (
                            <span
                              title={ratingMeta.desc}
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border ${ratingMeta.cls}`}
                            >
                              <Award className="w-2.5 h-2.5" />
                              {ratingMeta.label}
                            </span>
                          )}
                        </div>
                        <span className="block text-[11px] text-slate-400 font-mono">
                          {sale.clientIdDoc || ''}
                          {clientObj?.zoneName ? ` · ${clientObj.zoneName}` : clientObj?.state ? ` · ${clientObj.state}` : ''}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-200 font-semibold">
                        Bs. {(sale.totalUsd * rate).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        Bs. {(sale.amountPaidUsd * rate).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-rose-700 dark:text-rose-400 text-sm">
                        Bs. {(sale.balanceDueUsd * rate).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        ${sale.balanceDueUsd.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isPaid ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            PAGADA
                          </span>
                        ) : isPartial ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            ABONO PARCIAL
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            PENDIENTE
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openInvoiceDetailModal(sale)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-[#1f2530] dark:hover:bg-[#2a3342] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#2d3748] rounded font-medium text-[11px] transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            title="Ver factura pendiente y sus productos"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Ver Factura</span>
                          </button>

                          {!isPaid ? (
                            <button
                              onClick={() => openAbonoModal(sale)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded font-medium text-[11px] transition-colors flex items-center gap-1 cursor-pointer shadow-xs whitespace-nowrap"
                            >
                              <DollarSign className="w-3 h-3" />
                              <span>Abonar</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium px-1">Solvente</span>
                          )}

                          <button
                            onClick={() => openHistoryModal(sale)}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#222936] rounded transition-colors cursor-pointer"
                            title="Ver Historial de Abonos"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MULTI-PAYMENT ABONO MODAL (Dólares BCV + Punto de Venta + Transferencia + Pago Móvil) */}
      {selectedSale && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative my-6 animate-in fade-in duration-150">
            <button
              onClick={() => setSelectedSale(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Registrar Abono Multidivisa</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                Factura {selectedSale.invoiceNumber} · Cliente: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedSale.clientName}</span>
              </p>
            </div>

            {/* Financial Summary Card */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4 p-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-xl text-xs font-mono">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Total Factura:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">Bs. {(selectedSale.totalUsd * rate).toFixed(2)}</span>
                <span className="text-[10px] text-slate-400">${selectedSale.totalUsd.toFixed(2)} USD</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Ya Abonado:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 block">Bs. {(selectedSale.amountPaidUsd * rate).toFixed(2)}</span>
                <span className="text-[10px] text-slate-400">${selectedSale.amountPaidUsd.toFixed(2)} USD</span>
              </div>
              <div className="col-span-2 sm:col-span-1 bg-rose-50/70 dark:bg-rose-950/30 p-2 rounded-lg border border-rose-200 dark:border-rose-900/40">
                <span className="text-[11px] text-rose-800 dark:text-rose-400 font-bold block">Saldo Pendiente:</span>
                <span className="text-sm font-bold text-rose-700 dark:text-rose-300 block">
                  Bs. {saleDebtBs.toFixed(2)}
                </span>
                <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                  Ref. ${saleDebtUsd.toFixed(2)} USD
                </span>
              </div>
            </div>

            {/* Quick Fill Buttons */}
            <div className="mb-4">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1.5">
                Atajos de Asignación Rápida:
              </span>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={fillAllInUsd}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-md font-medium cursor-pointer transition-colors"
                >
                  Total en Dólares ($)
                </button>
                <button
                  type="button"
                  onClick={fillAllInPos}
                  className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900/60 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800 rounded-md font-medium cursor-pointer transition-colors"
                >
                  Total en Punto de Venta
                </button>
                <button
                  type="button"
                  onClick={fillAllInPagoMovil}
                  className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 rounded-md font-medium cursor-pointer transition-colors"
                >
                  Total en Pago Móvil
                </button>
                <button
                  type="button"
                  onClick={fillAllInTransfer}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 rounded-md font-medium cursor-pointer transition-colors"
                >
                  Total en Transferencia
                </button>
                <button
                  type="button"
                  onClick={clearAllAmounts}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-600 dark:text-slate-400 rounded-md cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3 h-3 inline mr-1" />
                  Limpiar
                </button>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleRegisterMultiAbono} className="space-y-3.5 text-xs">
              {/* 1. DÓLARES EN EFECTIVO ($ USD) */}
              <div className="p-3 bg-emerald-50/50 dark:bg-[#16231e] border border-emerald-200 dark:border-emerald-900/50 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>1. Dólares en Efectivo ($ USD)</span>
                  </label>
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
                    Tasa BCV: {rate.toFixed(2)} Bs/$
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-2 font-bold text-emerald-700 dark:text-emerald-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={amountUsdCash}
                      onChange={(e) => setAmountUsdCash(e.target.value)}
                      className="w-full pl-7 pr-3 py-1.5 bg-white dark:bg-[#1c222b] border border-emerald-300 dark:border-emerald-800 rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="flex items-center px-3 py-1.5 bg-emerald-100/60 dark:bg-[#1c2e26] rounded-lg font-mono text-[11px] text-emerald-950 dark:text-emerald-300">
                    <span>= Bs. {usdCashInBs.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* 2. PUNTO DE VENTA / TARJETA (Bs.) */}
              <div className="p-3 bg-sky-50/40 dark:bg-[#15232d] border border-sky-200 dark:border-sky-900/50 rounded-xl space-y-1.5">
                <label className="font-bold text-sky-900 dark:text-sky-300 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>2. Punto de Venta / Tarjeta (Bs.)</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 font-bold text-sky-700 dark:text-sky-400 text-[11px]">Bs.</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={amountPos}
                      onChange={(e) => setAmountPos(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-[#1c222b] border border-sky-300 dark:border-sky-800 rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="N° Lote / Aprobación (opcional)"
                    value={refPos}
                    onChange={(e) => setRefPos(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-[#1c222b] border border-sky-300 dark:border-sky-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* 3. TRANSFERENCIA BANCARIA (Bs.) */}
              <div className="p-3 bg-indigo-50/40 dark:bg-[#181d2f] border border-indigo-200 dark:border-indigo-900/50 rounded-xl space-y-1.5">
                <label className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                  <ArrowRightLeft className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>3. Transferencia Bancaria (Bs.)</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 font-bold text-indigo-700 dark:text-indigo-400 text-[11px]">Bs.</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={amountTransfer}
                      onChange={(e) => setAmountTransfer(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-[#1c222b] border border-indigo-300 dark:border-indigo-800 rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <select
                    value={bankTransfer}
                    onChange={(e) => setBankTransfer(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-[#1c222b] border border-indigo-300 dark:border-indigo-800 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden"
                  >
                    <option value="Banesco">Banesco</option>
                    <option value="Banco de Venezuela">Banco de Venezuela</option>
                    <option value="Mercantil">Mercantil</option>
                    <option value="Provincial">BBVA Provincial</option>
                    <option value="Bancamiga">Bancamiga</option>
                    <option value="BNC">BNC</option>
                    <option value="Banplus">Banplus</option>
                  </select>
                  <input
                    type="text"
                    placeholder="N° Referencia *"
                    value={refTransfer}
                    onChange={(e) => setRefTransfer(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-[#1c222b] border border-indigo-300 dark:border-indigo-800 rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* 4. PAGO MÓVIL (Bs.) */}
              <div className="p-3 bg-purple-50/40 dark:bg-[#20192e] border border-purple-200 dark:border-purple-900/50 rounded-xl space-y-1.5">
                <label className="font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>4. Pago Móvil (Bs.)</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 font-bold text-purple-700 dark:text-purple-400 text-[11px]">Bs.</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={amountPagoMovil}
                      onChange={(e) => setAmountPagoMovil(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-[#1c222b] border border-purple-300 dark:border-purple-800 rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Teléfono / Emisor"
                    value={phonePagoMovil}
                    onChange={(e) => setPhonePagoMovil(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-[#1c222b] border border-purple-300 dark:border-purple-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                  <input
                    type="text"
                    placeholder="N° Referencia *"
                    value={refPagoMovil}
                    onChange={(e) => setRefPagoMovil(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-[#1c222b] border border-purple-300 dark:border-purple-800 rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* 5. EFECTIVO BOLÍVARES (Bs.) */}
              <div className="p-3 bg-slate-50 dark:bg-[#191f28] border border-slate-200 dark:border-[#2d3748] rounded-xl space-y-1.5">
                <label className="font-bold text-slate-800 dark:text-slate-300 flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <span>5. Efectivo Bolívares (Bs. VES)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 font-bold text-slate-500 text-[11px]">Bs.</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amountVesCash}
                    onChange={(e) => setAmountVesCash(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Observaciones generales */}
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Notas u Observaciones del Abono:
                </label>
                <input
                  type="text"
                  placeholder="Detalle o justificación administrativa..."
                  value={abonoNotes}
                  onChange={(e) => setAbonoNotes(e.target.value)}
                  className="w-full py-1.5 px-3 bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Real-time Calculation & Remaining Balance Preview */}
              <div className="p-3 bg-slate-100 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-xl font-mono space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Total Abonado en esta Operación:</span>
                  <div className="text-right">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 block text-sm">
                      Bs. {totalAbonoBs.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Equivalente: ${totalAbonoUsd.toFixed(2)} USD
                    </span>
                  </div>
                </div>

                <div className="pt-1.5 border-t border-slate-200 dark:border-[#2d3748] flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-300">Nuevo Saldo Pendiente:</span>
                  <div className="text-right">
                    <span className={`font-bold text-sm block ${remainingDebtBs <= 0.01 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                      Bs. {remainingDebtBs.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Ref. ${remainingDebtUsd.toFixed(2)} USD
                    </span>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">Resultado esperado:</span>
                  {remainingDebtBs <= 0.01 && totalAbonoBs > 0 ? (
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
                      CANCELACIÓN TOTAL (FACTURA PAGADA)
                    </span>
                  ) : totalAbonoBs > 0 ? (
                    <span className="font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded">
                      ABONO PARCIAL (CONTINÚA CON DEUDA)
                    </span>
                  ) : (
                    <span className="text-slate-400">Ingrese montos para calcular</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSale(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || totalAbonoBs <= 0 || isOverpaying}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isSubmitting ? 'Procesando Abono...' : 'Registrar Abono'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Historial de Abonos de una Factura */}
      {historySale && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative animate-in fade-in duration-150">
            <button
              onClick={() => setHistorySale(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Historial de Abonos Recibidos</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                Factura {historySale.invoiceNumber} · {historySale.clientName}
              </p>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-[#222936] text-xs">
              {historyPayments.length === 0 ? (
                <p className="text-center py-6 text-slate-400 dark:text-slate-500">
                  Esta factura aún no registra ningún abono.
                </p>
              ) : (
                historyPayments.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {p.paymentMethod.replace('_', ' ').toUpperCase()}
                        {p.bank && ` (${p.bank})`}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {p.reference ? `Ref: ${p.reference} · ` : ''}Tasa: {p.exchangeRate.toFixed(2)} Bs/$
                      </div>
                      {p.notes && <div className="text-[10px] text-slate-400 mt-0.5">{p.notes}</div>}
                    </div>

                    <div className="text-right font-mono">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm block">
                        Bs. {(p.amountOriginal * (p.currency === 'USD' ? p.exchangeRate : 1)).toFixed(2)}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                        {p.currency === 'USD' ? `$${p.amountOriginal.toFixed(2)} USD` : `Bs. ${p.amountOriginal.toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[#2d3748] flex justify-between items-center text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Saldo Restante:</span>{' '}
                <span className="font-bold text-rose-700 dark:text-rose-400 font-mono">
                  Bs. {(historySale.balanceDueUsd * rate).toFixed(2)} (${historySale.balanceDueUsd.toFixed(2)})
                </span>
              </div>
              <button
                onClick={() => setHistorySale(null)}
                className="py-1.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 rounded-lg font-semibold cursor-pointer transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ver Factura Pendiente Completa (CxC) */}
      {invoiceDetail && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
          <div
            id="printable-receipt"
            className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative my-auto max-h-[92vh] overflow-y-auto animate-in fade-in duration-150"
          >
            <button
              onClick={() => setInvoiceDetail(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer print:hidden"
              title="Cerrar factura"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Documento */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-[#262f3c] pr-8">
              <div>
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Factura {invoiceDetail.invoiceNumber}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      invoiceDetail.balanceDueUsd <= 0.01
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : invoiceDetail.status === 'parcial'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    {invoiceDetail.balanceDueUsd <= 0.01
                      ? 'PAGADA'
                      : invoiceDetail.status === 'parcial'
                      ? 'ABONO PARCIAL'
                      : 'PENDIENTE'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  DISTRIBUIDORA ROECA C.A. · RIF: J-50182934-1
                </p>
              </div>
              <div className="text-left sm:text-right text-xs font-mono text-slate-600 dark:text-slate-400">
                <div>Fecha Emisión: <strong className="text-slate-900 dark:text-slate-100">{invoiceDetail.date}</strong></div>
                <div>Condición: <strong className="uppercase text-slate-900 dark:text-slate-100">{invoiceDetail.paymentType}</strong></div>
                <div>Tasa BCV actual: <strong className="text-emerald-700 dark:text-emerald-400">{rate.toFixed(2)} Bs/$</strong></div>
              </div>
            </div>

            {/* Datos del Cliente */}
            <div className="my-3 p-3 bg-slate-50 dark:bg-[#1c222b] rounded-xl border border-slate-200 dark:border-[#2d3748] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Cliente:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">{invoiceDetail.clientName}</span>
                {invoiceDetail.clientIdDoc && (
                  <span className="block font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Cédula/RIF: {invoiceDetail.clientIdDoc}
                  </span>
                )}
              </div>
              <div className="sm:text-right">
                {invoiceDetail.clientEmail && (
                  <div className="text-sky-700 dark:text-sky-300 font-mono text-[11px] flex items-center sm:justify-end gap-1">
                    <Mail className="w-3 h-3 shrink-0" />
                    <span>{invoiceDetail.clientEmail}</span>
                  </div>
                )}
                {invoiceDetail.clientPhone && (
                  <div className="text-slate-600 dark:text-slate-300 font-mono">Tel: {invoiceDetail.clientPhone}</div>
                )}
                {invoiceDetail.clientAddress && (
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">{invoiceDetail.clientAddress}</div>
                )}
                {invoiceDetail.notes && (
                  <div className="text-amber-700 dark:text-amber-400 text-[11px] mt-0.5">Nota: {invoiceDetail.notes}</div>
                )}
              </div>
            </div>

            {/* Tabla de Artículos Facturados */}
            <div className="rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden mb-3">
              <div className="px-3 py-2 bg-slate-100 dark:bg-[#1f2530] text-[11px] font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-[#262f3c]">
                Detalle de Artículos en la Factura ({invoiceDetail.items.length})
              </div>
              <div className="overflow-x-auto max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#1a212b] text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#262f3c]">
                    <tr>
                      <th className="py-2 px-3">Código</th>
                      <th className="py-2 px-3">Descripción / Artículo</th>
                      <th className="py-2 px-2 text-center">Cant.</th>
                      <th className="py-2 px-3 text-right">Precio Unit.</th>
                      <th className="py-2 px-3 text-right">Total (Bs.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#222936]">
                    {isLoadingInvoice ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          Cargando detalle de artículos...
                        </td>
                      </tr>
                    ) : invoiceDetail.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          Esta factura no tiene líneas de productos registradas.
                        </td>
                      </tr>
                    ) : (
                      invoiceDetail.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {item.productCode}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                            {item.productName}
                          </td>
                          <td className="py-2 px-2 text-center font-mono font-bold tabular-nums">
                            {item.quantity}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            Bs. {(item.unitPriceUsd * rate).toFixed(2)}
                            <span className="block text-[10px] text-slate-400">${item.unitPriceUsd.toFixed(2)}</span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                            Bs. {(item.subtotalUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            <span className="block text-[10px] font-normal text-slate-400">${item.subtotalUsd.toFixed(2)}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Resumen Financiero */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 bg-slate-50 dark:bg-[#1c222b] rounded-xl border border-slate-200 dark:border-[#2d3748] font-mono tabular-nums mb-3">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Total Factura:</span>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100 block">
                  Bs. {(invoiceDetail.totalUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-slate-400">${invoiceDetail.totalUsd.toFixed(2)} USD</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Total Abonado:</span>
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 block">
                  Bs. {(invoiceDetail.amountPaidUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-slate-400">${invoiceDetail.amountPaidUsd.toFixed(2)} USD</span>
              </div>
              <div className="bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg border border-rose-200 dark:border-rose-800/70 sm:text-right">
                <span className="text-[10px] font-bold text-rose-800 dark:text-rose-300 block">SALDO PENDIENTE:</span>
                <span className="text-lg font-extrabold text-rose-700 dark:text-rose-400 block">
                  Bs. {(invoiceDetail.balanceDueUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-rose-600 dark:text-rose-400">
                  Ref. ${invoiceDetail.balanceDueUsd.toFixed(2)} USD
                </span>
              </div>
            </div>

            {/* Abonos previos si existen */}
            {invoiceDetail.payments.length > 0 && (
              <div className="mb-3 p-3 bg-slate-50/70 dark:bg-[#1a212b] rounded-xl border border-slate-200 dark:border-[#262f3c] text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Abonos Registrados ({invoiceDetail.payments.length}):
                </span>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {invoiceDetail.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-600 dark:text-slate-300">
                        • {p.paymentMethod.replace('_', ' ').toUpperCase()}
                        {p.reference ? ` (Ref: ${p.reference})` : ''}
                      </span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        Bs. {(p.amountOriginal * (p.currency === 'USD' ? p.exchangeRate : 1)).toFixed(2)} (
                        {p.currency === 'USD' ? `$${p.amountOriginal.toFixed(2)}` : `Bs. ${p.amountOriginal.toFixed(2)}`})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Acciones */}
            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#262f3c] print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1f2530] dark:hover:bg-[#2a3342] text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir</span>
              </button>

              <button
                type="button"
                onClick={() => downloadInvoicePdf(buildPdfDataFromDetail(invoiceDetail))}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1f2530] dark:hover:bg-[#2a3342] text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                <span>Descargar PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setShowEmailInvoiceModal(true)}
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Mail className="w-4 h-4" />
                <span>Enviar PDF por Correo</span>
              </button>

              {invoiceDetail.balanceDueUsd > 0.01 && (
                <button
                  type="button"
                  onClick={() => {
                    const target = invoiceDetail;
                    setInvoiceDetail(null);
                    openAbonoModal(target);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Abonar a esta Factura</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setInvoiceDetail(null)}
                className="px-4 py-2 bg-slate-900 dark:bg-[#252e3d] text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Enviar Factura PDF por Gmail desde CxC */}
      {showEmailInvoiceModal && invoiceDetail && (
        <EmailInvoiceModal
          invoice={buildPdfDataFromDetail(invoiceDetail)}
          onClose={() => setShowEmailInvoiceModal(false)}
          onEmailSent={(recipient) => {
            setSuccessMsg(`Factura ${invoiceDetail.invoiceNumber} enviada en PDF a ${recipient}.`);
            setTimeout(() => setSuccessMsg(''), 6000);
          }}
          onClientEmailSaved={(_clientId, savedEmail) => {
            setInvoiceDetail((prev) => (prev ? { ...prev, clientEmail: savedEmail } : prev));
            setSalesList((prev) =>
              prev.map((s) =>
                s.clientId === invoiceDetail.clientId ? { ...s, clientEmail: savedEmail } : s
              )
            );
          }}
        />
      )}
    </div>
  );
};
