import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Landmark,
  Search,
  Filter,
  DollarSign,
  Plus,
  CheckCircle,
  Clock,
  History,
  X,
  Building2,
  PackagePlus,
  AlertCircle,
  AlertTriangle,
  CreditCard,
  RotateCcw,
  Coins,
  ArrowRight,
  Eye,
  Printer,
  FileText,
} from 'lucide-react';
import { Purchase, Supplier, Product, Payment, ExchangeRate, PaymentMethod } from '../types/index.ts';

interface PurchaseInvoiceItem {
  id: number;
  purchaseId: number;
  productId: number;
  productCode?: string | null;
  productUnit?: string | null;
  productName: string;
  quantity: number;
  unitCostUsd: number;
  subtotalUsd: number;
}

interface PurchaseInvoiceDetail extends Purchase {
  supplierContactPerson?: string | null;
  supplierPhone?: string | null;
  supplierAddress?: string | null;
  items: PurchaseInvoiceItem[];
  payments: Payment[];
}

interface AccountsPayableProps {
  exchangeRate: ExchangeRate | null;
  onPaymentRegistered: () => void;
}

export const AccountsPayable: React.FC<AccountsPayableProps> = ({
  exchangeRate,
  onPaymentRegistered,
}) => {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todas');
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Modal: Abono / Pago a Proveedor (Multidivisa y Métodos Múltiples)
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [amountUsdCash, setAmountUsdCash] = useState<string>('');
  const [amountPos, setAmountPos] = useState<string>('');
  const [amountTransfer, setAmountTransfer] = useState<string>('');
  const [bankTransfer, setBankTransfer] = useState<string>('');
  const [refTransfer, setRefTransfer] = useState<string>('');
  const [amountPagoMovil, setAmountPagoMovil] = useState<string>('');
  const [refPagoMovil, setRefPagoMovil] = useState<string>('');
  const [amountVesCash, setAmountVesCash] = useState<string>('');
  const [pagoNotes, setPagoNotes] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Modal: Nueva Factura de Compra (Reposición de Stock)
  const [isNewPurchaseOpen, setIsNewPurchaseOpen] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState('');
  const [newInvoiceNumber, setNewInvoiceNumber] = useState('');
  const [newPaymentType, setNewPaymentType] = useState<'contado' | 'credito'>('credito');
  const [purchaseItemsList, setPurchaseItemsList] = useState<Array<{ productId: number; quantity: number; unitCostUsd: number }>>([]);
  const [selectedProdToAdd, setSelectedProdToAdd] = useState('');
  const [prodQtyToAdd, setProdQtyToAdd] = useState('10');
  const [prodCostToAdd, setProdCostToAdd] = useState('');

  // Modal: Historial de Pagos
  const [historyPurchase, setHistoryPurchase] = useState<Purchase | null>(null);
  const [historyPayments, setHistoryPayments] = useState<Payment[]>([]);

  // Modal: Ver Factura Pendiente Completa (CxP)
  const [invoiceDetail, setInvoiceDetail] = useState<PurchaseInvoiceDetail | null>(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);

  const rate = exchangeRate?.rate || 76.5;

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [purRes, supRes, prodRes] = await Promise.all([
        apiFetch('/api/purchases'),
        apiFetch('/api/suppliers'),
        apiFetch('/api/products'),
      ]);
      if (purRes.ok) setPurchases(await purRes.json());
      if (supRes.ok) setSuppliers(await supRes.json());
      if (prodRes.ok) setProducts(await prodRes.json());
    } catch (e) {
      console.error('Error fetching purchases data', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Multi-Payment Computations for Accounts Payable
  const purchaseDebtUsd = selectedPurchase?.balanceDueUsd || 0;
  const purchaseDebtBs = purchaseDebtUsd * rate;

  const usdCashNum = Number(amountUsdCash) || 0;
  const usdCashInBs = usdCashNum * rate;

  const posNumBs = Number(amountPos) || 0;
  const transferNumBs = Number(amountTransfer) || 0;
  const pagoMovilNumBs = Number(amountPagoMovil) || 0;
  const vesCashNumBs = Number(amountVesCash) || 0;

  // Total abonado in Bolívares
  const totalAbonoBs = usdCashInBs + posNumBs + transferNumBs + pagoMovilNumBs + vesCashNumBs;
  // Total equivalent in USD
  const totalAbonoUsd = totalAbonoBs / rate;

  // Remaining debt in Bs and USD
  const remainingDebtBs = Math.max(0, purchaseDebtBs - totalAbonoBs);
  const remainingDebtUsd = Math.max(0, purchaseDebtUsd - totalAbonoUsd);

  // Overpayment check
  const isOverpaying = totalAbonoBs > purchaseDebtBs + 0.1 || totalAbonoUsd > purchaseDebtUsd + 0.05;
  const overpaidBs = Math.max(0, totalAbonoBs - purchaseDebtBs);
  const isFullPayment = Math.abs(totalAbonoBs - purchaseDebtBs) <= 0.05 && totalAbonoBs > 0;

  // Quick Action Fillers
  const fillAllInUsd = () => {
    setAmountUsdCash(purchaseDebtUsd.toFixed(2));
    setAmountPos('');
    setAmountTransfer('');
    setAmountPagoMovil('');
    setAmountVesCash('');
    setFormError('');
  };

  const fillAllInPos = () => {
    setAmountUsdCash('');
    setAmountPos(purchaseDebtBs.toFixed(2));
    setAmountTransfer('');
    setAmountPagoMovil('');
    setAmountVesCash('');
    setFormError('');
  };

  const fillAllInTransfer = () => {
    setAmountUsdCash('');
    setAmountPos('');
    setAmountTransfer(purchaseDebtBs.toFixed(2));
    setAmountPagoMovil('');
    setAmountVesCash('');
    setFormError('');
  };

  const fillAllInPagoMovil = () => {
    setAmountUsdCash('');
    setAmountPos('');
    setAmountTransfer('');
    setAmountPagoMovil(purchaseDebtBs.toFixed(2));
    setAmountVesCash('');
    setFormError('');
  };

  const fillAllInVesCash = () => {
    setAmountUsdCash('');
    setAmountPos('');
    setAmountTransfer('');
    setAmountPagoMovil('');
    setAmountVesCash(purchaseDebtBs.toFixed(2));
    setFormError('');
  };

  const clearAllAmounts = () => {
    setAmountUsdCash('');
    setAmountPos('');
    setAmountTransfer('');
    setBankTransfer('');
    setRefTransfer('');
    setAmountPagoMovil('');
    setRefPagoMovil('');
    setAmountVesCash('');
    setFormError('');
  };

  // Helper to assign remaining balance to a specific payment method
  const assignRemainingTo = (method: 'pos' | 'transfer' | 'pago_movil' | 'ves_cash') => {
    if (remainingDebtBs <= 0) return;
    const currentVal = method === 'pos' ? posNumBs
      : method === 'transfer' ? transferNumBs
      : method === 'pago_movil' ? pagoMovilNumBs
      : vesCashNumBs;
    const rem = (currentVal + remainingDebtBs).toFixed(2);
    if (method === 'pos') setAmountPos(rem);
    else if (method === 'transfer') setAmountTransfer(rem);
    else if (method === 'pago_movil') setAmountPagoMovil(rem);
    else if (method === 'ves_cash') setAmountVesCash(rem);
    setFormError('');
  };

  const openPagoModal = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setAmountUsdCash('');
    setAmountPos('');
    setAmountTransfer('');
    setBankTransfer('');
    setRefTransfer('');
    setAmountPagoMovil('');
    setRefPagoMovil('');
    setAmountVesCash('');
    setPagoNotes('');
    setFormError('');
  };

  const openHistoryModal = async (purchase: Purchase) => {
    setHistoryPurchase(purchase);
    try {
      const res = await apiFetch(`/api/payments?purchaseId=${purchase.id}`);
      if (res.ok) {
        setHistoryPayments(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const openInvoiceDetailModal = async (purchase: Purchase) => {
    setIsLoadingInvoice(true);
    setInvoiceDetail({
      ...purchase,
      items: [],
      payments: [],
    });
    try {
      const res = await apiFetch(`/api/purchases/${purchase.id}`);
      if (res.ok) {
        const detail: PurchaseInvoiceDetail = await res.json();
        setInvoiceDetail(detail);
      }
    } catch (e) {
      console.error('Error loading purchase invoice detail', e);
    } finally {
      setIsLoadingInvoice(false);
    }
  };

  const handleRegisterPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchase) return;

    if (totalAbonoBs <= 0) {
      setFormError('Debe ingresar al menos un monto de abono mayor a 0 Bs.');
      return;
    }

    if (isOverpaying) {
      setFormError(
        `El monto total ingresado (Bs. ${totalAbonoBs.toFixed(2)}) supera el saldo restante de la factura (Bs. ${purchaseDebtBs.toFixed(2)}). Ajuste los montos.`
      );
      return;
    }

    if (transferNumBs > 0 && !refTransfer.trim()) {
      setFormError('Debe ingresar el número de referencia para el pago por Transferencia Bancaria.');
      return;
    }

    if (pagoMovilNumBs > 0 && !refPagoMovil.trim()) {
      setFormError('Debe ingresar el número de referencia para el Pago Móvil.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      // Build payments list
      const paymentsList = [];

      if (usdCashNum > 0) {
        paymentsList.push({
          paymentMethod: 'efectivo_usd',
          amountOriginal: usdCashNum,
          currency: 'USD',
          notes: 'Efectivo Divisas ($)',
        });
      }

      if (posNumBs > 0) {
        paymentsList.push({
          paymentMethod: 'punto_venta',
          amountOriginal: posNumBs,
          currency: 'VES',
          notes: 'Punto de Venta',
        });
      }

      if (transferNumBs > 0) {
        paymentsList.push({
          paymentMethod: 'transferencia',
          amountOriginal: transferNumBs,
          currency: 'VES',
          bank: bankTransfer.trim() || null,
          reference: refTransfer.trim(),
          notes: 'Transferencia Bancaria',
        });
      }

      if (pagoMovilNumBs > 0) {
        paymentsList.push({
          paymentMethod: 'pago_movil',
          amountOriginal: pagoMovilNumBs,
          currency: 'VES',
          reference: refPagoMovil.trim(),
          notes: 'Pago Móvil',
        });
      }

      if (vesCashNumBs > 0) {
        paymentsList.push({
          paymentMethod: 'efectivo_ves',
          amountOriginal: vesCashNumBs,
          currency: 'VES',
          notes: 'Efectivo Bolívares',
        });
      }

      const res = await apiFetch('/api/payments/abono', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'proveedor_pago',
          purchaseId: selectedPurchase.id,
          paymentsList,
          notes: pagoNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al procesar el pago a proveedor');
      }

      setSelectedPurchase(null);
      setSuccessMsg('¡Pago a proveedor registrado exitosamente!');
      setTimeout(() => setSuccessMsg(''), 5000);
      loadData();
      onPaymentRegistered();
    } catch (err: any) {
      setFormError(err.message || 'Error en el servidor');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddItemToPurchase = () => {
    if (!selectedProdToAdd) return;
    const prod = products.find((p) => p.id === Number(selectedProdToAdd));
    if (!prod) return;

    const qty = Number(prodQtyToAdd) || 1;
    const cost = Number(prodCostToAdd) || prod.costUsd;

    setPurchaseItemsList((prev) => [
      ...prev,
      { productId: prod.id, quantity: qty, unitCostUsd: cost },
    ]);
    setSelectedProdToAdd('');
    setProdQtyToAdd('10');
    setProdCostToAdd('');
  };

  // Real-time automatic duplicate & similar purchase invoice detection
  const duplicatePurchaseInvoice = useMemo(() => {
    const inv = newInvoiceNumber.trim().toLowerCase();
    if (!inv || !newSupplierId) return null;
    return (
      purchases.find(
        (p) =>
          p.supplierId === Number(newSupplierId) &&
          p.invoiceNumber.trim().toLowerCase() === inv
      ) || null
    );
  }, [newInvoiceNumber, newSupplierId, purchases]);

  const similarPurchaseInvoices = useMemo(() => {
    const inv = newInvoiceNumber.trim().toLowerCase();
    if (inv.length < 2) return [];
    return purchases
      .filter((p) => {
        const matchInv = p.invoiceNumber.toLowerCase().includes(inv);
        const matchSup = !newSupplierId || p.supplierId === Number(newSupplierId);
        return matchInv && matchSup;
      })
      .slice(0, 4);
  }, [newInvoiceNumber, newSupplierId, purchases]);

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierId || !newInvoiceNumber.trim() || purchaseItemsList.length === 0) {
      setFormError('Proveedor, número de factura y al menos un producto son obligatorios.');
      return;
    }

    if (duplicatePurchaseInvoice) {
      setFormError(
        `La factura "${newInvoiceNumber.trim()}" ya fue registrada para este proveedor el ${duplicatePurchaseInvoice.date}. No se permiten facturas duplicadas.`
      );
      return;
    }

    try {
      const res = await apiFetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: Number(newSupplierId),
          invoiceNumber: newInvoiceNumber.trim(),
          paymentType: newPaymentType,
          items: purchaseItemsList,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al guardar la compra');
      }

      setIsNewPurchaseOpen(false);
      setNewInvoiceNumber('');
      setPurchaseItemsList([]);
      setSuccessMsg('¡Orden de compra registrada y existencias cargadas al inventario!');
      setTimeout(() => setSuccessMsg(''), 5000);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Error al registrar compra');
    }
  };

  const totalOutstandingCxpUsd = purchases.reduce((sum, p) => sum + p.balanceDueUsd, 0);

  const filteredPurchases = purchases.filter((p) => {
    const matchesSearch =
      p.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.supplierName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'todas' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner with Soft Dark Mode */}
      <div className="bg-white dark:bg-[#161b22] p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Cuentas por Pagar (CxP a Proveedores)
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 dark:border dark:border-rose-800/60 font-semibold font-mono">
              Obligaciones con Proveedores
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Control de facturas comerciales, reposición de inventario y registro de abonos parciales o totales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="p-3.5 bg-rose-50 dark:bg-[#23191d] rounded-xl border border-rose-200 dark:border-rose-900/60 text-right shrink-0">
            <span className="text-xs font-medium text-rose-800 dark:text-rose-400 block">Total Deuda Pendiente a Proveedores:</span>
            <span className="text-xl font-bold text-rose-950 dark:text-rose-300 font-mono tabular-nums block">
              Bs. {(totalOutstandingCxpUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-rose-700 dark:text-rose-400/80 font-mono tabular-nums">
              Ref. ${totalOutstandingCxpUsd.toFixed(2)} USD
            </span>
          </div>

          <button
            onClick={() => {
              setNewSupplierId(suppliers[0]?.id ? String(suppliers[0].id) : '');
              setNewInvoiceNumber('');
              setPurchaseItemsList([]);
              setFormError('');
              setIsNewPurchaseOpen(true);
            }}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <PackagePlus className="w-4 h-4" />
            <span>Registrar Compra / Factura Proveedor</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#161b22] p-4 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between transition-colors">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por proveedor o N° de factura (ej. Polar, Heinz, PROV-001)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-600 dark:focus:border-emerald-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-hidden cursor-pointer"
          >
            <option value="todas">Todos los estados</option>
            <option value="pendiente">Solo Pendientes</option>
            <option value="parcial">Solo Parciales (Con abonos)</option>
            <option value="pagada">Solo Pagadas</option>
          </select>
        </div>
      </div>

      {/* Purchases Table */}
      <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1f2530] border-b border-slate-200 dark:border-[#262f3c] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Factura N°</th>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Proveedor</th>
                <th className="py-3 px-4 text-right">Monto Total (Bs.)</th>
                <th className="py-3 px-4 text-right">Abonado (Bs.)</th>
                <th className="py-3 px-4 text-right">Saldo Por Pagar (Bs.)</th>
                <th className="py-3 px-4 text-right">Saldo Ref. ($)</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No hay facturas de proveedores registradas.
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((purchase) => {
                  const isPaid = purchase.status === 'pagada' || purchase.balanceDueUsd <= 0.01;
                  const isPartial = purchase.status === 'parcial' && purchase.balanceDueUsd > 0.01;

                  return (
                    <tr key={purchase.id} className="hover:bg-slate-50/80 dark:hover:bg-[#1f2530] transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                        <button
                          type="button"
                          onClick={() => openInvoiceDetailModal(purchase)}
                          className="hover:text-rose-600 dark:hover:text-rose-400 hover:underline cursor-pointer text-left"
                          title="Ver detalle completo de la factura de compra"
                        >
                          {purchase.invoiceNumber}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono">{purchase.date}</td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                        <span>{purchase.supplierName}</span>
                        {purchase.supplierIdDoc && (
                          <span className="block text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                            {purchase.supplierIdDoc}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 font-semibold">
                        Bs. {(purchase.totalUsd * rate).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                        Bs. {(purchase.amountPaidUsd * rate).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-rose-700 dark:text-rose-400 text-sm">
                        Bs. {(purchase.balanceDueUsd * rate).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        ${purchase.balanceDueUsd.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isPaid ? (
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                            PAGADA
                          </span>
                        ) : isPartial ? (
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                            ABONO PARCIAL
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                            PENDIENTE
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openInvoiceDetailModal(purchase)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-[#1f2530] dark:hover:bg-[#2a3342] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#2d3748] rounded font-medium text-[11px] transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            title="Ver factura pendiente del proveedor"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Ver Factura</span>
                          </button>

                          {!isPaid ? (
                            <button
                              onClick={() => openPagoModal(purchase)}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500 text-white rounded font-medium text-[11px] transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <DollarSign className="w-3 h-3" />
                              <span>Pagar</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium px-1">Liquidada</span>
                          )}

                          <button
                            onClick={() => openHistoryModal(purchase)}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1f2530] rounded transition-colors cursor-pointer"
                            title="Ver Historial de Pagos"
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

      {/* MODAL: Registrar Pago a Proveedor (Pantalla Resumida dentro de una misma vista) */}
      {selectedPurchase && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-2xl w-full p-4 sm:p-5 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative my-auto max-h-[94vh] flex flex-col justify-between animate-in fade-in duration-150">
            <button
              onClick={() => setSelectedPurchase(null)}
              className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="mb-2.5 pr-8">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Landmark className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  <span>Abonar a Factura de Compra (CxP)</span>
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-slate-100 dark:bg-[#202734] text-slate-700 dark:text-slate-300">
                  {selectedPurchase.invoiceNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Proveedor: <strong className="text-slate-800 dark:text-slate-200">{selectedPurchase.supplierName}</strong>
                {selectedPurchase.supplierIdDoc ? ` (${selectedPurchase.supplierIdDoc})` : ''}
              </p>
            </div>

            {/* Prominent Remaining Debt Banner - Big Bold Number */}
            <div className="mb-3 p-3 bg-rose-50/80 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
              <div>
                <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider block">
                  Monto Restante de la Factura:
                </span>
                <div className="text-2xl sm:text-3xl font-extrabold text-rose-700 dark:text-rose-400 font-mono tracking-tight">
                  Bs. {purchaseDebtBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-left sm:text-right font-mono border-t sm:border-t-0 pt-1.5 sm:pt-0 border-rose-200 dark:border-rose-900/60">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Ref. ${purchaseDebtUsd.toFixed(2)} USD
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tasa Oficial BCV: <span className="font-semibold text-rose-700 dark:text-rose-400">{rate.toFixed(2)} Bs/$</span>
                </div>
              </div>
            </div>

            {/* Quick Fill Shortcuts Bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Asignación rápida de saldo:
                </span>
                <button
                  type="button"
                  onClick={clearAllAmounts}
                  className="text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Limpiar montos</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={fillAllInUsd}
                  className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded font-medium cursor-pointer transition-colors"
                >
                  Todo en Dólares ($)
                </button>
                <button
                  type="button"
                  onClick={fillAllInPos}
                  className="px-2 py-0.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900/60 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800 rounded font-medium cursor-pointer transition-colors"
                >
                  Todo en Punto de Venta
                </button>
                <button
                  type="button"
                  onClick={fillAllInTransfer}
                  className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 rounded font-medium cursor-pointer transition-colors"
                >
                  Todo en Transferencia
                </button>
                <button
                  type="button"
                  onClick={fillAllInPagoMovil}
                  className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 rounded font-medium cursor-pointer transition-colors"
                >
                  Todo en Pago Móvil
                </button>
                <button
                  type="button"
                  onClick={fillAllInVesCash}
                  className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded font-medium cursor-pointer transition-colors"
                >
                  Todo en Efectivo Bs.
                </button>
              </div>
            </div>

            {formError && (
              <div className="mb-2.5 p-2 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-900 rounded-lg text-xs text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Compact Form Grid */}
            <form onSubmit={handleRegisterPago} className="space-y-2.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Column 1 */}
                <div className="space-y-2">
                  {/* 1. Dólares en Efectivo */}
                  <div className="p-2 bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Dólares en Efectivo ($ USD)</span>
                      </label>
                      {usdCashNum > 0 && (
                        <span className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          = Bs. {usdCashInBs.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 font-bold text-slate-400 text-xs">$</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={amountUsdCash}
                        onChange={(e) => setAmountUsdCash(e.target.value)}
                        className="w-full pl-6 pr-3 py-1 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-rose-600"
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Multiplica por la tasa oficial BCV ({rate.toFixed(2)} Bs/$)
                    </div>
                  </div>

                  {/* 2. Punto de Venta */}
                  <div className="p-2 bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        <span>Punto de Venta (Bs.)</span>
                      </label>
                      {remainingDebtBs > 0.05 && (
                        <button
                          type="button"
                          onClick={() => assignRemainingTo('pos')}
                          className="text-[10px] font-bold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-950/60 hover:bg-sky-200 dark:hover:bg-sky-900 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                        >
                          Asignar Resto (Bs. {remainingDebtBs.toFixed(2)})
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 font-bold text-slate-400 text-xs">Bs.</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={amountPos}
                        onChange={(e) => setAmountPos(e.target.value)}
                        className="w-full pl-8 pr-3 py-1 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-rose-600"
                      />
                    </div>
                  </div>

                  {/* 3. Bolívares en Efectivo */}
                  <div className="p-2 bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Efectivo Bolívares (Bs.)</span>
                      </label>
                      {remainingDebtBs > 0.05 && (
                        <button
                          type="button"
                          onClick={() => assignRemainingTo('ves_cash')}
                          className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                        >
                          Asignar Resto
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 font-bold text-slate-400 text-xs">Bs.</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={amountVesCash}
                        onChange={(e) => setAmountVesCash(e.target.value)}
                        className="w-full pl-8 pr-3 py-1 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-rose-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Column 2 */}
                <div className="space-y-2">
                  {/* 4. Transferencia Bancaria */}
                  <div className="p-2 bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <Landmark className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Transferencia Bancaria (Bs.)</span>
                      </label>
                      {remainingDebtBs > 0.05 && (
                        <button
                          type="button"
                          onClick={() => assignRemainingTo('transfer')}
                          className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/60 hover:bg-indigo-200 dark:hover:bg-indigo-900 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                        >
                          Asignar Resto
                        </button>
                      )}
                    </div>
                    <div className="relative mb-1.5">
                      <span className="absolute left-2.5 top-1.5 font-bold text-slate-400 text-xs">Bs.</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={amountTransfer}
                        onChange={(e) => setAmountTransfer(e.target.value)}
                        className="w-full pl-8 pr-3 py-1 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-rose-600"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        placeholder="Banco (ej. Banesco)"
                        value={bankTransfer}
                        onChange={(e) => setBankTransfer(e.target.value)}
                        className="py-1 px-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded text-[11px] text-slate-900 dark:text-slate-100 focus:outline-hidden"
                      />
                      <input
                        type="text"
                        placeholder="N° Referencia *"
                        value={refTransfer}
                        onChange={(e) => setRefTransfer(e.target.value)}
                        className="py-1 px-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded text-[11px] font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* 5. Pago Móvil */}
                  <div className="p-2 bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        <span>Pago Móvil (Bs.)</span>
                      </label>
                      {remainingDebtBs > 0.05 && (
                        <button
                          type="button"
                          onClick={() => assignRemainingTo('pago_movil')}
                          className="text-[10px] font-bold text-purple-800 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 dark:hover:bg-purple-900 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                        >
                          Asignar Resto
                        </button>
                      )}
                    </div>
                    <div className="relative mb-1.5">
                      <span className="absolute left-2.5 top-1.5 font-bold text-slate-400 text-xs">Bs.</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={amountPagoMovil}
                        onChange={(e) => setAmountPagoMovil(e.target.value)}
                        className="w-full pl-8 pr-3 py-1 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-rose-600"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="N° Referencia Pago Móvil *"
                      value={refPagoMovil}
                      onChange={(e) => setRefPagoMovil(e.target.value)}
                      className="w-full py-1 px-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded text-[11px] font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden"
                    />
                  </div>

                  {/* Notas */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-0.5">
                      Notas / Detalle de Pago:
                    </label>
                    <input
                      type="text"
                      placeholder="Observaciones adicionales..."
                      value={pagoNotes}
                      onChange={(e) => setPagoNotes(e.target.value)}
                      className="w-full py-1 px-2.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Live Status & Balance Bar */}
              <div className="pt-1">
                {isOverpaying ? (
                  <div className="p-2.5 bg-rose-100 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-900 dark:text-rose-200 font-semibold flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                    <div>
                      <span>⚠️ Advertencia: El monto total ingresado (Bs. {totalAbonoBs.toFixed(2)}) supera el saldo deudor de la factura por Bs. {overpaidBs.toFixed(2)}. Por favor ajuste los pagos.</span>
                    </div>
                  </div>
                ) : isFullPayment ? (
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 font-semibold flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Liquidación Total: Factura cubierta al 100% (Saldo restante: Bs. 0,00).</span>
                    </div>
                    <span className="font-mono font-bold text-emerald-800 dark:text-emerald-300">
                      Total: Bs. {totalAbonoBs.toFixed(2)}
                    </span>
                  </div>
                ) : totalAbonoBs > 0 ? (
                  <div className="p-2.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 rounded-xl text-xs text-sky-900 dark:text-sky-200 font-semibold flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                      <span>Abono Parcial: Restará por liquidar <strong>Bs. {remainingDebtBs.toFixed(2)}</strong> (Ref. ${remainingDebtUsd.toFixed(2)} USD).</span>
                    </div>
                    <span className="font-mono font-bold text-sky-800 dark:text-sky-300">
                      Abono: Bs. {totalAbonoBs.toFixed(2)}
                    </span>
                  </div>
                ) : (
                  <div className="p-2 bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] rounded-xl text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Ingrese los montos en los métodos de pago deseados.</span>
                    <span className="font-mono">Resta: Bs. {purchaseDebtBs.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPurchase(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1e2531] dark:hover:bg-[#252e3d] text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isOverpaying || totalAbonoBs <= 0}
                  className={`flex-1 py-2 rounded-xl font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    isOverpaying
                      ? 'bg-rose-300 text-rose-800 cursor-not-allowed opacity-75'
                      : totalAbonoBs <= 0
                      ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                      : isFullPayment
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      : 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Registrando...'
                      : isOverpaying
                      ? '⚠️ Monto Excede Deuda'
                      : totalAbonoBs <= 0
                      ? 'Ingrese Monto a Pagar'
                      : isFullPayment
                      ? `Confirmar Pago Total (Bs. ${totalAbonoBs.toFixed(2)})`
                      : `Confirmar Abono Parcial (Bs. ${totalAbonoBs.toFixed(2)})`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Nueva Compra / Reposición de Inventario */}
      {isNewPurchaseOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsNewPurchaseOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Registrar Compra a Proveedor</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Ingreso de mercancía que repone automáticamente el stock de inventario.
            </p>

            {formError && (
              <div className="mb-4 p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded text-xs text-rose-700 dark:text-rose-300 font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreatePurchase} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Proveedor *</label>
                  <select
                    value={newSupplierId}
                    onChange={(e) => setNewSupplierId(e.target.value)}
                    className="w-full py-1.5 px-3 bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden"
                    required
                  >
                    <option value="">Seleccione proveedor</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.idDoc})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">N° Factura Proveedor *</label>
                  <input
                    type="text"
                    placeholder="ej. FAC-POLAR-1092"
                    value={newInvoiceNumber}
                    onChange={(e) => setNewInvoiceNumber(e.target.value)}
                    className={`w-full py-1.5 px-3 bg-white dark:bg-[#1c222b] border rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden font-mono ${
                      duplicatePurchaseInvoice
                        ? 'border-rose-500 ring-1 ring-rose-500/40'
                        : 'border-slate-200 dark:border-[#2d3748] focus:border-emerald-600'
                    }`}
                    required
                  />
                </div>
              </div>

              {/* Automatic Duplicate / Similar Purchase Invoice Check */}
              {duplicatePurchaseInvoice && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 rounded-xl text-rose-900 dark:text-rose-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-[11px]">
                    <span className="font-bold block">¡Factura ya registrada para este proveedor!</span>
                    <span>
                      N° <strong className="font-mono">{duplicatePurchaseInvoice.invoiceNumber}</strong> registrada el{' '}
                      <strong>{duplicatePurchaseInvoice.date}</strong> por{' '}
                      <strong>Bs. {(duplicatePurchaseInvoice.totalUsd * rate).toFixed(2)}</strong>. No se permiten facturas duplicadas.
                    </span>
                  </div>
                </div>
              )}

              {!duplicatePurchaseInvoice && similarPurchaseInvoices.length > 0 && (
                <div className="p-2 bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] rounded-lg space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Search className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span>Facturas existentes semejantes ({similarPurchaseInvoices.length}):</span>
                  </span>
                  {similarPurchaseInvoices.map((p) => (
                    <div key={p.id} className="flex justify-between text-[11px] font-mono text-slate-700 dark:text-slate-300">
                      <span>{p.invoiceNumber} · {p.supplierName}</span>
                      <span>{p.date} · Bs. {(p.totalUsd * rate).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Condición de Pago:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPaymentType('credito')}
                    className={`py-1.5 px-2 rounded-lg border font-semibold cursor-pointer ${
                      newPaymentType === 'credito'
                        ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-400 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                        : 'bg-white dark:bg-[#1c222b] border-slate-200 dark:border-[#2d3748] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Crédito (Añadir a CxP)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPaymentType('contado')}
                    className={`py-1.5 px-2 rounded-lg border font-semibold cursor-pointer ${
                      newPaymentType === 'contado'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                        : 'bg-white dark:bg-[#1c222b] border-slate-200 dark:border-[#2d3748] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Contado (Pagada)
                  </button>
                </div>
              </div>

              {/* Add item to purchase section */}
              <div className="p-3 bg-slate-50 dark:bg-[#1a212b] rounded-lg border border-slate-200 dark:border-[#2d3748] space-y-2">
                <span className="font-bold text-slate-800 dark:text-slate-200 block">Agregar Producto a Recibir:</span>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6">
                    <select
                      value={selectedProdToAdd}
                      onChange={(e) => {
                        setSelectedProdToAdd(e.target.value);
                        const p = products.find((prod) => prod.id === Number(e.target.value));
                        if (p) setProdCostToAdd(String(p.costUsd));
                      }}
                      className="w-full py-1.5 px-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Seleccione Producto...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-3">
                    <input
                      type="number"
                      placeholder="Cant."
                      value={prodQtyToAdd}
                      onChange={(e) => setProdQtyToAdd(e.target.value)}
                      className="w-full py-1.5 px-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded text-xs font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="col-span-3">
                    <button
                      type="button"
                      onClick={handleAddItemToPurchase}
                      className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded font-semibold text-xs cursor-pointer"
                    >
                      Agregar
                    </button>
                  </div>
                </div>

                {/* Items in purchase list */}
                {purchaseItemsList.length > 0 && (
                  <div className="pt-2 divide-y divide-slate-200 dark:divide-[#2d3748] text-[11px] font-mono">
                    {purchaseItemsList.map((item, idx) => {
                      const p = products.find((prod) => prod.id === item.productId);
                      return (
                        <div key={idx} className="py-1 flex justify-between text-slate-700 dark:text-slate-300">
                          <span>
                            {item.quantity}x {p?.name}
                          </span>
                          <span>${(item.quantity * item.unitCostUsd).toFixed(2)} USD</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewPurchaseOpen(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1e2531] dark:hover:bg-[#252e3d] text-slate-700 dark:text-slate-300 rounded-lg font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={purchaseItemsList.length === 0 || Boolean(duplicatePurchaseInvoice)}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold disabled:bg-slate-300 dark:disabled:bg-slate-800 cursor-pointer"
                >
                  {duplicatePurchaseInvoice ? 'Factura ya Registrada' : 'Confirmar y Cargar Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Historial de Pagos Proveedor */}
      {historyPurchase && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative">
            <button
              onClick={() => setHistoryPurchase(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-1">
              <History className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              <span>Historial de Pagos a Proveedor</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-4">
              Factura {historyPurchase.invoiceNumber} · {historyPurchase.supplierName}
            </p>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-[#262f3c] text-xs">
              {historyPayments.length === 0 ? (
                <p className="text-center py-6 text-slate-400">
                  Esta factura aún no registra ningún pago o abono.
                </p>
              ) : (
                historyPayments.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {p.paymentMethod.replace('_', ' ').toUpperCase()} {p.bank ? `(${p.bank})` : ''}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        Ref: {p.reference || 'S/R'} · Tasa: {p.exchangeRate.toFixed(2)} Bs/$
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <span className="font-bold text-rose-700 dark:text-rose-400 text-sm block">
                        -${p.amountUsd.toFixed(2)} USD
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                        {p.amountOriginal.toLocaleString()} {p.currency}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[#262f3c] flex justify-between items-center text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Saldo Por Pagar:</span>{' '}
                <span className="font-bold text-rose-700 dark:text-rose-400 font-mono">
                  ${historyPurchase.balanceDueUsd.toFixed(2)} USD (Bs. {(historyPurchase.balanceDueUsd * rate).toFixed(2)})
                </span>
              </div>
              <button
                onClick={() => setHistoryPurchase(null)}
                className="py-1.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-[#1e2531] dark:hover:bg-[#252e3d] text-slate-700 dark:text-slate-300 rounded-lg font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ver Factura Pendiente de Proveedor Completa (CxP) */}
      {invoiceDetail && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative my-auto max-h-[92vh] overflow-y-auto animate-in fade-in duration-150">
            <button
              onClick={() => setInvoiceDetail(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer print:hidden"
              title="Cerrar factura"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Encabezado de Factura Proveedor */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-[#262f3c] pr-8">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Factura Proveedor {invoiceDetail.invoiceNumber}
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
                  Cuenta por Pagar · Recepción de Mercancía e Inventario
                </p>
              </div>
              <div className="text-left sm:text-right text-xs font-mono text-slate-600 dark:text-slate-400">
                <div>Fecha: <strong className="text-slate-900 dark:text-slate-100">{invoiceDetail.date}</strong></div>
                <div>Condición: <strong className="uppercase text-slate-900 dark:text-slate-100">{invoiceDetail.paymentType}</strong></div>
                <div>Tasa BCV actual: <strong className="text-rose-700 dark:text-rose-400">{rate.toFixed(2)} Bs/$</strong></div>
              </div>
            </div>

            {/* Datos del Proveedor */}
            <div className="my-3 p-3 bg-slate-50 dark:bg-[#1c222b] rounded-xl border border-slate-200 dark:border-[#2d3748] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Proveedor:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">{invoiceDetail.supplierName}</span>
                {invoiceDetail.supplierIdDoc && (
                  <span className="block font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    RIF: {invoiceDetail.supplierIdDoc}
                  </span>
                )}
              </div>
              <div className="sm:text-right">
                {invoiceDetail.supplierContactPerson && (
                  <div className="text-slate-700 dark:text-slate-300">Contacto: {invoiceDetail.supplierContactPerson}</div>
                )}
                {invoiceDetail.supplierPhone && (
                  <div className="text-slate-600 dark:text-slate-300 font-mono">Tel: {invoiceDetail.supplierPhone}</div>
                )}
                {invoiceDetail.supplierAddress && (
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">{invoiceDetail.supplierAddress}</div>
                )}
              </div>
            </div>

            {/* Tabla de Artículos Comprados */}
            <div className="rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden mb-3">
              <div className="px-3 py-2 bg-slate-100 dark:bg-[#1f2530] text-[11px] font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-[#262f3c]">
                Artículos Facturados por el Proveedor ({invoiceDetail.items.length})
              </div>
              <div className="overflow-x-auto max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#1a212b] text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#262f3c]">
                    <tr>
                      <th className="py-2 px-3">Código</th>
                      <th className="py-2 px-3">Producto / Artículo</th>
                      <th className="py-2 px-2 text-center">Cant.</th>
                      <th className="py-2 px-3 text-right">Costo Unit.</th>
                      <th className="py-2 px-3 text-right">Subtotal (Bs.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#222936]">
                    {isLoadingInvoice ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          Cargando artículos de la factura...
                        </td>
                      </tr>
                    ) : invoiceDetail.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          No hay artículos detallados registrados para esta factura.
                        </td>
                      </tr>
                    ) : (
                      invoiceDetail.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {item.productCode || 'SKU'}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                            {item.productName}
                          </td>
                          <td className="py-2 px-2 text-center font-mono font-bold tabular-nums">
                            {item.quantity} {item.productUnit || ''}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            Bs. {(item.unitCostUsd * rate).toFixed(2)}
                            <span className="block text-[10px] text-slate-400">${item.unitCostUsd.toFixed(2)}</span>
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
                <span className="text-[10px] font-bold text-rose-800 dark:text-rose-300 block">SALDO POR PAGAR:</span>
                <span className="text-lg font-extrabold text-rose-700 dark:text-rose-400 block">
                  Bs. {(invoiceDetail.balanceDueUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-rose-600 dark:text-rose-400">
                  Ref. ${invoiceDetail.balanceDueUsd.toFixed(2)} USD
                </span>
              </div>
            </div>

            {/* Pagos aplicados si existen */}
            {invoiceDetail.payments.length > 0 && (
              <div className="mb-3 p-3 bg-slate-50/70 dark:bg-[#1a212b] rounded-xl border border-slate-200 dark:border-[#262f3c] text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Pagos / Abonos Realizados ({invoiceDetail.payments.length}):
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
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1f2530] dark:hover:bg-[#2a3342] text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir</span>
              </button>

              {invoiceDetail.balanceDueUsd > 0.01 && (
                <button
                  type="button"
                  onClick={() => {
                    const target = invoiceDetail;
                    setInvoiceDetail(null);
                    openPagoModal(target);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Pagar / Abonar Factura</span>
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
    </div>
  );
};
