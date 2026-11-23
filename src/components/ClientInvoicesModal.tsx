import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileText,
  Receipt,
  CheckCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  CreditCard,
  Download,
  Search,
  Award,
  Loader2,
  Calendar,
  Package,
  Banknote,
  Smartphone,
  Building2,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { apiFetch } from '../lib/firestoreStore.ts';
import { Client, ExchangeRate, Sale } from '../types/index.ts';
import { downloadInvoicePdf } from '../lib/invoicePdf.ts';
import { getCreditRatingMeta } from './Clients.tsx';

interface ClientInvoicesModalProps {
  client: Client | null;
  exchangeRate: ExchangeRate | null;
  onClose: () => void;
  onDataChanged: () => void;
}

const formatMethodLabel = (method: string) => {
  switch (method) {
    case 'efectivo_usd':
      return 'Efectivo Divisas ($)';
    case 'efectivo_ves':
      return 'Efectivo Bolívares (Bs.)';
    case 'punto_de_venta':
      return 'Punto de Venta (POS)';
    case 'pago_movil':
      return 'Pago Móvil';
    case 'transferencia':
      return 'Transferencia Bancaria';
    default:
      return method.replace(/_/g, ' ');
  }
};

export const ClientInvoicesModal: React.FC<ClientInvoicesModalProps> = ({
  client,
  exchangeRate,
  onClose,
  onDataChanged,
}) => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'paid'>('all');
  const [searchInvoice, setSearchInvoice] = useState('');

  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [saleDetail, setSaleDetail] = useState<Sale | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Payment / Abono inline form state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payUsdCash, setPayUsdCash] = useState('');
  const [payPosVes, setPayPosVes] = useState('');
  const [payPosRef, setPayPosRef] = useState('');
  const [payPagoMovilVes, setPayPagoMovilVes] = useState('');
  const [payPagoMovilRef, setPayPagoMovilRef] = useState('');
  const [payTransferVes, setPayTransferVes] = useState('');
  const [payTransferBank, setPayTransferBank] = useState('Banesco');
  const [payTransferRef, setPayTransferRef] = useState('');
  const [payVesCash, setPayVesCash] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const rate = exchangeRate?.rate || 76.5;

  const resetPaymentFields = () => {
    setPayUsdCash('');
    setPayPosVes('');
    setPayPosRef('');
    setPayPagoMovilVes('');
    setPayPagoMovilRef('');
    setPayTransferVes('');
    setPayTransferBank('Banesco');
    setPayTransferRef('');
    setPayVesCash('');
    setPayNotes('');
  };

  const loadClientSales = async (clientId: number, keepSelectedId?: number | null) => {
    setIsLoadingList(true);
    try {
      const res = await apiFetch(`/api/sales?clientId=${clientId}`);
      if (res.ok) {
        const list: Sale[] = await res.json();
        setSales(list);

        if (keepSelectedId && list.some((s) => s.id === keepSelectedId)) {
          setSelectedSaleId(keepSelectedId);
        } else {
          const firstPending = list.find((s) => s.balanceDueUsd > 0.01);
          const nextId = firstPending ? firstPending.id : list[0]?.id ?? null;
          setSelectedSaleId(nextId);
        }
      }
    } catch (e) {
      console.error('Error loading client sales', e);
    } finally {
      setIsLoadingList(false);
    }
  };

  const loadSaleDetail = async (saleId: number) => {
    setIsLoadingDetail(true);
    try {
      const res = await apiFetch(`/api/sales/${saleId}`);
      if (res.ok) {
        const detail: Sale = await res.json();
        setSaleDetail(detail);
      }
    } catch (e) {
      console.error('Error loading sale detail', e);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (client) {
      setFilterMode('all');
      setSearchInvoice('');
      setShowPaymentForm(false);
      setPaymentFeedback(null);
      resetPaymentFields();
      setSaleDetail(null);
      setSelectedSaleId(null);
      void loadClientSales(client.id);
    }
  }, [client?.id]);

  useEffect(() => {
    if (selectedSaleId) {
      setShowPaymentForm(false);
      resetPaymentFields();
      void loadSaleDetail(selectedSaleId);
    } else {
      setSaleDetail(null);
    }
  }, [selectedSaleId]);

  const counts = useMemo(() => {
    let pending = 0;
    let paid = 0;
    let totalDebtUsd = 0;
    sales.forEach((s) => {
      if (s.balanceDueUsd > 0.01) {
        pending += 1;
        totalDebtUsd += s.balanceDueUsd;
      } else {
        paid += 1;
      }
    });
    return { all: sales.length, pending, paid, totalDebtUsd };
  }, [sales]);

  const filteredSales = useMemo(() => {
    const q = searchInvoice.trim().toLowerCase();
    return sales.filter((s) => {
      if (filterMode === 'pending' && s.balanceDueUsd <= 0.01) return false;
      if (filterMode === 'paid' && s.balanceDueUsd > 0.01) return false;
      if (q && !s.invoiceNumber.toLowerCase().includes(q) && !s.date.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [sales, filterMode, searchInvoice]);

  if (!client) return null;

  const todayIso = new Date().toISOString().split('T')[0];
  const ratingMeta = getCreditRatingMeta(client.creditRating);

  const selectedBalanceUsd = saleDetail?.balanceDueUsd ?? 0;
  const selectedBalanceVes = selectedBalanceUsd * rate;

  // Live payment calculation
  const enteredUsdTotal =
    (Number(payUsdCash) || 0) +
    (Number(payPosVes) || 0) / rate +
    (Number(payPagoMovilVes) || 0) / rate +
    (Number(payTransferVes) || 0) / rate +
    (Number(payVesCash) || 0) / rate;

  const remainingAfterPaymentUsd = Math.max(0, selectedBalanceUsd - enteredUsdTotal);
  const isFullCancellation = selectedBalanceUsd > 0.01 && enteredUsdTotal >= selectedBalanceUsd - 0.02;

  const fillFullAmountIn = (method: 'usd' | 'pos' | 'pagomovil' | 'transfer') => {
    resetPaymentFields();
    setShowPaymentForm(true);
    setPaymentFeedback(null);
    if (method === 'usd') {
      setPayUsdCash(selectedBalanceUsd.toFixed(2));
    } else if (method === 'pos') {
      setPayPosVes(selectedBalanceVes.toFixed(2));
    } else if (method === 'pagomovil') {
      setPayPagoMovilVes(selectedBalanceVes.toFixed(2));
    } else if (method === 'transfer') {
      setPayTransferVes(selectedBalanceVes.toFixed(2));
    }
  };

  const handleSubmitAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleDetail) return;

    const paymentsList: Array<{
      paymentMethod: string;
      amountOriginal: number;
      currency: 'USD' | 'VES';
      bank?: string | null;
      reference?: string | null;
      notes?: string | null;
    }> = [];

    if (Number(payUsdCash) > 0) {
      paymentsList.push({
        paymentMethod: 'efectivo_usd',
        amountOriginal: Number(payUsdCash),
        currency: 'USD',
        notes: payNotes.trim() || null,
      });
    }
    if (Number(payPosVes) > 0) {
      paymentsList.push({
        paymentMethod: 'punto_de_venta',
        amountOriginal: Number(payPosVes),
        currency: 'VES',
        reference: payPosRef.trim() || null,
        notes: payNotes.trim() || null,
      });
    }
    if (Number(payPagoMovilVes) > 0) {
      paymentsList.push({
        paymentMethod: 'pago_movil',
        amountOriginal: Number(payPagoMovilVes),
        currency: 'VES',
        reference: payPagoMovilRef.trim() || null,
        notes: payNotes.trim() || null,
      });
    }
    if (Number(payTransferVes) > 0) {
      paymentsList.push({
        paymentMethod: 'transferencia',
        amountOriginal: Number(payTransferVes),
        currency: 'VES',
        bank: payTransferBank || null,
        reference: payTransferRef.trim() || null,
        notes: payNotes.trim() || null,
      });
    }
    if (Number(payVesCash) > 0) {
      paymentsList.push({
        paymentMethod: 'efectivo_ves',
        amountOriginal: Number(payVesCash),
        currency: 'VES',
        notes: payNotes.trim() || null,
      });
    }

    if (paymentsList.length === 0) {
      setPaymentFeedback({
        type: 'error',
        text: 'Ingrese al menos un monto de abono o use un botón de Cancelar Total.',
      });
      return;
    }

    setIsSubmittingPayment(true);
    setPaymentFeedback(null);
    try {
      const res = await apiFetch('/api/payments/abono', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cliente_abono',
          saleId: saleDetail.id,
          paymentsList,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar el abono');

      const wasFull = data.newStatus === 'pagada' || (data.newBalanceDueUsd ?? 0) <= 0.01;
      setPaymentFeedback({
        type: 'success',
        text: wasFull
          ? `¡Factura ${saleDetail.invoiceNumber} CANCELADA totalmente! Saldo pendiente: $0.00.`
          : `Abono registrado en ${saleDetail.invoiceNumber}. Nuevo saldo pendiente: $${Number(
              data.newBalanceDueUsd || 0
            ).toFixed(2)} (Bs. ${(Number(data.newBalanceDueUsd || 0) * rate).toLocaleString('es-VE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}).`,
      });
      resetPaymentFields();
      setShowPaymentForm(false);

      await Promise.all([loadClientSales(client.id, saleDetail.id), loadSaleDetail(saleDetail.id)]);
      onDataChanged();
    } catch (err: any) {
      setPaymentFeedback({
        type: 'error',
        text: err.message || 'Error al registrar el pago',
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!saleDetail) return;
    const saleRate = saleDetail.exchangeRate || rate;
    downloadInvoicePdf({
      invoiceNumber: saleDetail.invoiceNumber,
      date: saleDetail.date,
      paymentType: saleDetail.paymentType,
      status: saleDetail.status,
      exchangeRate: saleRate,
      clientId: client.id,
      clientName: saleDetail.clientName || client.name,
      clientIdDoc: saleDetail.clientIdDoc || client.idDoc,
      clientEmail: saleDetail.clientEmail || client.email,
      clientPhone: saleDetail.clientPhone || client.phone,
      clientAddress: saleDetail.clientAddress || client.address,
      items: (saleDetail.items || []).map((it) => ({
        code: it.productCode || String(it.productId),
        name: it.productName || 'Artículo',
        quantity: it.quantity,
        unitPriceUsd: it.unitPriceUsd,
        unitPriceVes: it.unitPriceUsd * saleRate,
        lineTotalUsd: it.subtotalUsd,
        lineTotalVes: it.subtotalUsd * saleRate,
      })),
      totalUsd: saleDetail.totalUsd,
      totalVes: saleDetail.totalVes || saleDetail.totalUsd * saleRate,
      amountPaidUsd: saleDetail.amountPaidUsd,
      balanceDueUsd: saleDetail.balanceDueUsd,
      payments: (saleDetail.payments || []).map((p) => ({
        paymentMethod: p.paymentMethod,
        amountOriginal: p.amountOriginal,
        currency: p.currency,
        bank: p.bank,
        reference: p.reference,
      })),
      notes: saleDetail.notes,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-6xl w-full shadow-2xl border border-slate-200 dark:border-[#2d3748] flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in duration-150">
        {/* Top Client Banner */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#262f3c] bg-slate-50/80 dark:bg-[#1a2029] flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {client.name}
              </h3>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-200/80 dark:bg-[#252e3d] text-slate-700 dark:text-slate-300 font-semibold">
                {client.idDoc}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${ratingMeta.cls}`}
              >
                <Award className="w-3 h-3" />
                {ratingMeta.label}
              </span>
              {client.isSuspended && (
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white">
                  SUSPENDIDO
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {client.state ? `${client.state}${client.zoneName ? ` · ${client.zoneName}` : ''}` : 'Sin zona asignada'}
              {client.phone ? ` · Tel: ${client.phone}` : ''}
              {' · '}Seleccione una factura para ver sus detalles, abonar o cancelarla.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] text-right">
              <span className="block text-[10px] uppercase font-bold text-slate-400">Deuda Total Cliente</span>
              <span
                className={`block font-mono text-sm font-black tabular-nums ${
                  client.currentBalanceUsd > 0.01
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                Bs. {(client.currentBalanceUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="block font-mono text-[10px] text-slate-500 dark:text-slate-400">
                Ref. ${client.currentBalanceUsd.toFixed(2)} · Lím. ${client.creditLimitUsd.toFixed(0)}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-[#252e3d] rounded-xl cursor-pointer transition-colors"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Split Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* LEFT COLUMN: Client Invoices List */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-[#262f3c] flex flex-col min-h-0 bg-slate-50/40 dark:bg-[#12161d]/60">
            <div className="p-3.5 border-b border-slate-200 dark:border-[#262f3c] space-y-2.5 shrink-0">
              {/* Filter Pills */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-[#1a212b] rounded-lg text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`py-1.5 px-2 rounded-md cursor-pointer transition-colors ${
                    filterMode === 'all'
                      ? 'bg-white dark:bg-[#262f3c] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Todas ({counts.all})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('pending')}
                  className={`py-1.5 px-2 rounded-md cursor-pointer transition-colors ${
                    filterMode === 'pending'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-rose-600'
                  }`}
                >
                  Crédito / Saldo ({counts.pending})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('paid')}
                  className={`py-1.5 px-2 rounded-md cursor-pointer transition-colors ${
                    filterMode === 'paid'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600'
                  }`}
                >
                  Pagadas ({counts.paid})
                </button>
              </div>

              {/* Search Invoice */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por N° de factura o fecha..."
                  value={searchInvoice}
                  onChange={(e) => setSearchInvoice(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Invoices Scrollable List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200/70 dark:divide-[#262f3c] max-h-64 lg:max-h-none">
              {isLoadingList ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                  <span>Cargando facturas del cliente...</span>
                </div>
              ) : filteredSales.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                  <Receipt className="w-8 h-8 mx-auto opacity-40" />
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    {sales.length === 0
                      ? 'Este cliente aún no tiene facturas emitidas.'
                      : 'No hay facturas que coincidan con este filtro.'}
                  </p>
                </div>
              ) : (
                filteredSales.map((sale) => {
                  const isSelected = sale.id === selectedSaleId;
                  const isUnpaid = sale.balanceDueUsd > 0.01;
                  const isOverdue = isUnpaid && sale.dueDate && sale.dueDate < todayIso;

                  return (
                    <button
                      key={sale.id}
                      type="button"
                      onClick={() => {
                        setSelectedSaleId(sale.id);
                        setPaymentFeedback(null);
                      }}
                      className={`w-full text-left p-3.5 transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'bg-emerald-50/90 dark:bg-emerald-950/35 border-l-4 border-l-emerald-600'
                          : 'hover:bg-white dark:hover:bg-[#1a212b] border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                            {sale.invoiceNumber}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              sale.paymentType === 'credito'
                                ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {sale.paymentType === 'credito' ? 'Crédito' : 'Contado'}
                          </span>
                          {isUnpaid ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                isOverdue
                                  ? 'bg-rose-600 text-white'
                                  : sale.status === 'parcial'
                                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                  : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                              }`}
                            >
                              {isOverdue ? 'Vencida' : sale.status === 'parcial' ? 'Abono Parcial' : 'Pendiente'}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                              Pagada
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Calendar className="w-3 h-3" />
                            {sale.date}
                          </span>
                          {sale.dueDate && (
                            <span className={isOverdue ? 'text-rose-600 dark:text-rose-400 font-semibold font-mono' : 'font-mono'}>
                              · Vence: {sale.dueDate}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          ${sale.totalUsd.toFixed(2)}
                        </div>
                        {isUnpaid ? (
                          <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                            Debe: ${sale.balanceDueUsd.toFixed(2)}
                          </div>
                        ) : (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                            Cancelada
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Selected Invoice Details + Abono / Cancelación */}
          <div className="lg:col-span-7 flex flex-col min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
            {paymentFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
                  paymentFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {paymentFeedback.type === 'success' ? (
                    <CheckCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{paymentFeedback.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentFeedback(null)}
                  className="opacity-70 hover:opacity-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {isLoadingDetail ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-xs text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                <span>Cargando detalle completo de la factura...</span>
              </div>
            ) : !saleDetail ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-slate-400 space-y-2">
                <Receipt className="w-10 h-10 opacity-35" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Seleccione una factura de la lista izquierda
                </p>
                <p className="text-xs max-w-sm">
                  Aquí podrá ver todos los productos facturados, historial de pagos, descargar el comprobante PDF y registrar abonos o cancelaciones totales.
                </p>
              </div>
            ) : (
              <>
                {/* Invoice Header & Actions */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-black font-mono text-slate-900 dark:text-slate-100">
                        {saleDetail.invoiceNumber}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          selectedBalanceUsd <= 0.01
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : saleDetail.status === 'parcial'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {selectedBalanceUsd <= 0.01
                          ? 'PAGADA'
                          : saleDetail.status === 'parcial'
                          ? 'ABONO PARCIAL'
                          : 'PENDIENTE DE PAGO'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span>Emisión: <strong className="font-mono text-slate-700 dark:text-slate-300">{saleDetail.date}</strong></span>
                      {saleDetail.dueDate && (
                        <span>
                          Vencimiento:{' '}
                          <strong
                            className={`font-mono ${
                              selectedBalanceUsd > 0.01 && saleDetail.dueDate < todayIso
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {saleDetail.dueDate}
                          </strong>
                        </span>
                      )}
                      <span>
                        Condición: <strong className="uppercase">{saleDetail.paymentType}</strong>
                      </span>
                      <span>
                        Tasa emisión: <strong className="font-mono">{(saleDetail.exchangeRate || rate).toFixed(2)} Bs/$</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 dark:bg-[#12161d] dark:hover:bg-[#252e3d] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      <span>PDF</span>
                    </button>

                    {selectedBalanceUsd > 0.01 && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowPaymentForm((prev) => !prev);
                          setPaymentFeedback(null);
                        }}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>{showPaymentForm ? 'Ocultar Pago' : 'Abonar / Cancelar Factura'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Financial Summary Strip */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c]">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Factura</span>
                    <span className="font-mono font-black text-sm text-slate-900 dark:text-slate-100 tabular-nums">
                      ${saleDetail.totalUsd.toFixed(2)}
                    </span>
                    <span className="block font-mono text-[10px] text-slate-500">
                      Bs. {(saleDetail.totalUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-[#15241e] border border-emerald-200 dark:border-emerald-900/50">
                    <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 block">Total Abonado</span>
                    <span className="font-mono font-black text-sm text-emerald-800 dark:text-emerald-300 tabular-nums">
                      ${saleDetail.amountPaidUsd.toFixed(2)}
                    </span>
                    <span className="block font-mono text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
                      Bs. {(saleDetail.amountPaidUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      selectedBalanceUsd > 0.01
                        ? 'bg-rose-50/80 dark:bg-[#24171d] border-rose-200 dark:border-rose-900/60'
                        : 'bg-slate-50 dark:bg-[#12161d] border-slate-200 dark:border-[#262f3c]'
                    }`}
                  >
                    <span
                      className={`text-[10px] font-bold uppercase block ${
                        selectedBalanceUsd > 0.01 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      Saldo Pendiente
                    </span>
                    <span
                      className={`font-mono font-black text-sm tabular-nums ${
                        selectedBalanceUsd > 0.01
                          ? 'text-rose-700 dark:text-rose-300'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      ${selectedBalanceUsd.toFixed(2)}
                    </span>
                    <span className="block font-mono text-[10px] text-slate-500 dark:text-slate-400">
                      Bs. {selectedBalanceVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* INLINE ABONO / CANCELAR TOTAL FORM */}
                {selectedBalanceUsd > 0.01 && showPaymentForm && (
                  <form
                    onSubmit={handleSubmitAbono}
                    className="p-4 rounded-xl bg-emerald-50/50 dark:bg-[#13201b] border-2 border-emerald-500/40 space-y-3.5 text-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Registrar Abono o Cancelación de {saleDetail.invoiceNumber}</span>
                        </h4>
                        <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                          Tasa BCV vigente: <strong>{rate.toFixed(2)} Bs/$</strong> · Saldo: <strong>${selectedBalanceUsd.toFixed(2)}</strong> (Bs. {selectedBalanceVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                        </p>
                      </div>
                    </div>

                    {/* Quick 1-click Cancelar Total buttons */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                        Cancelación Total Rápida (llena el saldo completo):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => fillFullAmountIn('usd')}
                          className="px-2.5 py-1.5 bg-white hover:bg-emerald-100 dark:bg-[#161b22] dark:hover:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-lg text-[11px] font-bold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Banknote className="w-3.5 h-3.5" />
                          <span>Cancelar Total ${selectedBalanceUsd.toFixed(2)}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fillFullAmountIn('pos')}
                          className="px-2.5 py-1.5 bg-white hover:bg-sky-100 dark:bg-[#161b22] dark:hover:bg-sky-950/60 border border-sky-300 dark:border-sky-800 rounded-lg text-[11px] font-bold text-sky-800 dark:text-sky-300 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Total POS (Bs.)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fillFullAmountIn('pagomovil')}
                          className="px-2.5 py-1.5 bg-white hover:bg-purple-100 dark:bg-[#161b22] dark:hover:bg-purple-950/60 border border-purple-300 dark:border-purple-800 rounded-lg text-[11px] font-bold text-purple-800 dark:text-purple-300 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>Total Pago Móvil</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fillFullAmountIn('transfer')}
                          className="px-2.5 py-1.5 bg-white hover:bg-indigo-100 dark:bg-[#161b22] dark:hover:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-800 rounded-lg text-[11px] font-bold text-indigo-800 dark:text-indigo-300 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          <span>Total Transferencia</span>
                        </button>
                      </div>
                    </div>

                    {/* Multi-currency Partial / Combined Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="p-2.5 rounded-lg bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#2d3748]">
                        <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Efectivo Divisas (USD $)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={payUsdCash}
                          onChange={(e) => setPayUsdCash(e.target.value)}
                          className="w-full py-1.5 px-2.5 bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded font-mono font-bold text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      <div className="p-2.5 rounded-lg bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#2d3748]">
                        <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Efectivo Bolívares (Bs.)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={payVesCash}
                          onChange={(e) => setPayVesCash(e.target.value)}
                          className="w-full py-1.5 px-2.5 bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded font-mono font-bold text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      <div className="p-2.5 rounded-lg bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#2d3748] space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300 block">
                          Punto de Venta (Bs.)
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Monto Bs."
                            value={payPosVes}
                            onChange={(e) => setPayPosVes(e.target.value)}
                            className="py-1.5 px-2 bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded font-mono text-slate-900 dark:text-slate-100"
                          />
                          <input
                            type="text"
                            placeholder="Ref. / Lote"
                            value={payPosRef}
                            onChange={(e) => setPayPosRef(e.target.value)}
                            className="py-1.5 px-2 bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded font-mono text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#2d3748] space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300 block">
                          Pago Móvil (Bs.)
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Monto Bs."
                            value={payPagoMovilVes}
                            onChange={(e) => setPayPagoMovilVes(e.target.value)}
                            className="py-1.5 px-2 bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded font-mono text-slate-900 dark:text-slate-100"
                          />
                          <input
                            type="text"
                            placeholder="N° Referencia"
                            value={payPagoMovilRef}
                            onChange={(e) => setPayPagoMovilRef(e.target.value)}
                            className="py-1.5 px-2 bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded font-mono text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-2 p-2.5 rounded-lg bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#2d3748] space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300 block">
                          Transferencia Bancaria (Bs.)
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Monto Bs."
                            value={payTransferVes}
                            onChange={(e) => setPayTransferVes(e.target.value)}
                            className="py-1.5 px-2 bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded font-mono text-slate-900 dark:text-slate-100"
                          />
                          <select
                            value={payTransferBank}
                            onChange={(e) => setPayTransferBank(e.target.value)}
                            className="py-1.5 px-2 bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded text-slate-900 dark:text-slate-100"
                          >
                            <option value="Banesco">Banesco</option>
                            <option value="Banco de Venezuela">Banco de Venezuela</option>
                            <option value="Mercantil">Mercantil</option>
                            <option value="Provincial">BBVA Provincial</option>
                            <option value="BNC">BNC</option>
                            <option value="Bancamiga">Bancamiga</option>
                          </select>
                          <input
                            type="text"
                            placeholder="N° Confirmación"
                            value={payTransferRef}
                            onChange={(e) => setPayTransferRef(e.target.value)}
                            className="py-1.5 px-2 bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded font-mono text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        placeholder="Observación o nota del recibo (opcional)..."
                        value={payNotes}
                        onChange={(e) => setPayNotes(e.target.value)}
                        className="w-full py-1.5 px-3 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    {/* Live Preview & Submit */}
                    <div className="pt-2 border-t border-emerald-200 dark:border-emerald-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5 font-mono">
                        <div className="text-xs">
                          A aplicar:{' '}
                          <strong className="text-emerald-700 dark:text-emerald-400">
                            ${enteredUsdTotal.toFixed(2)}
                          </strong>{' '}
                          <span className="text-slate-500">
                            (Bs. {(enteredUsdTotal * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                          </span>
                        </div>
                        <div className="text-[11px] flex items-center gap-1.5">
                          <span>Restante:</span>
                          <strong className={remainingAfterPaymentUsd <= 0.01 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                            ${remainingAfterPaymentUsd.toFixed(2)}
                          </strong>
                          {enteredUsdTotal > 0 && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                isFullCancellation
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                              }`}
                            >
                              {isFullCancellation ? 'Cancelación Total' : 'Abono Parcial'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPaymentForm(false);
                            resetPaymentFields();
                          }}
                          className="px-3 py-2 bg-white hover:bg-slate-100 dark:bg-[#161b22] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#2d3748] rounded-lg font-semibold cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingPayment || enteredUsdTotal <= 0}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          {isSubmittingPayment ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isSubmittingPayment
                              ? 'Procesando...'
                              : isFullCancellation
                              ? 'Confirmar Cancelación Total'
                              : 'Registrar Abono'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Items Detail Table */}
                <div className="rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                    <span className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      Detalle de Artículos Facturados ({saleDetail.items?.length || 0})
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/70 dark:bg-[#1a2029] text-[10px] uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#262f3c]">
                        <tr>
                          <th className="py-2 px-3">Código</th>
                          <th className="py-2 px-3">Producto</th>
                          <th className="py-2 px-3 text-right">Cant.</th>
                          <th className="py-2 px-3 text-right">P. Unit ($)</th>
                          <th className="py-2 px-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]">
                        {!saleDetail.items || saleDetail.items.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-5 text-center text-slate-400">
                              Sin detalle de renglones registrado.
                            </td>
                          </tr>
                        ) : (
                          saleDetail.items.map((item, idx) => (
                            <tr key={item.id ?? `${item.productId}-${idx}`} className="hover:bg-slate-50/60 dark:hover:bg-[#1c222b]/50">
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                {item.productCode || `#${item.productId}`}
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                                {item.productName || 'Producto'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold">
                                {item.quantity}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                                ${item.unitPriceUsd.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                <div>${item.subtotalUsd.toFixed(2)}</div>
                                <div className="text-[10px] font-normal text-slate-400">
                                  Bs. {(item.subtotalUsd * (saleDetail.exchangeRate || rate)).toFixed(2)}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Payment & Abonos History */}
                <div className="rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-500" />
                      Historial de Pagos y Abonos ({saleDetail.payments?.length || 0})
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-[#262f3c] text-xs">
                    {!saleDetail.payments || saleDetail.payments.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 text-[11px]">
                        {selectedBalanceUsd > 0.01
                          ? 'Aún no se han registrado abonos en esta factura. Use el botón "Abonar / Cancelar Factura" arriba.'
                          : 'Factura cancelada al momento de la emisión.'}
                      </div>
                    ) : (
                      saleDetail.payments.map((p) => (
                        <div key={p.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                              <span>{formatMethodLabel(p.paymentMethod)}</span>
                              {p.bank && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#252e3d] text-slate-600 dark:text-slate-300">
                                  {p.bank}
                                </span>
                              )}
                              {p.reference && (
                                <span className="text-[10px] font-mono text-slate-500">
                                  Ref: {p.reference}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {p.createdAt ? new Date(p.createdAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : 'Registrado'}{' '}
                              {p.notes ? `· ${p.notes}` : ''}
                            </div>
                          </div>
                          <div className="text-right font-mono shrink-0">
                            <div className="font-bold text-emerald-700 dark:text-emerald-400">
                              {p.currency === 'USD'
                                ? `$${p.amountOriginal.toFixed(2)}`
                                : `Bs. ${p.amountOriginal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </div>
                            {p.currency !== 'USD' && (
                              <div className="text-[10px] text-slate-400">
                                Equiv. ${p.amountUsd.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {saleDetail.notes && (
                  <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-300">
                    <strong>Observación:</strong> {saleDetail.notes}
                  </div>
                )}

                {selectedBalanceUsd > 0.01 && !showPaymentForm && (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowPaymentForm(true)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      <span>Abonar o Cancelar esta Factura</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
