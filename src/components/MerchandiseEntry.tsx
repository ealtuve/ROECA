import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  PackagePlus,
  Search,
  Building2,
  User,
  Briefcase,
  FileText,
  ClipboardList,
  Barcode,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Wallet,
  X,
  ArrowRight,
  Landmark,
  Package,
  RotateCcw,
  ExternalLink,
  Calendar,
} from 'lucide-react';
import { Supplier, Product, Category, Purchase, ExchangeRate, Zone } from '../types/index.ts';
import { VENEZUELA_STATES } from '../lib/venezuelaGeo.ts';

interface MerchandiseEntryProps {
  exchangeRate: ExchangeRate | null;
  onEntryCompleted: () => void;
  onNavigate?: (tab: string) => void;
}

interface EntryItem {
  product: Product;
  quantity: number;
  unitCostUsd: number;
  newPriceUsd: number;
}

type EntryMode = 'con_factura' | 'sin_factura';
type ManualSupplierType = 'persona_natural' | 'firma_personal' | 'empresa_manual';

const normalizeText = (str: string) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const MerchandiseEntry: React.FC<MerchandiseEntryProps> = ({
  exchangeRate,
  onEntryCompleted,
  onNavigate,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<Purchase[]>([]);

  // Main mode: Con Factura vs Sin Factura (Persona Natural / Firma Personal / Empresa con Facturación Manual)
  const [entryMode, setEntryMode] = useState<EntryMode>('con_factura');

  // Mode 1: Supplier search & invoice fields
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const supplierDropdownRef = useRef<HTMLDivElement>(null);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentType, setPaymentType] = useState<'credito' | 'contado'>('credito');
  const [notes, setNotes] = useState('');

  // Mode 2: Sin Factura / Facturación Manual supplier details
  const [manualSupplierType, setManualSupplierType] = useState<ManualSupplierType>('persona_natural');
  const [manualIdDoc, setManualIdDoc] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualContact, setManualContact] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [manualState, setManualState] = useState('Mérida');
  const [manualZoneId, setManualZoneId] = useState('');
  const [manualDocRef, setManualDocRef] = useState('');
  const [linkedManualSupplier, setLinkedManualSupplier] = useState<Supplier | null>(null);

  // Optional initial partial payment (when credit) or payment method (when cash)
  const [initialPayAmount, setInitialPayAmount] = useState('');
  const [initialPayCurrency, setInitialPayCurrency] = useState<'VES' | 'USD'>('VES');
  const [initialPayMethod, setInitialPayMethod] = useState<
    'transferencia' | 'pago_movil' | 'efectivo_usd' | 'efectivo_ves' | 'punto_de_venta'
  >('transferencia');
  const [initialPayBank, setInitialPayBank] = useState('Banesco');
  const [initialPayRef, setInitialPayRef] = useState('');

  // Step 3: Products search & receiving list
  const [productSearch, setProductSearch] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<EntryItem[]>([]);

  // Feedback & Submit
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [completedEntry, setCompletedEntry] = useState<any | null>(null);

  // Quick Modal: Nuevo Proveedor (with automatic duplicate check)
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupIdDoc, setNewSupIdDoc] = useState('');
  const [newSupName, setNewSupName] = useState('');
  const [newSupContact, setNewSupContact] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupAddress, setNewSupAddress] = useState('');
  const [newSupState, setNewSupState] = useState('Mérida');
  const [newSupZoneId, setNewSupZoneId] = useState('');
  const [addSupError, setAddSupError] = useState('');

  // Quick Modal: Nuevo Producto (with automatic duplicate check)
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProdCode, setNewProdCode] = useState('');
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategoryId, setNewProdCategoryId] = useState('');
  const [newProdUnit, setNewProdUnit] = useState('unidad');
  const [newProdCostUsd, setNewProdCostUsd] = useState('');
  const [newProdPriceUsd, setNewProdPriceUsd] = useState('');
  const [newProdMinStock, setNewProdMinStock] = useState('10');
  const [addProdError, setAddProdError] = useState('');

  const rate = exchangeRate?.rate || 76.5;

  const loadData = async () => {
    try {
      const [supRes, prodRes, catRes, purRes, zoneRes] = await Promise.all([
        apiFetch('/api/suppliers'),
        apiFetch('/api/products'),
        apiFetch('/api/categories'),
        apiFetch('/api/purchases'),
        apiFetch('/api/zones'),
      ]);
      if (supRes.ok) setSuppliers(await supRes.json());
      if (prodRes.ok) setProducts(await prodRes.json());
      if (catRes.ok) {
        const cats: Category[] = await catRes.json();
        setCategories(cats);
        if (cats.length > 0 && !newProdCategoryId) {
          setNewProdCategoryId(String(cats[0].id));
        }
      }
      if (purRes.ok) setRecentPurchases(await purRes.json());
      if (zoneRes.ok) setZones(await zoneRes.json());
    } catch (err) {
      console.error('Error loading merchandise entry data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target as Node)) {
        setIsSupplierDropdownOpen(false);
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Supplier autocomplete for Mode 1
  const matchingSuppliers = useMemo(() => {
    const q = normalizeText(supplierSearch);
    if (!q) return suppliers.slice(0, 8);
    return suppliers.filter(
      (s) =>
        normalizeText(s.name).includes(q) ||
        normalizeText(s.idDoc).includes(q) ||
        (s.phone ? normalizeText(s.phone).includes(q) : false)
    );
  }, [suppliers, supplierSearch]);

  // Live duplicate check for invoice number on selected supplier
  const duplicateInvoiceWarning = useMemo(() => {
    const inv = normalizeText(invoiceNumber);
    if (entryMode !== 'con_factura' || !selectedSupplier || inv.length < 2) return null;
    return (
      recentPurchases.find(
        (p) => p.supplierId === selectedSupplier.id && normalizeText(p.invoiceNumber) === inv
      ) || null
    );
  }, [entryMode, selectedSupplier, invoiceNumber, recentPurchases]);

  // Live duplicate check for Mode 2 (Sin Factura) supplier fields
  const matchingManualSuppliers = useMemo(() => {
    if (linkedManualSupplier) return [];
    const qDoc = normalizeText(manualIdDoc);
    const qName = normalizeText(manualName);
    if (qDoc.length < 2 && qName.length < 2) return [];
    return suppliers
      .filter(
        (s) =>
          (qDoc.length >= 2 && normalizeText(s.idDoc).includes(qDoc)) ||
          (qName.length >= 2 && normalizeText(s.name).includes(qName))
      )
      .slice(0, 4);
  }, [manualIdDoc, manualName, suppliers, linkedManualSupplier]);

  // Live duplicate check inside Quick Add Supplier modal
  const duplicateQuickSupByDoc = useMemo(() => {
    const q = normalizeText(newSupIdDoc);
    if (!q) return null;
    return suppliers.find((s) => normalizeText(s.idDoc) === q) || null;
  }, [newSupIdDoc, suppliers]);

  const duplicateQuickSupByName = useMemo(() => {
    const q = normalizeText(newSupName);
    if (!q) return null;
    return suppliers.find((s) => normalizeText(s.name) === q) || null;
  }, [newSupName, suppliers]);

  // Live duplicate check inside Quick Add Product modal
  const duplicateQuickProdByCode = useMemo(() => {
    const q = normalizeText(newProdCode);
    if (!q) return null;
    return products.find((p) => normalizeText(p.code) === q) || null;
  }, [newProdCode, products]);

  const duplicateQuickProdByName = useMemo(() => {
    const q = normalizeText(newProdName);
    if (!q) return null;
    return products.find((p) => normalizeText(p.name) === q) || null;
  }, [newProdName, products]);

  const similarQuickProducts = useMemo(() => {
    const qCode = normalizeText(newProdCode);
    const qName = normalizeText(newProdName);
    if (qCode.length < 2 && qName.length < 2) return [];
    return products
      .filter(
        (p) =>
          (qCode.length >= 2 && normalizeText(p.code).includes(qCode)) ||
          (qName.length >= 2 && normalizeText(p.name).includes(qName))
      )
      .slice(0, 4);
  }, [newProdCode, newProdName, products]);

  // Product search filter
  const filteredProducts = useMemo(() => {
    const q = normalizeText(productSearch);
    if (!q) return products.slice(0, 12);
    const exact: Product[] = [];
    const rest: Product[] = [];
    for (const p of products) {
      const code = normalizeText(p.code);
      const name = normalizeText(p.name);
      if (code === q) exact.push(p);
      else if (code.includes(q) || name.includes(q)) rest.push(p);
    }
    return [...exact, ...rest];
  }, [products, productSearch]);

  const addProductToList = (product: Product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          unitCostUsd: product.costUsd > 0 ? product.costUsd : Math.round(product.priceUsd * 0.75 * 100) / 100,
          newPriceUsd: product.priceUsd,
        },
      ];
    });
    setProductSearch('');
    setIsProductDropdownOpen(false);
    setErrorMsg('');
    setTimeout(() => {
      productSearchRef.current?.focus();
    }, 30);
  };

  const handleProductSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts.length > 0) {
        addProductToList(filteredProducts[0]);
      }
    }
  };

  const updateItemQty = (productId: number, qty: number) => {
    if (isNaN(qty) || qty < 0) return;
    setItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i))
    );
  };

  const stepItemQty = (productId: number, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) => {
          if (i.product.id === productId) {
            const next = Math.max(0, Math.round((i.quantity + delta) * 100) / 100);
            return next > 0 ? { ...i, quantity: next } : null;
          }
          return i;
        })
        .filter(Boolean) as EntryItem[]
    );
  };

  const updateItemCostUsd = (productId: number, rawUsd: string) => {
    const val = rawUsd === '' ? 0 : Math.max(0, Number(rawUsd) || 0);
    setItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, unitCostUsd: val } : i))
    );
  };

  const updateItemCostVes = (productId: number, rawVes: string) => {
    const valVes = rawVes === '' ? 0 : Math.max(0, Number(rawVes) || 0);
    const valUsd = Math.round((valVes / rate) * 10000) / 10000;
    setItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, unitCostUsd: valUsd } : i))
    );
  };

  const updateItemSalePriceUsd = (productId: number, rawUsd: string) => {
    const val = rawUsd === '' ? 0 : Math.max(0, Number(rawUsd) || 0);
    setItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, newPriceUsd: val } : i))
    );
  };

  const removeItem = (productId: number) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  // Totals
  const totalUsd = useMemo(
    () =>
      Math.round(items.reduce((sum, i) => sum + i.quantity * i.unitCostUsd, 0) * 100) / 100,
    [items]
  );
  const totalVes = Math.round(totalUsd * rate * 100) / 100;
  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);

  // Initial partial payment preview
  const initPayRaw = Number(initialPayAmount) || 0;
  const initPayUsd =
    initialPayCurrency === 'USD'
      ? Math.round(initPayRaw * 100) / 100
      : Math.round((initPayRaw / rate) * 100) / 100;
  const initPayVes =
    initialPayCurrency === 'VES'
      ? Math.round(initPayRaw * 100) / 100
      : Math.round(initPayRaw * rate * 100) / 100;
  const initialOverpaid = paymentType === 'credito' && initPayUsd > totalUsd + 0.05;
  const resultingCxpUsd =
    paymentType === 'credito' ? Math.max(0, Math.round((totalUsd - initPayUsd) * 100) / 100) : 0;
  const resultingCxpVes = Math.round(resultingCxpUsd * rate * 100) / 100;

  const handleQuickAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupIdDoc.trim() || !newSupName.trim()) {
      setAddSupError('RIF/Cédula y Nombre del proveedor son obligatorios.');
      return;
    }
    if (duplicateQuickSupByDoc || duplicateQuickSupByName) {
      setAddSupError('Este proveedor ya existe. Selecciónelo en lugar de duplicarlo.');
      return;
    }
    const chosenZone = newSupZoneId ? zones.find((z) => String(z.id) === newSupZoneId) : null;
    try {
      const res = await apiFetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idDoc: newSupIdDoc.trim().toUpperCase(),
          name: newSupName.trim(),
          contactPerson: newSupContact.trim() || null,
          phone: newSupPhone.trim() || null,
          address: newSupAddress.trim() || null,
          state: newSupState.trim() || chosenZone?.state || null,
          zoneId: chosenZone ? chosenZone.id : null,
          zoneName: chosenZone ? chosenZone.name : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setAddSupError(err.error || 'Error al crear proveedor');
        return;
      }
      const created: Supplier = await res.json();
      setSuppliers((prev) => [...prev, created]);
      setSelectedSupplier(created);
      setSupplierSearch('');
      setShowAddSupplier(false);
      setNewSupIdDoc('');
      setNewSupName('');
      setNewSupContact('');
      setNewSupPhone('');
      setNewSupAddress('');
      setNewSupState('Mérida');
      setNewSupZoneId('');
      setAddSupError('');
    } catch {
      setAddSupError('Error de conexión con el servidor.');
    }
  };

  const handleQuickAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdCode.trim() || !newProdName.trim() || !newProdPriceUsd) {
      setAddProdError('Código, Nombre y Precio de Venta son obligatorios.');
      return;
    }
    if (duplicateQuickProdByCode || duplicateQuickProdByName) {
      setAddProdError('Este producto ya existe en el inventario.');
      return;
    }
    try {
      const res = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newProdCode.trim().toUpperCase(),
          name: newProdName.trim(),
          categoryId: newProdCategoryId ? Number(newProdCategoryId) : categories[0]?.id || 1,
          unit: newProdUnit,
          costUsd: Number(newProdCostUsd) || 0,
          priceUsd: Number(newProdPriceUsd) || 0,
          stock: 0, // Stock will be loaded by the merchandise entry itself
          minStock: Number(newProdMinStock) || 10,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setAddProdError(err.error || 'Error al registrar producto');
        return;
      }
      const created: Product = await res.json();
      setProducts((prev) => [...prev, created]);
      addProductToList(created);
      setShowAddProduct(false);
      setNewProdCode('');
      setNewProdName('');
      setNewProdCostUsd('');
      setNewProdPriceUsd('');
      setAddProdError('');
    } catch {
      setAddProdError('Error de conexión con el servidor.');
    }
  };

  const resetForm = () => {
    setSelectedSupplier(null);
    setSupplierSearch('');
    setInvoiceNumber('');
    setEntryDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setManualIdDoc('');
    setManualName('');
    setManualContact('');
    setManualPhone('');
    setManualAddress('');
    setManualDocRef('');
    setLinkedManualSupplier(null);
    setInitialPayAmount('');
    setInitialPayRef('');
    setItems([]);
    setErrorMsg('');
    setCompletedEntry(null);
  };

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (entryMode === 'con_factura') {
      if (!selectedSupplier) {
        setErrorMsg('Debe seleccionar o registrar un proveedor para la factura de compra.');
        return;
      }
      if (!invoiceNumber.trim()) {
        setErrorMsg('Debe ingresar el N° de Factura asociada a la compra.');
        return;
      }
      if (duplicateInvoiceWarning) {
        setErrorMsg(
          `La factura N° "${invoiceNumber.trim()}" ya existe para ${selectedSupplier.name}.`
        );
        return;
      }
    } else {
      if (!linkedManualSupplier && (!manualIdDoc.trim() || !manualName.trim())) {
        setErrorMsg(
          'Para cargar mercancía sin factura debe indicar la Cédula/RIF y el Nombre o Razón Social del proveedor.'
        );
        return;
      }
    }

    if (items.length === 0) {
      setErrorMsg('Agregue al menos un producto para cargar al inventario.');
      productSearchRef.current?.focus();
      return;
    }

    if (items.some((i) => i.quantity <= 0)) {
      setErrorMsg('Todas las cantidades de mercancía deben ser mayores a 0.');
      return;
    }

    if (initialOverpaid) {
      setErrorMsg(
        `El abono inicial (Bs. ${initPayVes.toFixed(2)}) supera el total de la mercancía (Bs. ${totalVes.toFixed(2)}).`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        hasInvoice: entryMode === 'con_factura',
        date: entryDate,
        paymentType,
        notes: notes.trim() || undefined,
        items: items.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitCostUsd: i.unitCostUsd,
          newPriceUsd: i.newPriceUsd > 0 ? i.newPriceUsd : undefined,
        })),
      };

      if (entryMode === 'con_factura') {
        payload.supplierId = selectedSupplier!.id;
        payload.invoiceNumber = invoiceNumber.trim();
      } else {
        if (linkedManualSupplier) {
          payload.supplierId = linkedManualSupplier.id;
        }
        const manualChosenZone = manualZoneId
          ? zones.find((z) => String(z.id) === manualZoneId)
          : null;
        payload.manualSupplier = {
          supplierType: manualSupplierType,
          idDoc: linkedManualSupplier ? linkedManualSupplier.idDoc : manualIdDoc.trim().toUpperCase(),
          name: linkedManualSupplier ? linkedManualSupplier.name : manualName.trim(),
          contactPerson: manualContact.trim() || undefined,
          phone: manualPhone.trim() || undefined,
          address: manualAddress.trim() || undefined,
          state: linkedManualSupplier
            ? linkedManualSupplier.state || undefined
            : manualState.trim() || manualChosenZone?.state || undefined,
          zoneId: linkedManualSupplier
            ? linkedManualSupplier.zoneId || undefined
            : manualChosenZone
            ? manualChosenZone.id
            : undefined,
          zoneName: linkedManualSupplier
            ? linkedManualSupplier.zoneName || undefined
            : manualChosenZone
            ? manualChosenZone.name
            : undefined,
        };
        if (manualDocRef.trim()) {
          payload.invoiceNumber = manualDocRef.trim();
        }
      }

      if (paymentType === 'credito' && initPayRaw > 0) {
        payload.initialPayment = {
          amountOriginal: initPayRaw,
          currency: initialPayCurrency,
          paymentMethod: initialPayMethod,
          bank: initialPayBank,
          reference: initialPayRef.trim() || undefined,
        };
      } else if (paymentType === 'contado' && totalUsd > 0) {
        payload.initialPayment = {
          amountOriginal: totalVes,
          currency: 'VES',
          paymentMethod: initialPayMethod,
          bank: initialPayBank,
          reference: initialPayRef.trim() || undefined,
        };
      }

      const res = await apiFetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al cargar la mercancía');
      }

      const created = await res.json();
      setCompletedEntry({
        ...created,
        mode: entryMode,
        manualType: manualSupplierType,
      });

      setItems([]);
      setInvoiceNumber('');
      setManualDocRef('');
      setInitialPayAmount('');
      setInitialPayRef('');
      setNotes('');

      onEntryCompleted();
      loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo registrar la carga de mercancía.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* HEADER + SELECTOR DE MODALIDAD (CON FACTURA vs SIN FACTURA) */}
      <div className="bg-white dark:bg-[#161b22] p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <PackagePlus className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Cargar Mercancía al Inventario
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Recepción de compras con factura asociada (y envío automático a Cuentas por Pagar si es a crédito) o carga directa sin factura / facturación manual.
            </p>
          </div>

          {/* 2 Tabs claras de modalidad */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-[#1c222b] rounded-xl border border-slate-200 dark:border-[#2d3748] shrink-0">
            <button
              type="button"
              onClick={() => {
                setEntryMode('con_factura');
                setPaymentType('credito');
                setErrorMsg('');
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                entryMode === 'con_factura'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Con Factura de Compra</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEntryMode('sin_factura');
                setErrorMsg('');
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                entryMode === 'sin_factura'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span>Sin Factura / Manual</span>
            </button>
          </div>
        </div>
      </div>

      {/* BANNER DE ÉXITO TRAS CARGAR MERCANCÍA */}
      {completedEntry && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-300 dark:border-emerald-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-0.5">
              <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                ¡Mercancía Cargada al Inventario Exitosamente!
              </h3>
              <p className="text-emerald-900 dark:text-emerald-300 font-mono">
                Documento: <strong>{completedEntry.invoiceNumber}</strong> · Proveedor:{' '}
                <strong>{completedEntry.supplierName}</strong> ({completedEntry.supplierIdDoc})
              </p>
              <p className="text-emerald-800 dark:text-emerald-300/90">
                Se cargaron <strong>{completedEntry.totalUnitsLoaded} unidades</strong> ({completedEntry.totalItemsCount}{' '}
                artículos) · Total:{' '}
                <strong className="font-mono">
                  Bs. {(completedEntry.totalUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} ($
                  {completedEntry.totalUsd?.toFixed(2)})
                </strong>
                {completedEntry.balanceDueUsd > 0.01 ? (
                  <span className="ml-2 font-bold text-amber-800 dark:text-amber-300">
                    · Enviado a Cuentas por Pagar (Saldo: Bs. {(completedEntry.balanceDueUsd * rate).toFixed(2)} — Permite abonos parciales)
                  </span>
                ) : (
                  <span className="ml-2 font-bold">· Pagada de Contado</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {completedEntry.balanceDueUsd > 0.01 && onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('cxp')}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Landmark className="w-3.5 h-3.5" />
                <span>Ir a Cuentas por Pagar</span>
              </button>
            )}
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('inventory')}
                className="px-3 py-2 bg-white dark:bg-[#1c222b] border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Package className="w-3.5 h-3.5" />
                <span>Ver Inventario</span>
              </button>
            )}
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              Nueva Carga
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmitEntry} className="space-y-4">
        {/* ================================================================= */}
        {/* PASO 1 Y 2: DATOS DEL PROVEEDOR Y DOCUMENTO / FACTURA             */}
        {/* ================================================================= */}
        {entryMode === 'con_factura' ? (
          <div className="bg-white dark:bg-[#161b22] p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] space-y-4 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#262f3c] pb-2.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>1. Proveedor y Factura Asociada a la Compra</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Tasa BCV: {rate.toFixed(2)} Bs./$
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
              {/* Buscador / Selector de Proveedor */}
              <div className="lg:col-span-5 relative" ref={supplierDropdownRef}>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Llamar Proveedor *
                </label>
                {selectedSupplier ? (
                  <div className="h-10 px-3 bg-emerald-50/90 dark:bg-emerald-950/35 border border-emerald-300 dark:border-emerald-800 rounded-lg flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {selectedSupplier.name}
                      </div>
                      <div className="text-[10px] font-mono text-emerald-800 dark:text-emerald-300">
                        {selectedSupplier.idDoc}
                        {selectedSupplier.currentBalanceUsd > 0
                          ? ` · Deuda CxP: Bs. ${(selectedSupplier.currentBalanceUsd * rate).toFixed(0)}`
                          : ' · Solvente'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSupplier(null);
                        setSupplierSearch('');
                      }}
                      className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 px-2 py-1 rounded cursor-pointer shrink-0"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-emerald-600 dark:text-emerald-400 absolute left-2.5 top-3" />
                      <input
                        type="text"
                        placeholder="Buscar proveedor por nombre o RIF..."
                        value={supplierSearch}
                        onChange={(e) => {
                          setSupplierSearch(e.target.value);
                          setIsSupplierDropdownOpen(true);
                        }}
                        onFocus={() => setIsSupplierDropdownOpen(true)}
                        className="w-full h-10 pl-9 pr-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNewSupName(supplierSearch.trim());
                        setNewSupIdDoc('');
                        setAddSupError('');
                        setShowAddSupplier(true);
                      }}
                      className="h-10 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nuevo</span>
                    </button>
                  </div>
                )}

                {/* Dropdown resultados proveedores */}
                {!selectedSupplier && isSupplierDropdownOpen && (
                  <div className="absolute left-0 right-0 top-[68px] bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-xl shadow-2xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-[#262f3c]">
                    {matchingSuppliers.length === 0 ? (
                      <div className="p-3 flex items-center justify-between gap-2 text-xs">
                        <span className="text-amber-800 dark:text-amber-300 font-semibold">
                          «{supplierSearch}» no registrado. ¿Desea crearlo?
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setNewSupName(supplierSearch.trim());
                            setNewSupIdDoc('');
                            setIsSupplierDropdownOpen(false);
                            setShowAddSupplier(true);
                          }}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded font-bold text-[11px] cursor-pointer"
                        >
                          Sí, Crear
                        </button>
                      </div>
                    ) : (
                      matchingSuppliers.map((sup) => (
                        <div
                          key={sup.id}
                          onClick={() => {
                            setSelectedSupplier(sup);
                            setSupplierSearch('');
                            setIsSupplierDropdownOpen(false);
                          }}
                          className="px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              {sup.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {sup.idDoc} {sup.phone ? `· ${sup.phone}` : ''}
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-amber-700 dark:text-amber-400 shrink-0 ml-2">
                            {sup.currentBalanceUsd > 0
                              ? `CxP: $${sup.currentBalanceUsd.toFixed(2)}`
                              : 'Solvente'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* N° de Factura Asociada */}
              <div className="lg:col-span-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  N° de Factura de Compra *
                </label>
                <input
                  type="text"
                  placeholder="Ej. FAC-PRV-00458"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className={`w-full h-10 px-3 bg-slate-50 dark:bg-[#1c222b] border rounded-lg font-mono font-bold text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden ${
                    duplicateInvoiceWarning
                      ? 'border-rose-500 ring-2 ring-rose-500/20'
                      : 'border-slate-300 dark:border-[#2d3748] focus:border-emerald-500'
                  }`}
                />
                {duplicateInvoiceWarning && (
                  <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1">
                    ¡Esta factura ya está registrada ({duplicateInvoiceWarning.date})!
                  </p>
                )}
              </div>

              {/* Fecha */}
              <div className="lg:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Fecha Emisión
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3 pointer-events-none" />
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full h-10 pl-8 pr-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Condición de Pago (Crédito CxP vs Contado) */}
              <div className="lg:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Condición
                </label>
                <div className="grid grid-cols-2 gap-1 p-1 h-10 bg-slate-100 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setPaymentType('credito')}
                    className={`rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                      paymentType === 'credito'
                        ? 'bg-amber-600 text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>Crédito</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentType('contado')}
                    className={`rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                      paymentType === 'contado'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Wallet className="w-3 h-3" />
                    <span>Contado</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* MODO 2: SIN FACTURA / PERSONA NATURAL / FIRMA PERSONAL / EMPRESA CON FACTURACIÓN MANUAL */
          <div className="bg-white dark:bg-[#161b22] p-4 sm:p-5 rounded-xl border border-sky-200 dark:border-sky-900/60 space-y-4 transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-[#262f3c] pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>1. Carga Sin Factura · Datos del Proveedor / Remitente</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Seleccione el tipo de proveedor que entrega la mercancía para cargar el inventario con trazabilidad completa.
                </p>
              </div>

              {linkedManualSupplier && (
                <button
                  type="button"
                  onClick={() => {
                    setLinkedManualSupplier(null);
                    setManualIdDoc('');
                    setManualName('');
                    setManualPhone('');
                    setManualAddress('');
                    setManualContact('');
                  }}
                  className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Desvincular proveedor seleccionado
                </button>
              )}
            </div>

            {/* 3 Tarjetas de Tipo de Proveedor */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                {
                  id: 'persona_natural' as const,
                  title: 'Persona Natural',
                  desc: 'Productor, comerciante particular (Cédula V-/E-)',
                  icon: User,
                },
                {
                  id: 'firma_personal' as const,
                  title: 'Firma Personal',
                  desc: 'Comercio a título personal (RIF V-/J-)',
                  icon: Briefcase,
                },
                {
                  id: 'empresa_manual' as const,
                  title: 'Empresa · Facturación Manual',
                  desc: 'Empresa con nota de entrega o factura manual',
                  icon: Building2,
                },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = manualSupplierType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setManualSupplierType(opt.id)}
                    className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                      active
                        ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-600 text-sky-950 dark:text-sky-100'
                        : 'bg-slate-50 dark:bg-[#1c222b] border-slate-200 dark:border-[#2d3748] text-slate-700 dark:text-slate-300 hover:border-sky-400'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        active
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-200 dark:bg-[#252e3d] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight">{opt.title}</div>
                      <div className="text-[10px] opacity-75 mt-0.5 leading-snug">{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Campos de Datos del Proveedor (Persona / Firma Personal / Empresa Manual) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {manualSupplierType === 'persona_natural'
                    ? 'Cédula (V- / E-) *'
                    : manualSupplierType === 'firma_personal'
                    ? 'RIF Firma Personal *'
                    : 'RIF Empresa (J- / G-) *'}
                </label>
                <input
                  type="text"
                  disabled={Boolean(linkedManualSupplier)}
                  placeholder={
                    manualSupplierType === 'persona_natural'
                      ? 'Ej. V-14258963'
                      : manualSupplierType === 'firma_personal'
                      ? 'Ej. V-14258963-1'
                      : 'Ej. J-40123456-7'
                  }
                  value={linkedManualSupplier ? linkedManualSupplier.idDoc : manualIdDoc}
                  onChange={(e) => setManualIdDoc(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-sky-500 disabled:opacity-70"
                />
              </div>

              <div className="md:col-span-4">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {manualSupplierType === 'persona_natural'
                    ? 'Nombre y Apellido *'
                    : manualSupplierType === 'firma_personal'
                    ? 'Nombre de la Firma Personal *'
                    : 'Razón Social de la Empresa *'}
                </label>
                <input
                  type="text"
                  disabled={Boolean(linkedManualSupplier)}
                  placeholder={
                    manualSupplierType === 'persona_natural'
                      ? 'Ej. José Luis Mendoza'
                      : manualSupplierType === 'firma_personal'
                      ? 'Ej. Inversiones Mendoza F.P.'
                      : 'Ej. Distribuidora El Llano C.A.'
                  }
                  value={linkedManualSupplier ? linkedManualSupplier.name : manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-sky-500 disabled:opacity-70"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Teléfono
                </label>
                <input
                  type="text"
                  disabled={Boolean(linkedManualSupplier)}
                  placeholder="0414-0000000"
                  value={linkedManualSupplier ? linkedManualSupplier.phone || '' : manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  className="w-full h-9 px-2.5 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-sky-500 disabled:opacity-70"
                />
              </div>

              <div className="md:col-span-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {manualSupplierType === 'empresa_manual'
                    ? 'N° Factura Manual / Nota (opcional)'
                    : 'N° Control / Nota Entrega (opcional)'}
                </label>
                <input
                  type="text"
                  placeholder="Auto-genera si queda vacío"
                  value={manualDocRef}
                  onChange={(e) => setManualDocRef(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-sky-500"
                />
              </div>

              <div className="md:col-span-4">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {manualSupplierType === 'empresa_manual' ? 'Persona que Entrega / Contacto' : 'Dirección / Procedencia'}
                </label>
                <input
                  type="text"
                  disabled={Boolean(linkedManualSupplier)}
                  placeholder={
                    manualSupplierType === 'empresa_manual'
                      ? 'Nombre del chofer o vendedor'
                      : 'Ciudad, zona o dirección'
                  }
                  value={
                    manualSupplierType === 'empresa_manual'
                      ? manualContact
                      : linkedManualSupplier
                      ? linkedManualSupplier.address || ''
                      : manualAddress
                  }
                  onChange={(e) =>
                    manualSupplierType === 'empresa_manual'
                      ? setManualContact(e.target.value)
                      : setManualAddress(e.target.value)
                  }
                  className="w-full h-9 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-sky-500 disabled:opacity-70"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Estado
                </label>
                <select
                  disabled={Boolean(linkedManualSupplier)}
                  value={linkedManualSupplier ? linkedManualSupplier.state || '' : manualState}
                  onChange={(e) => {
                    setManualState(e.target.value);
                    setManualZoneId('');
                  }}
                  className="w-full h-9 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100 disabled:opacity-70"
                >
                  <option value="">— Estado —</option>
                  {VENEZUELA_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Zona
                </label>
                <select
                  disabled={Boolean(linkedManualSupplier)}
                  value={
                    linkedManualSupplier
                      ? linkedManualSupplier.zoneId
                        ? String(linkedManualSupplier.zoneId)
                        : ''
                      : manualZoneId
                  }
                  onChange={(e) => {
                    setManualZoneId(e.target.value);
                    const z = zones.find((item) => String(item.id) === e.target.value);
                    if (z?.state) setManualState(z.state);
                  }}
                  className="w-full h-9 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100 disabled:opacity-70"
                >
                  <option value="">— Zona —</option>
                  {zones
                    .filter(
                      (z) =>
                        z.isActive &&
                        (!manualState || normalizeText(z.state) === normalizeText(manualState))
                    )
                    .map((z) => (
                      <option key={z.id} value={String(z.id)}>
                        {z.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Fecha de Recepción
                </label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-sky-500"
                />
              </div>

              <div className="md:col-span-5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Condición de la Recepción
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 h-9 bg-slate-100 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setPaymentType('contado')}
                    className={`rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                      paymentType === 'contado'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Wallet className="w-3 h-3" />
                    <span>Contado / Solo Inventario</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentType('credito')}
                    className={`rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                      paymentType === 'credito'
                        ? 'bg-amber-600 text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>A Crédito (Llevar a CxP)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Coincidencia automática de proveedores ya existentes para evitar duplicados */}
            {matchingManualSuppliers.length > 0 && (
              <div className="p-2.5 bg-amber-50 dark:bg-[#231d12] border border-amber-300 dark:border-amber-700 rounded-xl text-xs space-y-1.5">
                <div className="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Proveedores existentes encontrados (evite duplicar el registro):</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {matchingManualSuppliers.map((sup) => (
                    <button
                      key={sup.id}
                      type="button"
                      onClick={() => {
                        setLinkedManualSupplier(sup);
                        setManualIdDoc(sup.idDoc);
                        setManualName(sup.name);
                        setManualPhone(sup.phone || '');
                        setManualAddress(sup.address || '');
                      }}
                      className="px-2.5 py-1 bg-white dark:bg-[#1c222b] border border-amber-400 dark:border-amber-700 rounded-lg text-[11px] font-bold text-slate-900 dark:text-slate-100 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center gap-1.5 cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span>
                        Usar: {sup.name} ({sup.idDoc})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* PASO 2: INGRESAR PRODUCTOS A CARGAR EN INVENTARIO                 */}
        {/* ================================================================= */}
        <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden transition-colors">
          <div className="p-4 border-b border-slate-200 dark:border-[#262f3c] flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="relative flex-1" ref={productDropdownRef}>
              <Barcode className="w-4 h-4 text-sky-600 dark:text-sky-400 absolute left-3 top-3" />
              <input
                ref={productSearchRef}
                type="text"
                placeholder="2. Buscar producto por código de barra o nombre para cargar (Enter agrega y vuelve el cursor)..."
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setIsProductDropdownOpen(true);
                }}
                onFocus={() => setIsProductDropdownOpen(true)}
                onKeyDown={handleProductSearchKeyDown}
                className="w-full h-10 pl-9 pr-8 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
              {productSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setProductSearch('');
                    setIsProductDropdownOpen(false);
                    productSearchRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Product Search Dropdown */}
              {isProductDropdownOpen && productSearch.trim().length > 0 && (
                <div className="absolute left-0 right-0 top-[44px] bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-xl shadow-2xl z-30 max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-[#262f3c]">
                  {filteredProducts.length === 0 ? (
                    <div className="p-3 flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        «{productSearch}» no está en el inventario.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNewProdName(productSearch.trim());
                          setNewProdCode('');
                          setIsProductDropdownOpen(false);
                          setShowAddProduct(true);
                        }}
                        className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-bold text-[11px] cursor-pointer"
                      >
                        + Crear Producto Nuevo
                      </button>
                    </div>
                  ) : (
                    filteredProducts.slice(0, 12).map((p) => (
                      <div
                        key={p.id}
                        onClick={() => addProductToList(p)}
                        className="px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-500 dark:text-slate-400 text-[11px]">
                            {p.code}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                            {p.name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            · Stock actual: {p.stock} {p.unit}
                          </span>
                        </div>
                        <div className="font-mono text-right shrink-0 flex items-center gap-2">
                          <span className="text-[11px] text-slate-600 dark:text-slate-300">
                            Costo: Bs. {(p.costUsd * rate).toFixed(2)} (${p.costUsd.toFixed(2)})
                          </span>
                          <span className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold">
                            + Cargar
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setNewProdCode('');
                setNewProdName(productSearch.trim());
                setNewProdCostUsd('');
                setNewProdPriceUsd('');
                setAddProdError('');
                setShowAddProduct(true);
              }}
              className="h-10 px-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1f2530] dark:hover:bg-[#2a3342] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Crear Producto Nuevo</span>
            </button>
          </div>

          {/* Tabla de Productos Recibidos */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] text-slate-600 dark:text-slate-300 font-bold text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 w-28">Código</th>
                  <th className="py-2.5 px-3">Producto / Stock Resultante</th>
                  <th className="py-2.5 px-3 text-center w-36">Cantidad a Cargar</th>
                  <th className="py-2.5 px-3 text-right w-36">Costo Unit. (Bs.)</th>
                  <th className="py-2.5 px-3 text-right w-28">Costo ($ USD)</th>
                  <th className="py-2.5 px-3 text-right w-32">P. Venta ($ USD)</th>
                  <th className="py-2.5 px-3 text-right w-36">Subtotal (Bs.)</th>
                  <th className="py-2.5 px-2 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]/80">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 dark:text-slate-500">
                      <PackagePlus className="w-9 h-9 mx-auto mb-2 opacity-30" />
                      <p className="font-semibold text-slate-600 dark:text-slate-300">
                        Sin productos agregados a esta carga
                      </p>
                      <p className="text-[11px] mt-0.5">
                        Escanee el código de barras o busque el producto arriba para ingresarlo al inventario.
                      </p>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const unitCostVes = Math.round(item.unitCostUsd * rate * 100) / 100;
                    const subtotalUsd = Math.round(item.quantity * item.unitCostUsd * 100) / 100;
                    const subtotalVes = Math.round(subtotalUsd * rate * 100) / 100;
                    const resultingStock = Math.round((item.product.stock + item.quantity) * 100) / 100;

                    return (
                      <tr key={item.product.id} className="hover:bg-slate-50/70 dark:hover:bg-[#1a212b]">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {item.product.code}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {item.product.name}
                          </div>
                          <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                            Stock: {item.product.stock} → <strong>{resultingStock}</strong> {item.product.unit}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => stepItemQty(item.product.id, -1)}
                              className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#242c38] text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="0.1"
                              step="any"
                              value={item.quantity}
                              onChange={(e) => updateItemQty(item.product.id, Number(e.target.value))}
                              className="w-16 h-7 px-1 text-center bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded font-mono font-bold text-xs text-slate-900 dark:text-slate-100 tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() => stepItemQty(item.product.id, 1)}
                              className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#242c38] text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={unitCostVes}
                            onChange={(e) => updateItemCostVes(item.product.id, e.target.value)}
                            className="w-28 h-7 px-2 text-right bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded font-mono font-bold text-xs text-slate-900 dark:text-slate-100 tabular-nums"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitCostUsd}
                            onChange={(e) => updateItemCostUsd(item.product.id, e.target.value)}
                            className="w-20 h-7 px-2 text-right bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.newPriceUsd}
                            onChange={(e) => updateItemSalePriceUsd(item.product.id, e.target.value)}
                            className="w-20 h-7 px-2 text-right bg-white dark:bg-[#12161d] border border-emerald-300 dark:border-emerald-800/80 rounded font-mono text-xs text-emerald-800 dark:text-emerald-300 tabular-nums"
                            title="Actualizar precio de venta al público (opcional)"
                          />
                          <div className="text-[10px] font-mono text-slate-400">
                            Bs. {(item.newPriceUsd * rate).toFixed(2)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="font-extrabold text-slate-900 dark:text-slate-100">
                            Bs. {subtotalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-slate-400">${subtotalUsd.toFixed(2)} USD</div>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(item.product.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Quitar artículo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ================================================================= */}
        {/* PASO 3: RESUMEN FINANCIERO, ABONO INICIAL Y REGISTRO EN CXP       */}
        {/* ================================================================= */}
        <div className="bg-white dark:bg-[#161b22] p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-[#262f3c] space-y-4 transition-colors">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            {/* Abono inicial opcional o datos de pago + notas */}
            <div className="lg:col-span-7 space-y-3">
              {paymentType === 'credito' ? (
                <div className="p-3 bg-amber-50/70 dark:bg-[#231d12] border border-amber-300 dark:border-amber-800/80 rounded-xl space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                      <Landmark className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>Compra a Crédito → Cuentas por Pagar (Permite abonos parciales)</span>
                    </span>
                    <span className="text-[10px] font-mono text-amber-800 dark:text-amber-300">
                      Abono inicial opcional
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                    <div className="sm:col-span-4 flex gap-1">
                      <select
                        value={initialPayCurrency}
                        onChange={(e) => setInitialPayCurrency(e.target.value as 'VES' | 'USD')}
                        className="h-8 px-1.5 bg-white dark:bg-[#12161d] border border-amber-300 dark:border-amber-800 rounded-lg font-mono font-bold text-[11px]"
                      >
                        <option value="VES">Bs.</option>
                        <option value="USD">$ USD</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Abono inicial (0)"
                        value={initialPayAmount}
                        onChange={(e) => setInitialPayAmount(e.target.value)}
                        className="flex-1 min-w-0 h-8 px-2 bg-white dark:bg-[#12161d] border border-amber-300 dark:border-amber-800 rounded-lg font-mono font-bold text-xs text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <select
                      value={initialPayMethod}
                      onChange={(e) => setInitialPayMethod(e.target.value as any)}
                      className="sm:col-span-4 h-8 px-2 bg-white dark:bg-[#12161d] border border-amber-300 dark:border-amber-800 rounded-lg text-[11px]"
                    >
                      <option value="transferencia">Transferencia Bancaria</option>
                      <option value="pago_movil">Pago Móvil</option>
                      <option value="efectivo_usd">Efectivo Dólares ($)</option>
                      <option value="efectivo_ves">Efectivo Bolívares</option>
                      <option value="punto_de_venta">Punto de Venta</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Ref. pago (opcional)"
                      value={initialPayRef}
                      onChange={(e) => setInitialPayRef(e.target.value)}
                      className="sm:col-span-4 h-8 px-2 bg-white dark:bg-[#12161d] border border-amber-300 dark:border-amber-800 rounded-lg font-mono text-[11px]"
                    />
                  </div>

                  {initPayRaw > 0 && (
                    <div className="flex flex-wrap items-center justify-between text-[11px] font-mono pt-1 border-t border-amber-200 dark:border-amber-900/60">
                      <span className="text-emerald-800 dark:text-emerald-300 font-bold">
                        Abono inicial: Bs. {initPayVes.toFixed(2)} (${initPayUsd.toFixed(2)})
                      </span>
                      <span
                        className={`font-bold ${
                          initialOverpaid
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-900 dark:text-amber-200'
                        }`}
                      >
                        {initialOverpaid
                          ? '¡Abono supera el total!'
                          : `Queda en CxP: Bs. ${resultingCxpVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ($${resultingCxpUsd.toFixed(2)})`}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/60 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                    <Wallet className="w-4 h-4" />
                    <span>Recepción de Contado (Se carga directo al inventario sin deuda en CxP)</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <select
                      value={initialPayMethod}
                      onChange={(e) => setInitialPayMethod(e.target.value as any)}
                      className="h-8 px-2 bg-white dark:bg-[#12161d] border border-emerald-300 dark:border-emerald-800 rounded-lg text-[11px]"
                    >
                      <option value="transferencia">Transferencia Bancaria</option>
                      <option value="efectivo_usd">Efectivo Dólares ($)</option>
                      <option value="efectivo_ves">Efectivo Bolívares</option>
                      <option value="pago_movil">Pago Móvil</option>
                      <option value="punto_de_venta">Punto de Venta</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Banco (opcional)"
                      value={initialPayBank}
                      onChange={(e) => setInitialPayBank(e.target.value)}
                      className="h-8 px-2 bg-white dark:bg-[#12161d] border border-emerald-300 dark:border-emerald-800 rounded-lg text-[11px]"
                    />
                    <input
                      type="text"
                      placeholder="N° Referencia (opcional)"
                      value={initialPayRef}
                      onChange={(e) => setInitialPayRef(e.target.value)}
                      className="h-8 px-2 bg-white dark:bg-[#12161d] border border-emerald-300 dark:border-emerald-800 rounded-lg font-mono text-[11px]"
                    />
                  </div>
                </div>
              )}

              <div>
                <input
                  type="text"
                  placeholder="Observaciones de recepción (ej. bultos verificados, fecha de vencimiento, lote)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Total y Botón Confirmar Carga */}
            <div className="lg:col-span-5 space-y-2.5">
              <div className="p-3.5 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-xl font-mono tabular-nums flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                    TOTAL MERCANCÍA ({items.length} ítems · {totalUnits} uds)
                  </span>
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    Bs. {totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 block">
                    ${totalUsd.toFixed(2)} USD
                  </span>
                  {paymentType === 'credito' && (
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                      A CxP: Bs. {resultingCxpVes.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1f2530] dark:hover:bg-[#2a3342] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpiar</span>
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || items.length === 0 || initialOverpaid}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs disabled:opacity-45 disabled:cursor-not-allowed ${
                    paymentType === 'credito'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  <PackagePlus className="w-4 h-4 shrink-0" />
                  <span>
                    {isSubmitting
                      ? 'Cargando Mercancía...'
                      : paymentType === 'credito'
                      ? 'Cargar Inventario y Llevar a CxP'
                      : 'Cargar Mercancía al Inventario'}
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* ================================================================= */}
      {/* HISTORIAL RECIENTE DE CARGAS DE MERCANCÍA                         */}
      {/* ================================================================= */}
      <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden transition-colors">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-[#262f3c] flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Últimas Cargas de Mercancía Registradas ({recentPurchases.slice(0, 8).length})
          </h3>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('cxp')}
              className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Ver todas en Cuentas por Pagar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] text-slate-500 dark:text-slate-400 font-semibold text-[11px]">
              <tr>
                <th className="py-2.5 px-4">Documento / Factura</th>
                <th className="py-2.5 px-4">Fecha</th>
                <th className="py-2.5 px-4">Proveedor</th>
                <th className="py-2.5 px-4">Tipo / Nota</th>
                <th className="py-2.5 px-4 text-right">Total (Bs.)</th>
                <th className="py-2.5 px-4 text-right">Saldo CxP (Bs.)</th>
                <th className="py-2.5 px-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#222936]">
              {recentPurchases.slice(0, 8).map((p) => {
                const isManual =
                  p.invoiceNumber.startsWith('SIN-FAC') ||
                  p.invoiceNumber.startsWith('MAN-') ||
                  (p.notes || '').includes('SIN FACTURA') ||
                  (p.notes || '').includes('FACTURACIÓN MANUAL');
                return (
                  <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-[#1a212b]">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                      {p.invoiceNumber}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400">
                      {p.date}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-200">
                      {p.supplierName}
                      {p.supplierIdDoc && (
                        <span className="block text-[10px] font-mono text-slate-400">
                          {p.supplierIdDoc}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-[11px]">
                      {isManual ? (
                        <span className="px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 font-bold">
                          Sin Factura / Manual
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#242c38] text-slate-700 dark:text-slate-300 font-semibold">
                          Con Factura
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">
                      Bs. {(p.totalUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums text-amber-700 dark:text-amber-400">
                      Bs. {(p.balanceDueUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          p.balanceDueUsd <= 0.01
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : p.status === 'parcial'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        {p.balanceDueUsd <= 0.01
                          ? 'PAGADA'
                          : p.status === 'parcial'
                          ? 'PARCIAL (CxP)'
                          : 'PENDIENTE (CxP)'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================================================================= */}
      {/* MODAL RÁPIDO: CREAR PROVEEDOR CON DETECCIÓN DE DUPLICADOS         */}
      {/* ================================================================= */}
      {showAddSupplier && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative">
            <button
              type="button"
              onClick={() => setShowAddSupplier(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h4 className="text-sm font-bold flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Registrar Nuevo Proveedor</span>
            </h4>

            {addSupError && (
              <div className="mb-3 p-2 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300 font-semibold">
                {addSupError}
              </div>
            )}

            {(duplicateQuickSupByDoc || duplicateQuickSupByName) && (
              <div className="mb-3 p-2.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl text-xs">
                <p className="font-bold text-amber-900 dark:text-amber-200">
                  ¡Proveedor ya registrado!{' '}
                  {(duplicateQuickSupByDoc || duplicateQuickSupByName)?.name} (
                  {(duplicateQuickSupByDoc || duplicateQuickSupByName)?.idDoc})
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const existing = duplicateQuickSupByDoc || duplicateQuickSupByName;
                    if (existing) {
                      setSelectedSupplier(existing);
                      setShowAddSupplier(false);
                    }
                  }}
                  className="mt-1.5 px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-bold cursor-pointer"
                >
                  Seleccionar Existente
                </button>
              </div>
            )}

            <form onSubmit={handleQuickAddSupplier} className="space-y-2.5 text-xs">
              <div>
                <label className="font-bold block mb-1">RIF / Cédula *</label>
                <input
                  type="text"
                  required
                  placeholder="J-30123456-7"
                  value={newSupIdDoc}
                  onChange={(e) => setNewSupIdDoc(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Razón Social / Nombre *</label>
                <input
                  type="text"
                  required
                  placeholder="Alimentos Polar Comercial C.A."
                  value={newSupName}
                  onChange={(e) => setNewSupName(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1">Contacto</label>
                  <input
                    type="text"
                    value={newSupContact}
                    onChange={(e) => setNewSupContact(e.target.value)}
                    className="w-full h-9 px-2.5 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={newSupPhone}
                    onChange={(e) => setNewSupPhone(e.target.value)}
                    className="w-full h-9 px-2.5 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1">Estado</label>
                  <select
                    value={newSupState}
                    onChange={(e) => {
                      setNewSupState(e.target.value);
                      setNewSupZoneId('');
                    }}
                    className="w-full h-9 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg"
                  >
                    <option value="">— Estado —</option>
                    {VENEZUELA_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">Zona</label>
                  <select
                    value={newSupZoneId}
                    onChange={(e) => {
                      setNewSupZoneId(e.target.value);
                      const z = zones.find((item) => String(item.id) === e.target.value);
                      if (z?.state) setNewSupState(z.state);
                    }}
                    className="w-full h-9 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg"
                  >
                    <option value="">— Zona —</option>
                    {zones
                      .filter(
                        (z) =>
                          z.isActive &&
                          (!newSupState || normalizeText(z.state) === normalizeText(newSupState))
                      )
                      .map((z) => (
                        <option key={z.id} value={String(z.id)}>
                          {z.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="font-bold block mb-1">Dirección</label>
                <input
                  type="text"
                  value={newSupAddress}
                  onChange={(e) => setNewSupAddress(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSupplier(false)}
                  className="flex-1 py-2 bg-slate-100 dark:bg-[#1f2530] rounded-lg font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(duplicateQuickSupByDoc || duplicateQuickSupByName)}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white rounded-lg font-bold cursor-pointer"
                >
                  Guardar Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL RÁPIDO: CREAR PRODUCTO NUEVO CON DETECCIÓN DE DUPLICADOS    */}
      {/* ================================================================= */}
      {showAddProduct && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative">
            <button
              type="button"
              onClick={() => setShowAddProduct(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h4 className="text-sm font-bold flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Crear Nuevo Producto para Cargar</span>
            </h4>

            {addProdError && (
              <div className="mb-3 p-2 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300 font-semibold">
                {addProdError}
              </div>
            )}

            {(duplicateQuickProdByCode || duplicateQuickProdByName) && (
              <div className="mb-3 p-2.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl text-xs">
                <p className="font-bold text-amber-900 dark:text-amber-200">
                  ¡Producto ya existe en inventario!{' '}
                  {(duplicateQuickProdByCode || duplicateQuickProdByName)?.name} (
                  {(duplicateQuickProdByCode || duplicateQuickProdByName)?.code})
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const existing = duplicateQuickProdByCode || duplicateQuickProdByName;
                    if (existing) {
                      addProductToList(existing);
                      setShowAddProduct(false);
                    }
                  }}
                  className="mt-1.5 px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-bold cursor-pointer"
                >
                  Cargar Stock al Existente
                </button>
              </div>
            )}

            <form onSubmit={handleQuickAddProduct} className="space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1">Código / Barra *</label>
                  <input
                    type="text"
                    required
                    placeholder="7591234567"
                    value={newProdCode}
                    onChange={(e) => setNewProdCode(e.target.value)}
                    className="w-full h-9 px-2.5 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Unidad</label>
                  <select
                    value={newProdUnit}
                    onChange={(e) => setNewProdUnit(e.target.value)}
                    className="w-full h-9 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg"
                  >
                    <option value="unidad">Unidad</option>
                    <option value="kg">Kilogramo (kg)</option>
                    <option value="bulto">Bulto</option>
                    <option value="paquete">Paquete</option>
                    <option value="litro">Litro</option>
                    <option value="caja">Caja</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Nombre del Producto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Harina P.A.N. 1 Kg"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg"
                />
              </div>

              {similarQuickProducts.length > 0 && !duplicateQuickProdByCode && !duplicateQuickProdByName && (
                <div className="p-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 block">
                    Productos semejantes existentes:
                  </span>
                  {similarQuickProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-[11px]">
                      <span className="truncate">
                        <strong>{p.name}</strong> ({p.code})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          addProductToList(p);
                          setShowAddProduct(false);
                        }}
                        className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold cursor-pointer"
                      >
                        Usar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="font-bold block mb-1">Categoría</label>
                <select
                  value={newProdCategoryId}
                  onChange={(e) => setNewProdCategoryId(e.target.value)}
                  className="w-full h-9 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold block mb-1">Costo ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newProdCostUsd}
                    onChange={(e) => setNewProdCostUsd(e.target.value)}
                    className="w-full h-9 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Precio Venta ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={newProdPriceUsd}
                    onChange={(e) => setNewProdPriceUsd(e.target.value)}
                    className="w-full h-9 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Stock Mín.</label>
                  <input
                    type="number"
                    value={newProdMinStock}
                    onChange={(e) => setNewProdMinStock(e.target.value)}
                    className="w-full h-9 px-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProduct(false)}
                  className="flex-1 py-2 bg-slate-100 dark:bg-[#1f2530] rounded-lg font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(duplicateQuickProdByCode || duplicateQuickProdByName)}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white rounded-lg font-bold cursor-pointer"
                >
                  Crear y Agregar a Carga
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
