import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  UserPlus,
  CreditCard,
  DollarSign,
  Printer,
  X,
  Building,
  Check,
  AlertTriangle,
  UserCheck,
  Barcode,
  RotateCcw,
  Smartphone,
  Banknote,
  Wallet,
  Clock,
  ArrowRight,
  Mail,
  FileDown,
  Ban,
  Award,
  ShieldOff,
  MapPin,
} from 'lucide-react';
import { Product, Client, ExchangeRate, Zone } from '../types/index.ts';
import { EmailInvoiceModal } from './EmailInvoiceModal.tsx';
import { InvoicePdfData, downloadInvoicePdf } from '../lib/invoicePdf.ts';
import { getCreditRatingMeta } from './Clients.tsx';
import { ClientFormModal } from './ClientFormModal.tsx';

interface POSBillingProps {
  exchangeRate: ExchangeRate | null;
  onSaleCompleted: () => void;
}

interface CartItem {
  product: Product;
  quantity: number;
  unitPriceUsd: number;
  discountPercent: number;
  isExempt: boolean; // true = Exento (0%), false = IVA 16%
}

const normalizeText = (str: string) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const inferDefaultExempt = (product: Product): boolean => {
  const hay = normalizeText(`${product.name} ${product.categoryName || ''}`);
  const taxableKeywords = [
    'refresco',
    'gaseosa',
    'cola',
    'pepsi',
    'malta',
    'cerveza',
    'licor',
    'ron',
    'limpieza',
    'detergente',
    'cloro',
    'jabon',
    'suavizante',
    'desinfectante',
    'champu',
    'shampoo',
    'crema dental',
    'galleta',
    'chocolate',
    'golosina',
    'snack',
    'papas fritas',
    'doritos',
    'bebida',
    'jugo',
    'te frio',
  ];
  return !taxableKeywords.some((kw) => hay.includes(kw));
};

export const POSBilling: React.FC<POSBillingProps> = ({ exchangeRate, onSaleCompleted }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);

  // Step 1: Client selection & live automatic search
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [newSaleSuccessBanner, setNewSaleSuccessBanner] = useState('');
  const clientInputRef = useRef<HTMLInputElement>(null);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Step 2: Product search by barcode or name
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productSearchInputRef = useRef<HTMLInputElement>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  // Invoice Table items
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastAddedProductId, setLastAddedProductId] = useState<number | null>(null);
  const [lastAddedSeq, setLastAddedSeq] = useState(0);
  const lastAddedTargetRef = useRef<{ id: number; isNew: boolean } | null>(null);
  const cartScrollContainerRef = useRef<HTMLDivElement>(null);
  const cartRowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  // Sale mode: default is 'contado' (Por Cobrar), toggleable to 'credito' (A Crédito)
  const [paymentType, setPaymentType] = useState<'contado' | 'credito'>('contado');

  // Payment Popup Window ("Ventanita de Formas de Pago")
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const usdCashInputRef = useRef<HTMLInputElement>(null);

  // Multi-method payment inputs
  const [payEfectivoUsd, setPayEfectivoUsd] = useState<string>('');
  const [payEfectivoVes, setPayEfectivoVes] = useState<string>('');
  const [payPuntoDeVentaVes, setPayPuntoDeVentaVes] = useState<string>('');
  const [bankPuntoDeVenta, setBankPuntoDeVenta] = useState('Banesco POS');
  const [refPuntoDeVenta, setRefPuntoDeVenta] = useState('');

  const [payPagoMovilVes, setPayPagoMovilVes] = useState<string>('');
  const [bankPagoMovil, setBankPagoMovil] = useState('Banco de Venezuela');
  const [refPagoMovil, setRefPagoMovil] = useState('');

  const [payTransferenciaVes, setPayTransferenciaVes] = useState<string>('');
  const [bankTransferencia, setBankTransferencia] = useState('Banesco');
  const [refTransferencia, setRefTransferencia] = useState('');

  const [notes, setNotes] = useState('');

  // Invoice success modal & Email PDF modal
  const [lastInvoice, setLastInvoice] = useState<any | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [stockAlert, setStockAlert] = useState<{ productId: number; message: string } | null>(null);

  // Full Client Registration Modal (shared with Clients module)
  const [showAddClient, setShowAddClient] = useState(false);
  const [addClientInitialQuery, setAddClientInitialQuery] = useState('');

  const rate = exchangeRate?.rate || 76.5;

  const loadData = async () => {
    try {
      const [prodRes, clientRes, zonesRes] = await Promise.all([
        apiFetch('/api/products'),
        apiFetch('/api/clients'),
        apiFetch('/api/zones'),
      ]);
      if (prodRes.ok) setProducts(await prodRes.json());
      if (clientRes.ok) {
        const cl: Client[] = await clientRes.json();
        setClients(cl);
      }
      if (zonesRes.ok) setZones(await zonesRes.json());
    } catch (err) {
      console.error('Error loading billing resources', err);
    }
  };

  useEffect(() => {
    loadData();
    setTimeout(() => {
      clientInputRef.current?.focus();
    }, 80);
  }, []);

  // Keyboard shortcuts: F2 Client, F4 Product, F9 Open Payment Window, Escape Close Modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setIsPaymentModalOpen(false);
        setSelectedClient(null);
        setCart((prev) => prev.map((item) => ({ ...item, unitPriceUsd: item.product.priceUsd })));
        setTimeout(() => clientInputRef.current?.focus(), 40);
      } else if (e.key === 'F4') {
        e.preventDefault();
        setIsPaymentModalOpen(false);
        productSearchInputRef.current?.focus();
        productSearchInputRef.current?.select();
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (selectedClient && !selectedClient.isSuspended && cart.length > 0 && !lastInvoice && !showAddClient) {
          setErrorMsg('');
          setIsPaymentModalOpen(true);
        }
      } else if (e.key === 'Escape' && isPaymentModalOpen) {
        setIsPaymentModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedClient, cart.length, lastInvoice, showAddClient, isPaymentModalOpen]);

  // Focus first payment input when Payment Window opens
  useEffect(() => {
    if (isPaymentModalOpen) {
      setTimeout(() => {
        usdCashInputRef.current?.focus();
      }, 60);
    }
  }, [isPaymentModalOpen]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll invoice list upward as products are added so the latest item is always clearly visible
  useEffect(() => {
    const target = lastAddedTargetRef.current;
    if (!lastAddedSeq || !target) return;

    const raf = requestAnimationFrame(() => {
      const container = cartScrollContainerRef.current;
      if (!container) return;
      if (target.isNew) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      } else {
        cartRowRefs.current[target.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    const timer = window.setTimeout(() => {
      setLastAddedProductId(null);
    }, 1800);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [lastAddedSeq]);

  // Step 1: Client autocomplete matching
  const normalizedClientQuery = normalizeText(clientSearchQuery);
  const matchingClients = useMemo(() => {
    if (!normalizedClientQuery) return clients.slice(0, 8);
    return clients.filter((c) => {
      return (
        normalizeText(c.name).includes(normalizedClientQuery) ||
        normalizeText(c.idDoc).includes(normalizedClientQuery) ||
        (c.phone ? normalizeText(c.phone).includes(normalizedClientQuery) : false)
      );
    });
  }, [clients, normalizedClientQuery]);

  const getEffectivePriceUsd = (product: Product, client: Client | null): number =>
    client?.useCostPrice ? product.costUsd : product.priceUsd;

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setClientSearchQuery('');
    setIsClientDropdownOpen(false);
    // Automatically adjust prices of any items already in the cart for this client
    setCart((prev) =>
      prev.map((item) => ({
        ...item,
        unitPriceUsd: getEffectivePriceUsd(item.product, client),
      }))
    );
    if (client.creditEnabled === false) {
      setPaymentType('contado');
    }
    if (client.isSuspended) {
      setErrorMsg(`El cliente "${client.name}" está SUSPENDIDO y no puede recibir nuevas facturas.`);
    } else {
      setErrorMsg('');
    }
    setTimeout(() => {
      productSearchInputRef.current?.focus();
    }, 50);
  };

  // Step 2: Product search by barcode or name
  const normalizedProdQuery = normalizeText(productSearchTerm);
  const filteredProducts = useMemo(() => {
    if (!normalizedProdQuery) return products.slice(0, 15);
    const exactCodeMatches: Product[] = [];
    const otherMatches: Product[] = [];
    for (const p of products) {
      const pCode = normalizeText(p.code);
      const pName = normalizeText(p.name);
      if (pCode === normalizedProdQuery) {
        exactCodeMatches.push(p);
      } else if (pCode.includes(normalizedProdQuery) || pName.includes(normalizedProdQuery)) {
        otherMatches.push(p);
      }
    }
    return [...exactCodeMatches, ...otherMatches];
  }, [products, normalizedProdQuery]);

  const triggerStockLimitAlert = (product: Product, customMessage?: string) => {
    const msg =
      customMessage ||
      `¡ALERTA DE STOCK! Stock máximo disponible para "${product.name}": ${product.stock} ${product.unit}. No puede facturar más de lo que hay en existencia.`;
    setStockAlert({ productId: product.id, message: msg });
    setErrorMsg('');
  };

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      triggerStockLimitAlert(
        product,
        `¡SIN EXISTENCIA! "${product.name}" tiene 0 ${product.unit} en stock. No puede facturar productos sin disponibilidad.`
      );
      return;
    }

    const existing = cart.find((item) => item.product.id === product.id);
    if (existing && existing.quantity >= product.stock) {
      triggerStockLimitAlert(product);
      return;
    }

    setCart((prev) => {
      const current = prev.find((item) => item.product.id === product.id);
      if (current) {
        if (current.quantity >= product.stock) {
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          unitPriceUsd: getEffectivePriceUsd(product, selectedClient),
          discountPercent: 0,
          isExempt: inferDefaultExempt(product),
        },
      ];
    });
    setErrorMsg('');
    setStockAlert(null);
    lastAddedTargetRef.current = { id: product.id, isNew: !existing };
    setLastAddedProductId(product.id);
    setLastAddedSeq((n) => n + 1);
    setProductSearchTerm('');
    setIsProductDropdownOpen(false);
    setTimeout(() => {
      if (productSearchInputRef.current) {
        productSearchInputRef.current.focus();
        productSearchInputRef.current.select();
      }
    }, 30);
  };

  const handleProductSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts.length > 0) {
        const productToAdd = filteredProducts.find((p) => p.stock > 0) || filteredProducts[0];
        if (productToAdd) {
          addToCart(productToAdd);
        }
      }
    }
  };

  const updateQuantity = (productId: number, delta: number) => {
    const target = cart.find((item) => item.product.id === productId);
    if (!target) return;

    const newQty = Math.max(0, Math.round((target.quantity + delta) * 100) / 100);
    if (newQty > target.product.stock) {
      triggerStockLimitAlert(target.product);
      return;
    }

    if (stockAlert?.productId === productId) {
      setStockAlert(null);
    }
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const setExactQuantity = (productId: number, rawVal: string) => {
    const val = Number(rawVal);
    if (isNaN(val) || val < 0) return;
    const target = cart.find((item) => item.product.id === productId);
    if (!target) return;

    if (val > target.product.stock) {
      triggerStockLimitAlert(target.product);
      setCart((prev) =>
        prev.map((item) =>
          item.product.id === productId ? { ...item, quantity: item.product.stock } : item
        )
      );
      return;
    }

    if (stockAlert?.productId === productId) {
      setStockAlert(null);
    }
    setCart((prev) =>
      prev.map((item) => (item.product.id === productId ? { ...item, quantity: val } : item))
    );
  };

  const updateDiscount = (productId: number, rawVal: string) => {
    const parsed = rawVal === '' ? 0 : Math.min(100, Math.max(0, Number(rawVal) || 0));
    setCart((prev) =>
      prev.map((item) => (item.product.id === productId ? { ...item, discountPercent: parsed } : item))
    );
  };

  const toggleExempt = (productId: number) => {
    setCart((prev) =>
      prev.map((item) => (item.product.id === productId ? { ...item, isExempt: !item.isExempt } : item))
    );
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const computeLine = (item: CartItem) => {
    const grossUsd = item.quantity * item.unitPriceUsd;
    const discountUsd = grossUsd * (item.discountPercent / 100);
    const netBaseUsd = grossUsd - discountUsd;
    const ivaUsd = item.isExempt ? 0 : netBaseUsd * 0.16;
    const lineTotalUsd = Math.round((netBaseUsd + ivaUsd) * 100) / 100;
    return {
      grossUsd,
      discountUsd,
      netBaseUsd,
      ivaUsd,
      lineTotalUsd,
      grossVes: grossUsd * rate,
      discountVes: discountUsd * rate,
      netBaseVes: netBaseUsd * rate,
      ivaVes: ivaUsd * rate,
      lineTotalVes: lineTotalUsd * rate,
    };
  };

  const totals = useMemo(() => {
    let grossUsd = 0;
    let totalDiscountUsd = 0;
    let exemptBaseUsd = 0;
    let taxableBaseUsd = 0;
    let totalIvaUsd = 0;
    let grandTotalUsd = 0;

    for (const item of cart) {
      const l = computeLine(item);
      grossUsd += l.grossUsd;
      totalDiscountUsd += l.discountUsd;
      if (item.isExempt) {
        exemptBaseUsd += l.netBaseUsd;
      } else {
        taxableBaseUsd += l.netBaseUsd;
      }
      totalIvaUsd += l.ivaUsd;
      grandTotalUsd += l.lineTotalUsd;
    }

    grandTotalUsd = Math.round(grandTotalUsd * 100) / 100;
    const grandTotalVes = Math.round(grandTotalUsd * rate * 100) / 100;

    return {
      grossVes: Math.round(grossUsd * rate * 100) / 100,
      totalDiscountVes: Math.round(totalDiscountUsd * rate * 100) / 100,
      exemptBaseVes: Math.round(exemptBaseUsd * rate * 100) / 100,
      taxableBaseVes: Math.round(taxableBaseUsd * rate * 100) / 100,
      totalIvaVes: Math.round(totalIvaUsd * rate * 100) / 100,
      totalUsd: grandTotalUsd,
      totalVes: grandTotalVes,
    };
  }, [cart, rate]);

  // Payments summing in Bolívares and USD
  const valEfectivoUsd = Number(payEfectivoUsd) || 0;
  const valEfectivoVes = Number(payEfectivoVes) || 0;
  const valPuntoVentaVes = Number(payPuntoDeVentaVes) || 0;
  const valPagoMovilVes = Number(payPagoMovilVes) || 0;
  const valTransfVes = Number(payTransferenciaVes) || 0;

  const totalPaidVes =
    Math.round(
      (valEfectivoUsd * rate + valEfectivoVes + valTransfVes + valPagoMovilVes + valPuntoVentaVes) * 100
    ) / 100;
  const totalPaidUsd = Math.round((totalPaidVes / rate) * 100) / 100;

  const diffVes = Math.round((totalPaidVes - totals.totalVes) * 100) / 100;
  const isOverpaid = diffVes > 0.5;
  const remainingToPayVes = Math.max(0, Math.round((totals.totalVes - totalPaidVes) * 100) / 100);
  const remainingToPayUsd = Math.max(0, Math.round((totals.totalUsd - totalPaidUsd) * 100) / 100);

  const availableCreditUsd = selectedClient
    ? Math.max(0, selectedClient.creditLimitUsd - selectedClient.currentBalanceUsd)
    : 0;
  const availableCreditVes = availableCreditUsd * rate;
  const exceedsCredit = paymentType === 'credito' && selectedClient && remainingToPayUsd > availableCreditUsd;

  const fillRemainingInto = (
    method: 'efectivo_usd' | 'efectivo_ves' | 'transferencia' | 'pago_movil' | 'punto_de_venta'
  ) => {
    let currentOthersVes = 0;
    if (method !== 'efectivo_usd') currentOthersVes += valEfectivoUsd * rate;
    if (method !== 'efectivo_ves') currentOthersVes += valEfectivoVes;
    if (method !== 'transferencia') currentOthersVes += valTransfVes;
    if (method !== 'pago_movil') currentOthersVes += valPagoMovilVes;
    if (method !== 'punto_de_venta') currentOthersVes += valPuntoVentaVes;

    const neededVes = Math.max(0, Math.round((totals.totalVes - currentOthersVes) * 100) / 100);

    if (method === 'efectivo_usd') {
      const neededUsd = Math.round((neededVes / rate) * 100) / 100;
      setPayEfectivoUsd(neededUsd > 0 ? String(neededUsd) : '');
    } else if (method === 'efectivo_ves') {
      setPayEfectivoVes(neededVes > 0 ? String(neededVes) : '');
    } else if (method === 'transferencia') {
      setPayTransferenciaVes(neededVes > 0 ? String(neededVes) : '');
    } else if (method === 'pago_movil') {
      setPayPagoMovilVes(neededVes > 0 ? String(neededVes) : '');
    } else if (method === 'punto_de_venta') {
      setPayPuntoDeVentaVes(neededVes > 0 ? String(neededVes) : '');
    }
  };

  const clearPayments = () => {
    setPayEfectivoUsd('');
    setPayEfectivoVes('');
    setPayTransferenciaVes('');
    setRefTransferencia('');
    setPayPagoMovilVes('');
    setRefPagoMovil('');
    setPayPuntoDeVentaVes('');
    setRefPuntoDeVenta('');
  };

  const openPaymentWindow = (mode?: 'contado' | 'credito') => {
    if (!selectedClient) {
      setErrorMsg('Primero seleccione o cree un cliente.');
      clientInputRef.current?.focus();
      return;
    }
    if (selectedClient.isSuspended) {
      setErrorMsg(`El cliente "${selectedClient.name}" está SUSPENDIDO. Reactívelo en el módulo de Clientes para facturar.`);
      return;
    }
    if (cart.length === 0) {
      setErrorMsg('Agregue al menos un artículo a la factura.');
      productSearchInputRef.current?.focus();
      return;
    }
    const targetMode = mode || paymentType;
    if (targetMode === 'credito' && selectedClient.creditEnabled === false) {
      setErrorMsg(`El cliente "${selectedClient.name}" no tiene permiso de crédito. Solo puede facturar de contado.`);
      setPaymentType('contado');
      return;
    }
    if (mode) setPaymentType(mode);
    setErrorMsg('');
    setIsPaymentModalOpen(true);
  };

  const handleCreateSale = async (postAction: 'none' | 'print' | 'email' = 'none') => {
    if (!selectedClient) {
      setErrorMsg('Primero busque o seleccione un cliente.');
      return;
    }
    if (selectedClient.isSuspended) {
      setErrorMsg(`El cliente "${selectedClient.name}" está SUSPENDIDO y no puede ser facturado.`);
      return;
    }
    if (paymentType === 'credito' && selectedClient.creditEnabled === false) {
      setErrorMsg(`El cliente "${selectedClient.name}" no está autorizado para compras a crédito.`);
      setPaymentType('contado');
      return;
    }
    if (cart.length === 0) {
      setErrorMsg('Agregue al menos un artículo para facturar.');
      return;
    }
    if (cart.some((i) => i.quantity <= 0)) {
      setErrorMsg('Todos los artículos deben tener una cantidad mayor a 0.');
      return;
    }

    if (isOverpaid) {
      setErrorMsg(
        `ADVERTENCIA DE SOBREPAGO: Ingresó Bs. ${totalPaidVes.toLocaleString('es-VE', {
          minimumFractionDigits: 2,
        })} y la factura es Bs. ${totals.totalVes.toLocaleString('es-VE', {
          minimumFractionDigits: 2,
        })} (+Bs. ${diffVes.toFixed(2)}). Ajuste los montos.`
      );
      return;
    }

    if (paymentType === 'contado' && remainingToPayVes > 0.5) {
      setErrorMsg(
        `Faltan Bs. ${remainingToPayVes.toFixed(2)} ($${remainingToPayUsd.toFixed(
          2
        )}) para completar el cobro de contado.`
      );
      return;
    }

    if (paymentType === 'credito' && exceedsCredit) {
      setErrorMsg(
        `El saldo a crédito (Bs. ${remainingToPayVes.toFixed(2)}) supera el límite disponible del cliente (Bs. ${availableCreditVes.toFixed(
          2
        )} / $${availableCreditUsd.toFixed(2)}).`
      );
      return;
    }

    if (valTransfVes > 0 && !refTransferencia.trim()) {
      setErrorMsg('Ingrese el N° de referencia para la Transferencia Bancaria.');
      return;
    }
    if (valPagoMovilVes > 0 && !refPagoMovil.trim()) {
      setErrorMsg('Ingrese el N° de referencia para el Pago Móvil.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const itemsPayload = cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        unitPriceUsd: item.unitPriceUsd,
        discountPercent: item.discountPercent,
        isExempt: item.isExempt,
      }));

      const paymentsListPayload: Array<{
        paymentMethod: string;
        amountOriginal: number;
        currency: 'USD' | 'VES';
        bank?: string;
        reference?: string;
        notes?: string;
      }> = [];

      if (valEfectivoUsd > 0) {
        paymentsListPayload.push({
          paymentMethod: 'efectivo_usd',
          amountOriginal: valEfectivoUsd,
          currency: 'USD',
          bank: 'Caja Dólares',
          reference: 'EFEC-USD',
          notes: 'Pago en efectivo dólares',
        });
      }
      if (valEfectivoVes > 0) {
        paymentsListPayload.push({
          paymentMethod: 'efectivo_ves',
          amountOriginal: valEfectivoVes,
          currency: 'VES',
          bank: 'Caja Bolívares',
          reference: 'EFEC-VES',
          notes: 'Pago en efectivo bolívares',
        });
      }
      if (valPuntoVentaVes > 0) {
        paymentsListPayload.push({
          paymentMethod: 'punto_de_venta',
          amountOriginal: valPuntoVentaVes,
          currency: 'VES',
          bank: bankPuntoDeVenta,
          reference: refPuntoDeVenta.trim() || 'POS-TARJETA',
          notes: 'Punto de Venta / Tarjeta de débito',
        });
      }
      if (valPagoMovilVes > 0) {
        paymentsListPayload.push({
          paymentMethod: 'pago_movil',
          amountOriginal: valPagoMovilVes,
          currency: 'VES',
          bank: bankPagoMovil,
          reference: refPagoMovil.trim(),
          notes: 'Pago Móvil en Bolívares',
        });
      }
      if (valTransfVes > 0) {
        paymentsListPayload.push({
          paymentMethod: 'transferencia',
          amountOriginal: valTransfVes,
          currency: 'VES',
          bank: bankTransferencia,
          reference: refTransferencia.trim(),
          notes: 'Transferencia bancaria en Bolívares',
        });
      }

      const res = await apiFetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient.id,
          items: itemsPayload,
          paymentType,
          paymentsList: paymentsListPayload,
          notes,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al emitir factura');
      }

      const saleData = await res.json();
      setIsPaymentModalOpen(false);
      setEmailSentTo('');
      setLastInvoice({
        ...saleData,
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        clientIdDoc: selectedClient.idDoc,
        clientEmail: selectedClient.email || null,
        clientPhone: selectedClient.phone || null,
        clientAddress: selectedClient.address || null,
        items: cart,
        totalsSnapshot: totals,
        paymentsUsed: paymentsListPayload,
        notes: notes.trim() || null,
      });

      setCart([]);
      setStockAlert(null);
      clearPayments();
      setPaymentType('contado'); // Always reset to default "Por Cobrar"
      setNotes('');
      onSaleCompleted();
      loadData();

      if (postAction === 'print') {
        setTimeout(() => {
          window.print();
        }, 220);
      } else if (postAction === 'email') {
        setShowEmailModal(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar la venta');
    } finally {
      setIsLoading(false);
    }
  };

  const openAddClientWithQuery = () => {
    setAddClientInitialQuery(clientSearchQuery.trim());
    setShowAddClient(true);
  };

  const buildPdfDataFromLastInvoice = (inv: any): InvoicePdfData => {
    const invRate = inv.exchangeRate || rate;
    return {
      invoiceNumber: inv.invoiceNumber,
      date: inv.date,
      paymentType: inv.paymentType || 'contado',
      status: inv.status,
      exchangeRate: invRate,
      clientId: inv.clientId,
      clientName: inv.clientName,
      clientIdDoc: inv.clientIdDoc,
      clientEmail: inv.clientEmail || null,
      clientPhone: inv.clientPhone || null,
      clientAddress: inv.clientAddress || null,
      items: (inv.items || []).map((item: CartItem) => {
        const l = computeLine(item);
        return {
          code: item.product.code,
          name: item.product.name,
          quantity: item.quantity,
          unit: item.product.unit,
          unitPriceVes: item.unitPriceUsd * invRate,
          unitPriceUsd: item.unitPriceUsd,
          discountPercent: item.discountPercent,
          isExempt: item.isExempt,
          lineTotalVes: l.lineTotalVes,
          lineTotalUsd: l.lineTotalUsd,
        };
      }),
      exemptBaseVes: inv.totalsSnapshot?.exemptBaseVes,
      taxableBaseVes: inv.totalsSnapshot?.taxableBaseVes,
      totalDiscountVes: inv.totalsSnapshot?.totalDiscountVes,
      totalIvaVes: inv.totalsSnapshot?.totalIvaVes,
      totalVes: inv.totalVes ?? inv.totalsSnapshot?.totalVes ?? 0,
      totalUsd: inv.totalUsd ?? inv.totalsSnapshot?.totalUsd ?? 0,
      amountPaidUsd: inv.amountPaidUsd,
      balanceDueUsd: inv.balanceDueUsd,
      payments: inv.paymentsUsed || [],
      notes: inv.notes || null,
    };
  };

  const resetScreenForNextClient = () => {
    setLastInvoice(null);
    setShowEmailModal(false);
    setEmailSentTo('');
    setIsPaymentModalOpen(false);
    setCart([]);
    setSelectedClient(null);
    setClientSearchQuery('');
    setIsClientDropdownOpen(false);
    setProductSearchTerm('');
    setIsProductDropdownOpen(false);
    clearPayments();
    setPaymentType('contado'); // Reset default to "Por Cobrar"
    setNotes('');
    setErrorMsg('');
    setStockAlert(null);
    setNewSaleSuccessBanner('Factura finalizada · Lista para el próximo cliente');
    setTimeout(() => {
      clientInputRef.current?.focus();
    }, 100);
    setTimeout(() => {
      setNewSaleSuccessBanner('');
    }, 3500);
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const selectGenericClient = () => {
    const generic =
      clients.find(
        (c) =>
          c.idDoc.includes('00000000') ||
          c.name.toLowerCase().includes('general') ||
          c.name.toLowerCase().includes('contado')
      ) || clients[0];
    if (generic) handleSelectClient(generic);
  };

  const totalUnits = cart.reduce((s, i) => s + i.quantity, 0);
  const isReadyToCheckout = Boolean(selectedClient) && cart.length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2.5 lg:h-full">
      {/* ================================================================= */}
      {/* BARRA SUPERIOR ÚNICA: PASO 1 (CLIENTE) + PASO 2 (PRODUCTO/BARRA)  */}
      {/* ================================================================= */}
      <div className="bg-white dark:bg-[#161b22] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#262f3c] shrink-0 transition-colors space-y-2.5">
        {selectedClient ? (
          <>
            {/* CLIENTE SELECCIONADO: NOMBRE COMPLETO GRANDE Y DESTACADO */}
            <div
              ref={clientDropdownRef}
              className={`px-3.5 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 border-2 ${
                selectedClient.isSuspended
                  ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-400 dark:border-rose-700'
                  : 'bg-emerald-50/90 dark:bg-emerald-950/35 border-emerald-400 dark:border-emerald-700/80'
              }`}
            >
              <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    selectedClient.isSuspended
                      ? 'bg-rose-600/15 text-rose-600 dark:text-rose-400'
                      : 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {selectedClient.isSuspended ? (
                    <Ban className="w-5 h-5" />
                  ) : (
                    <UserCheck className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                      Cliente en facturación
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-[#161b22] px-2 py-0.5 rounded border border-slate-200/80 dark:border-slate-700">
                      {selectedClient.idDoc}
                    </span>
                    {selectedClient.isSuspended ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white">
                        SUSPENDIDO
                      </span>
                    ) : selectedClient.creditEnabled === false ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        SOLO CONTADO
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                          getCreditRatingMeta(selectedClient.creditRating).cls
                        }`}
                      >
                        <Award className="w-3 h-3" />
                        {getCreditRatingMeta(selectedClient.creditRating).label}
                      </span>
                    )}
                    {selectedClient.useCostPrice && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-sky-600 text-white tracking-wider">
                        PRECIO DE COSTO
                      </span>
                    )}
                    {selectedClient.state && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {selectedClient.zoneName || selectedClient.state}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-lg sm:text-xl font-black tracking-tight text-slate-950 dark:text-white leading-snug break-words">
                    {selectedClient.name}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedClient(null);
                  setCart((prev) => prev.map((item) => ({ ...item, unitPriceUsd: item.product.priceUsd })));
                  setClientSearchQuery('');
                  setErrorMsg('');
                  setTimeout(() => clientInputRef.current?.focus(), 40);
                }}
                className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/90 dark:bg-[#1c222b] hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-[#2d3748] rounded-lg cursor-pointer shrink-0 whitespace-nowrap transition-colors"
                title="Cambiar cliente (F2)"
              >
                Cambiar Cliente (F2)
              </button>
            </div>

            {/* PASO 2: BUSCAR PRODUCTO POR CÓDIGO DE BARRA O NOMBRE (ANCHO COMPLETO, SIN CATÁLOGO) */}
            <div className="flex items-center gap-2 relative" ref={productDropdownRef}>
              <div className="relative flex-1 min-w-0">
                <Barcode className="w-4 h-4 text-sky-600 dark:text-sky-400 absolute left-3 top-2.5" />
                <input
                  ref={productSearchInputRef}
                  type="text"
                  placeholder="2. Buscar por código de barra o nombre del producto / artículo (Enter agrega · F4)"
                  value={productSearchTerm}
                  onChange={(e) => {
                    setProductSearchTerm(e.target.value);
                    setIsProductDropdownOpen(true);
                  }}
                  onFocus={() => setIsProductDropdownOpen(true)}
                  onKeyDown={handleProductSearchKeyDown}
                  className="w-full h-9 pl-9 pr-7 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                />
                {productSearchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setProductSearchTerm('');
                      setIsProductDropdownOpen(false);
                      productSearchInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {newSaleSuccessBanner && (
                <span className="hidden xl:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 whitespace-nowrap">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Lista nueva</span>
                </span>
              )}

              {/* Floating Product Search Dropdown */}
              {isProductDropdownOpen && productSearchTerm.trim().length > 0 && (
                <div className="absolute left-0 right-0 top-[40px] bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-xl shadow-2xl z-40 max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-[#262f3c]">
                  {filteredProducts.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">
                      Sin coincidencias para «{productSearchTerm}».
                    </div>
                  ) : (
                    filteredProducts.slice(0, 12).map((product) => {
                      const isOutOfStock = product.stock <= 0;
                      const effectivePriceUsd = getEffectivePriceUsd(product, selectedClient);
                      const priceVes = effectivePriceUsd * rate;
                      const defaultExempt = inferDefaultExempt(product);

                      return (
                        <div
                          key={product.id}
                          onClick={() => !isOutOfStock && addToCart(product)}
                          className={`px-3 py-2 flex items-center justify-between gap-2 text-xs transition-colors ${
                            isOutOfStock
                              ? 'opacity-45 cursor-not-allowed bg-slate-50 dark:bg-[#161b22]'
                              : 'hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer'
                          }`}
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-500 dark:text-slate-400 text-[11px] shrink-0">
                              {product.code}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              {product.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                              · {defaultExempt ? 'Exento' : 'IVA 16%'} · Stk {product.stock}
                            </span>
                          </div>
                          <div className="text-right font-mono tabular-nums shrink-0 flex items-center gap-2">
                            <div>
                              {selectedClient?.useCostPrice && (
                                <span className="px-1.5 py-0.5 mr-1.5 rounded text-[9px] font-black bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                                  COSTO
                                </span>
                              )}
                              <span className="font-extrabold text-slate-900 dark:text-slate-100">
                                Bs. {priceVes.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-400 ml-1">
                                (${effectivePriceUsd.toFixed(2)})
                              </span>
                            </div>
                            {!isOutOfStock && (
                              <span className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold">
                                +
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
            {/* PASO 1: SELECCIONAR CLIENTE (5 columnas) */}
            <div className="lg:col-span-5 relative" ref={clientDropdownRef}>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 absolute left-2.5 top-2.5" />
                  <input
                    ref={clientInputRef}
                    type="text"
                    placeholder="1. Cliente: Nombre, Cédula o RIF (F2)..."
                    value={clientSearchQuery}
                    onChange={(e) => {
                      setClientSearchQuery(e.target.value);
                      setIsClientDropdownOpen(true);
                    }}
                    onFocus={() => setIsClientDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && matchingClients.length === 1) {
                        e.preventDefault();
                        handleSelectClient(matchingClients[0]);
                      }
                    }}
                    className="w-full h-9 pl-8 pr-7 bg-slate-50 dark:bg-[#1c222b] border border-amber-400/80 dark:border-amber-700/80 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20"
                  />
                  {clientSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setClientSearchQuery('');
                        setIsClientDropdownOpen(false);
                      }}
                      className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={selectGenericClient}
                  className="h-9 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1f2530] dark:hover:bg-[#273040] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#2d3748] rounded-lg text-[11px] font-semibold shrink-0 whitespace-nowrap cursor-pointer"
                  title="Facturar rápido a Cliente General (Contado)"
                >
                  General
                </button>
                <button
                  type="button"
                  onClick={openAddClientWithQuery}
                  className="h-9 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer"
                  title="Crear cliente nuevo"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Nuevo</span>
                </button>
              </div>

              {/* Floating Client Autocomplete Dropdown */}
              {isClientDropdownOpen && clientSearchQuery.trim().length > 0 && matchingClients.length > 0 && (
                <div className="absolute left-0 right-0 top-[40px] bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-xl shadow-2xl z-40 max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-[#262f3c]">
                  {matchingClients.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectClient(c)}
                      className="px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-slate-900 dark:text-slate-100 leading-snug break-words flex items-center gap-1.5 flex-wrap">
                          <span>{c.name}</span>
                          {c.useCostPrice && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                              PRECIO COSTO
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {c.idDoc} {c.phone ? `· ${c.phone}` : ''}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 shrink-0 ml-2">
                        {c.creditLimitUsd > 0 ? `Créd. Bs. ${(c.creditLimitUsd * rate).toFixed(0)}` : 'Contado'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Floating "Client does not exist — Create?" Prompt */}
              {clientSearchQuery.trim().length > 0 && matchingClients.length === 0 && (
                <div className="absolute left-0 right-0 top-[40px] p-2.5 bg-amber-50 dark:bg-[#231d12] border border-amber-400 dark:border-amber-700 rounded-xl shadow-2xl z-40 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="font-bold text-amber-950 dark:text-amber-200 truncate">
                      «{clientSearchQuery.trim()}» no existe. ¿Quiere crearlo?
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={openAddClientWithQuery}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] shrink-0 whitespace-nowrap flex items-center gap-1 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Sí, Crear</span>
                  </button>
                </div>
              )}
            </div>

            {/* PASO 2: BUSCAR PRODUCTO POR CÓDIGO DE BARRA O NOMBRE (7 columnas, SIN CATÁLOGO) */}
            <div className="lg:col-span-7 flex items-center gap-1.5 relative" ref={productDropdownRef}>
              <div className="relative flex-1 min-w-0">
                <Barcode className="w-4 h-4 text-sky-600 dark:text-sky-400 absolute left-2.5 top-2.5" />
                <input
                  ref={productSearchInputRef}
                  type="text"
                  placeholder="2. Buscar por código de barra o nombre del producto / artículo (Enter agrega · F4)"
                  value={productSearchTerm}
                  onChange={(e) => {
                    setProductSearchTerm(e.target.value);
                    setIsProductDropdownOpen(true);
                  }}
                  onFocus={() => setIsProductDropdownOpen(true)}
                  onKeyDown={handleProductSearchKeyDown}
                  className="w-full h-9 pl-9 pr-7 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                />
                {productSearchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setProductSearchTerm('');
                      setIsProductDropdownOpen(false);
                      productSearchInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {newSaleSuccessBanner && (
                <span className="hidden xl:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 whitespace-nowrap">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Lista nueva</span>
                </span>
              )}

              {/* Floating Product Search Dropdown */}
              {isProductDropdownOpen && productSearchTerm.trim().length > 0 && (
                <div className="absolute left-0 right-0 top-[40px] bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-xl shadow-2xl z-40 max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-[#262f3c]">
                  {filteredProducts.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">
                      Sin coincidencias para «{productSearchTerm}».
                    </div>
                  ) : (
                    filteredProducts.slice(0, 12).map((product) => {
                      const isOutOfStock = product.stock <= 0;
                      const priceVes = product.priceUsd * rate;
                      const defaultExempt = inferDefaultExempt(product);

                      return (
                        <div
                          key={product.id}
                          onClick={() => !isOutOfStock && addToCart(product)}
                          className={`px-3 py-2 flex items-center justify-between gap-2 text-xs transition-colors ${
                            isOutOfStock
                              ? 'opacity-45 cursor-not-allowed bg-slate-50 dark:bg-[#161b22]'
                              : 'hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer'
                          }`}
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-500 dark:text-slate-400 text-[11px] shrink-0">
                              {product.code}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              {product.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                              · {defaultExempt ? 'Exento' : 'IVA 16%'} · Stk {product.stock}
                            </span>
                          </div>
                          <div className="text-right font-mono tabular-nums shrink-0 flex items-center gap-2">
                            <div>
                              <span className="font-extrabold text-slate-900 dark:text-slate-100">
                                Bs. {priceVes.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-400 ml-1">
                                (${product.priceUsd.toFixed(2)})
                              </span>
                            </div>
                            {!isOutOfStock && (
                              <span className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold">
                                +
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* TABLA GRANDE DE ARTÍCULOS A ANCHO COMPLETO (100% PANTALLA)        */}
      {/* ================================================================= */}
      <div className="flex-1 min-h-[240px] lg:min-h-0 bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] flex flex-col overflow-hidden transition-colors">
        <div ref={cartScrollContainerRef} className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] text-slate-600 dark:text-slate-300 font-bold text-[11px]">
              <tr>
                <th className="py-2.5 px-3 w-32 whitespace-nowrap">Código</th>
                <th className="py-2.5 px-3">Descripción / Artículo</th>
                <th className="py-2.5 px-3 text-right w-32 whitespace-nowrap">Precio Unit.</th>
                <th className="py-2.5 px-3 text-center w-36 whitespace-nowrap">Cantidad</th>
                <th className="py-2.5 px-3 text-center w-24 whitespace-nowrap">Desc. %</th>
                <th className="py-2.5 px-3 text-center w-32 whitespace-nowrap">IVA o Exento</th>
                <th className="py-2.5 px-3 text-right w-36 whitespace-nowrap">Total (Bs.)</th>
                <th className="py-2.5 px-2 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]/80">
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400 dark:text-slate-500">
                    <ShoppingCart className="w-9 h-9 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                      Seleccione el cliente y escanee o busque los productos a facturar
                    </p>
                    <p className="text-[11px] mt-1 text-slate-400">
                      Atajos de caja rápida: F2 Cliente · F4 Buscar Producto · Enter Agregar · F9 Cobrar / Formas de Pago
                    </p>
                  </td>
                </tr>
              ) : (
                cart.map((item) => {
                  const line = computeLine(item);
                  const unitPriceVes = item.unitPriceUsd * rate;

                  return (
                    <tr
                      key={item.product.id}
                      ref={(el) => {
                        cartRowRefs.current[item.product.id] = el;
                      }}
                      className={`transition-colors ${
                        lastAddedProductId === item.product.id
                          ? 'bg-emerald-50/90 dark:bg-emerald-950/45 ring-1 ring-inset ring-emerald-400/70'
                          : 'hover:bg-slate-50/80 dark:hover:bg-[#1f2530]/70'
                      }`}
                    >
                      {/* Código */}
                      <td className="py-2 px-3 font-mono text-xs font-bold text-slate-600 dark:text-slate-300 align-middle whitespace-nowrap">
                        {item.product.code}
                      </td>

                      {/* Descripción / Artículo */}
                      <td className="py-2 px-3 align-middle">
                        <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 leading-tight">
                          {item.product.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          Unidad: {item.product.unit} · Stock disp.: {item.product.stock}
                        </div>
                      </td>

                      {/* Precio Unitario */}
                      <td className="py-2 px-3 text-right font-mono tabular-nums align-middle whitespace-nowrap">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          Bs. {unitPriceVes.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400">${item.unitPriceUsd.toFixed(2)}</div>
                      </td>

                      {/* Cantidad */}
                      <td className="py-2 px-3 align-middle">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, -1)}
                            className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#242c38] dark:hover:bg-[#2f3949] text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => setExactQuantity(item.product.id, e.target.value)}
                            className={`w-14 h-7 px-1 text-center rounded font-mono font-bold text-xs focus:outline-hidden tabular-nums ${
                              stockAlert?.productId === item.product.id
                                ? 'animate-stock-blink border-2'
                                : 'bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] text-slate-900 dark:text-slate-100 focus:border-emerald-500'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, 1)}
                            className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#242c38] dark:hover:bg-[#2f3949] text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Descuento (%) */}
                      <td className="py-2 px-3 align-middle text-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={item.discountPercent === 0 ? '' : item.discountPercent}
                          placeholder="0%"
                          onChange={(e) => updateDiscount(item.product.id, e.target.value)}
                          className="w-16 h-7 px-1.5 text-right bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded font-mono font-bold text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-amber-500 tabular-nums"
                        />
                        {line.discountVes > 0 && (
                          <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 leading-none mt-0.5">
                            -Bs. {line.discountVes.toFixed(2)}
                          </div>
                        )}
                      </td>

                      {/* IVA o Exento */}
                      <td className="py-2 px-3 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => toggleExempt(item.product.id)}
                          title="Clic para cambiar entre Exento e IVA 16%"
                          className={`px-2.5 py-1 rounded text-[11px] font-bold border cursor-pointer whitespace-nowrap transition-colors ${
                            item.isExempt
                              ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : 'bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800'
                          }`}
                        >
                          {item.isExempt ? 'EXENTO (E)' : 'IVA 16% (G)'}
                        </button>
                      </td>

                      {/* Total (Bs.) */}
                      <td className="py-2 px-3 text-right font-mono tabular-nums align-middle whitespace-nowrap">
                        <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                          Bs. {line.lineTotalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-slate-400">${line.lineTotalUsd.toFixed(2)} USD</div>
                      </td>

                      {/* Delete */}
                      <td className="py-2 px-2 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded cursor-pointer"
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

        {/* Franja Fiscal Resumida */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-[#1c222b] border-t border-slate-200 dark:border-[#262f3c] flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums shrink-0">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-slate-600 dark:text-slate-300">
            <span>
              <strong className="text-slate-900 dark:text-slate-100">{cart.length}</strong> artículos ({totalUnits} uds)
            </span>
            <span>
              Exento: <strong className="text-slate-900 dark:text-slate-100">Bs. {totals.exemptBaseVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
            </span>
            <span>
              Base Imp.: <strong className="text-slate-900 dark:text-slate-100">Bs. {totals.taxableBaseVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
            </span>
            {totals.totalDiscountVes > 0 && (
              <span className="text-amber-700 dark:text-amber-400">
                Descuentos: <strong>-Bs. {totals.totalDiscountVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
              </span>
            )}
            <span className="text-sky-700 dark:text-sky-400">
              IVA 16%: <strong>+Bs. {totals.totalIvaVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>

          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setCart([]);
                setStockAlert(null);
              }}
              className="text-xs font-sans font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Vaciar lista</span>
            </button>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* BARRA INFERIOR FIJA: TOTAL + ICONOS COBRAR (DEFECTO) / A CRÉDITO  */}
      {/* ================================================================= */}
      <div className="bg-white dark:bg-[#161b22] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#262f3c] shrink-0 transition-colors">
        {stockAlert && !isPaymentModalOpen && (
          <div
            role="alert"
            className="mb-2.5 px-3.5 py-2.5 rounded-xl border-2 animate-stock-blink text-xs sm:text-sm font-extrabold flex items-center justify-between gap-2.5 tracking-tight"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span className="leading-snug">{stockAlert.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStockAlert(null)}
              className="p-1 rounded-lg bg-black/15 hover:bg-black/25 shrink-0 cursor-pointer transition-colors"
              title="Cerrar advertencia"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {errorMsg && !isPaymentModalOpen && (
          <div className="mb-2 px-3 py-1.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* TOTAL A PAGAR DESTACADO EN GRANDE */}
          <div className="flex items-center gap-4">
            <div className="px-5 py-2.5 bg-emerald-50 dark:bg-emerald-950/55 border-2 border-emerald-500/80 dark:border-emerald-600/80 rounded-2xl font-mono tabular-nums shadow-xs">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block leading-none">
                TOTAL DE LA FACTURA
              </span>
              <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 mt-1">
                <span className="text-3xl sm:text-4xl font-black tracking-tight text-emerald-950 dark:text-emerald-50 leading-none">
                  Bs. {totals.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-lg sm:text-xl font-extrabold text-emerald-700 dark:text-emerald-300 leading-none">
                  $ {totals.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
              </div>
            </div>
          </div>

          {/* ICONOS DE MODALIDAD (POR DEFECTO: POR COBRAR) + BOTÓN VENTANITA DE PAGOS */}
          <div className="flex flex-wrap items-center gap-2">
            {selectedClient?.isSuspended ? (
              <div className="flex items-center gap-2 text-xs font-bold text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 px-3.5 py-2.5 rounded-xl">
                <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Cliente SUSPENDIDO — Facturación bloqueada. Reactívelo en Clientes.</span>
              </div>
            ) : isReadyToCheckout ? (
              <>
                {/* Icono 1: Por Cobrar / Contado (Activo por defecto) */}
                <button
                  type="button"
                  onClick={() => {
                    if (paymentType === 'contado') {
                      openPaymentWindow('contado');
                    } else {
                      setPaymentType('contado');
                    }
                  }}
                  className={`px-3.5 py-2.5 rounded-xl border-2 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                    paymentType === 'contado'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-900 dark:text-emerald-200 shadow-xs'
                      : 'bg-slate-50 dark:bg-[#1c222b] border-slate-200 dark:border-[#2d3748] text-slate-600 dark:text-slate-400 hover:border-emerald-500/60'
                  }`}
                  title="Venta de Contado (Por Cobrar ahora)"
                >
                  <Wallet className={`w-4 h-4 ${paymentType === 'contado' ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
                  <span>Por Cobrar</span>
                  {paymentType === 'contado' && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                </button>

                {/* Icono 2: A Crédito (CxC) — deshabilitado si el cliente no tiene permiso de crédito */}
                <button
                  type="button"
                  disabled={selectedClient?.creditEnabled === false}
                  onClick={() => {
                    if (selectedClient?.creditEnabled === false) return;
                    if (paymentType === 'credito') {
                      openPaymentWindow('credito');
                    } else {
                      setPaymentType('credito');
                    }
                  }}
                  className={`px-3.5 py-2.5 rounded-xl border-2 text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
                    selectedClient?.creditEnabled === false
                      ? 'bg-slate-100 dark:bg-[#161b22] border-slate-200 dark:border-[#262f3c] text-slate-400 cursor-not-allowed opacity-60'
                      : paymentType === 'credito'
                      ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-900 dark:text-amber-200 shadow-xs cursor-pointer'
                      : 'bg-slate-50 dark:bg-[#1c222b] border-slate-200 dark:border-[#2d3748] text-slate-600 dark:text-slate-400 hover:border-amber-500/60 cursor-pointer'
                  }`}
                  title={
                    selectedClient?.creditEnabled === false
                      ? 'Cliente sin permiso de crédito (solo contado)'
                      : 'Venta a Crédito (Cuenta por Cobrar)'
                  }
                >
                  {selectedClient?.creditEnabled === false ? (
                    <ShieldOff className="w-4 h-4 text-slate-400" />
                  ) : (
                    <Clock className={`w-4 h-4 ${paymentType === 'credito' ? 'text-amber-600 dark:text-amber-400' : ''}`} />
                  )}
                  <span>{selectedClient?.creditEnabled === false ? 'Sin Crédito' : 'A Crédito'}</span>
                  {paymentType === 'credito' && selectedClient?.creditEnabled !== false && (
                    <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  )}
                </button>

                {/* Botón Principal -> Despliega la ventanita de Formas de Pago */}
                <button
                  type="button"
                  onClick={() => openPaymentWindow(paymentType)}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white flex items-center gap-2 transition-colors cursor-pointer shadow-sm whitespace-nowrap ${
                    paymentType === 'credito'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {paymentType === 'credito' ? (
                    <>
                      <Clock className="w-4 h-4" />
                      <span>Formas de Pago / Crédito (F9)</span>
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4" />
                      <span>Cobrar · Formas de Pago (F9)</span>
                    </>
                  )}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] px-3.5 py-2 rounded-xl">
                <Wallet className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  {!selectedClient
                    ? 'Paso 1: Seleccione o cree un cliente arriba para habilitar Cobrar / A Crédito'
                    : 'Paso 2: Agregue productos a la tabla para habilitar los iconos de Cobrar / A Crédito'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* VENTANITA EMERGENTE: FORMAS DE PAGO MIXTO Y EMISIÓN DE FACTURA    */}
      {/* ================================================================= */}
      {isPaymentModalOpen && selectedClient && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-2xl w-full p-4 sm:p-5 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative my-auto animate-in fade-in duration-150">
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(false)}
              className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer"
              title="Volver a la factura (Esc)"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Encabezado de la Ventanita */}
            <div className="pr-8 mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  {paymentType === 'contado' ? (
                    <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  )}
                  <span>
                    {paymentType === 'contado' ? 'Cobrar Factura · Formas de Pago' : 'Venta a Crédito · Abono Inicial y Pago'}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>
                    Cliente: <strong className="text-slate-800 dark:text-slate-200">{selectedClient.name}</strong> ({selectedClient.idDoc}) · {cart.length} ítems
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-sans">
                    <Mail className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                    {selectedClient.email ? (
                      <span className="text-sky-700 dark:text-sky-300 font-medium">{selectedClient.email}</span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400">Sin correo registrado</span>
                    )}
                  </span>
                </p>
              </div>

              {/* Cambio rápido entre Por Cobrar / A Crédito dentro de la ventanita */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#1c222b] rounded-lg border border-slate-200 dark:border-[#2d3748] text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setPaymentType('contado')}
                  className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                    paymentType === 'contado'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Wallet className="w-3 h-3" />
                  <span>Por Cobrar</span>
                </button>
                <button
                  type="button"
                  disabled={selectedClient.creditEnabled === false}
                  onClick={() => selectedClient.creditEnabled !== false && setPaymentType('credito')}
                  title={selectedClient.creditEnabled === false ? 'Cliente sin permiso de crédito' : 'Cambiar a Crédito'}
                  className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors ${
                    selectedClient.creditEnabled === false
                      ? 'text-slate-400 cursor-not-allowed opacity-55'
                      : paymentType === 'credito'
                      ? 'bg-amber-600 text-white cursor-pointer'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span>{selectedClient.creditEnabled === false ? 'Sin Crédito' : 'A Crédito'}</span>
                </button>
              </div>
            </div>

            {/* Banner Grande del Monto Total a Cobrar */}
            <div className="mb-3 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/45 border border-emerald-300 dark:border-emerald-800/80 rounded-xl flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums">
              <div>
                <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 block">
                  TOTAL DE LA FACTURA
                </span>
                <span className="text-2xl sm:text-3xl font-black text-emerald-950 dark:text-emerald-100">
                  Bs. {totals.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300 block">
                  Ref. ${totals.totalUsd.toFixed(2)} USD
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Tasa BCV: {rate.toFixed(2)} Bs/$
                </span>
                {paymentType === 'credito' && (
                  <span className="block text-[10px] text-amber-700 dark:text-amber-300 font-semibold mt-0.5">
                    Crédito Disp.: Bs. {availableCreditVes.toFixed(2)} (${availableCreditUsd.toFixed(2)})
                  </span>
                )}
              </div>
            </div>

            {/* Grid 2 Columnas con las 5 Formas de Pago */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs mb-3">
              {/* 1. Efectivo USD */}
              <div className="p-2.5 bg-slate-50 dark:bg-[#1a212b] rounded-xl border border-slate-200 dark:border-[#2d3748]">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Efectivo Dólares ($ USD)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => fillRemainingInto('efectivo_usd')}
                    className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    +Resto
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={usdCashInputRef}
                    type="number"
                    step="0.01"
                    placeholder="0.00 $"
                    value={payEfectivoUsd}
                    onChange={(e) => setPayEfectivoUsd(e.target.value)}
                    className="flex-1 h-8 px-2.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-500 tabular-nums"
                  />
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                    = Bs. {(valEfectivoUsd * rate).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* 2. Efectivo Bolívares */}
              <div className="p-2.5 bg-slate-50 dark:bg-[#1a212b] rounded-xl border border-slate-200 dark:border-[#2d3748]">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Efectivo Bolívares (Bs.)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => fillRemainingInto('efectivo_ves')}
                    className="text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-[#252e3d] px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    +Resto
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00 Bs."
                    value={payEfectivoVes}
                    onChange={(e) => setPayEfectivoVes(e.target.value)}
                    className="flex-1 h-8 px-2.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-500 tabular-nums"
                  />
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                    = ${(valEfectivoVes / rate).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* 3. Punto de Venta */}
              <div className="p-2.5 bg-slate-50 dark:bg-[#1a212b] rounded-xl border border-slate-200 dark:border-[#2d3748]">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Punto de Venta (Bs.)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => fillRemainingInto('punto_de_venta')}
                    className="text-[10px] font-bold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-950/60 px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    +Resto
                  </button>
                </div>
                <div className="grid grid-cols-12 gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Monto Bs."
                    value={payPuntoDeVentaVes}
                    onChange={(e) => setPayPuntoDeVentaVes(e.target.value)}
                    className="col-span-5 h-8 px-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-sky-500 tabular-nums"
                  />
                  <select
                    value={bankPuntoDeVenta}
                    onChange={(e) => setBankPuntoDeVenta(e.target.value)}
                    className="col-span-4 h-8 px-1 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-[11px] text-slate-800 dark:text-slate-200"
                  >
                    <option value="Banesco POS">Banesco</option>
                    <option value="Mercantil POS">Mercantil</option>
                    <option value="Venezuela POS">Venezuela</option>
                    <option value="Provincial POS">Provincial</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Lote"
                    value={refPuntoDeVenta}
                    onChange={(e) => setRefPuntoDeVenta(e.target.value)}
                    className="col-span-3 h-8 px-1.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-[11px] font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* 4. Pago Móvil */}
              <div className="p-2.5 bg-slate-50 dark:bg-[#1a212b] rounded-xl border border-slate-200 dark:border-[#2d3748]">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Pago Móvil (Bs.)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => fillRemainingInto('pago_movil')}
                    className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    +Resto
                  </button>
                </div>
                <div className="grid grid-cols-12 gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Monto Bs."
                    value={payPagoMovilVes}
                    onChange={(e) => setPayPagoMovilVes(e.target.value)}
                    className="col-span-5 h-8 px-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-purple-500 tabular-nums"
                  />
                  <select
                    value={bankPagoMovil}
                    onChange={(e) => setBankPagoMovil(e.target.value)}
                    className="col-span-4 h-8 px-1 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-[11px] text-slate-800 dark:text-slate-200"
                  >
                    <option value="Banco de Venezuela">Venezuela</option>
                    <option value="Banesco">Banesco</option>
                    <option value="Mercantil">Mercantil</option>
                    <option value="Provincial">Provincial</option>
                    <option value="BNC">BNC</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Ref *"
                    value={refPagoMovil}
                    onChange={(e) => setRefPagoMovil(e.target.value)}
                    className="col-span-3 h-8 px-1.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-[11px] font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* 5. Transferencia Bancaria */}
              <div className="p-2.5 bg-slate-50 dark:bg-[#1a212b] rounded-xl border border-slate-200 dark:border-[#2d3748]">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
                    <Building className="w-3.5 h-3.5" />
                    <span>Transferencia Bancaria (Bs.)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => fillRemainingInto('transferencia')}
                    className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    +Resto
                  </button>
                </div>
                <div className="grid grid-cols-12 gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Monto Bs."
                    value={payTransferenciaVes}
                    onChange={(e) => setPayTransferenciaVes(e.target.value)}
                    className="col-span-5 h-8 px-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 tabular-nums"
                  />
                  <select
                    value={bankTransferencia}
                    onChange={(e) => setBankTransferencia(e.target.value)}
                    className="col-span-4 h-8 px-1 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-[11px] text-slate-800 dark:text-slate-200"
                  >
                    <option value="Banesco">Banesco</option>
                    <option value="Banco de Venezuela">Venezuela</option>
                    <option value="Mercantil">Mercantil</option>
                    <option value="Provincial">Provincial</option>
                    <option value="Bancaribe">Bancaribe</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Ref *"
                    value={refTransferencia}
                    onChange={(e) => setRefTransferencia(e.target.value)}
                    className="col-span-3 h-8 px-1.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-[11px] font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* 6. Notas & Limpiar */}
              <div className="p-2.5 bg-slate-50 dark:bg-[#1a212b] rounded-xl border border-slate-200 dark:border-[#2d3748] flex flex-col justify-between gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-600 dark:text-slate-400">Observación (opcional)</label>
                  <button
                    type="button"
                    onClick={clearPayments}
                    className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Limpiar pagos</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Nota o detalle adicional de la factura..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-8 px-2.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Balance en vivo dentro de la ventanita */}
            <div className="p-3 bg-slate-100 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-xl font-mono text-xs mb-3 flex flex-wrap items-center justify-between gap-2 tabular-nums">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Total Pagado: </span>
                <strong className="text-slate-900 dark:text-slate-100">
                  Bs. {totalPaidVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} (${totalPaidUsd.toFixed(2)})
                </strong>
              </div>

              {isOverpaid ? (
                <div className="text-rose-700 dark:text-rose-400 font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>¡SOBREPAGO! Excede por Bs. {diffVes.toFixed(2)}</span>
                </div>
              ) : remainingToPayVes > 0.5 ? (
                <div
                  className={`font-bold ${
                    paymentType === 'contado'
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {paymentType === 'contado' ? 'Falta por Cobrar:' : 'Quedará a Crédito (CxC):'} Bs.{' '}
                  {remainingToPayVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} (${remainingToPayUsd.toFixed(2)})
                </div>
              ) : totalPaidVes > 0 ? (
                <div className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  <span>Pago Completo y Exacto</span>
                </div>
              ) : (
                <span className="text-slate-400">
                  {paymentType === 'credito'
                    ? '0,00 abonado (100% a Crédito CxC)'
                    : 'Ingrese el pago o pulse +Resto'}
                </span>
              )}
            </div>

            {errorMsg && (
              <div className="mb-3 p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Opciones de Entrega de Factura en Cobro: Imprimir o Enviar PDF por Correo */}
            <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-[#262f3c]">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Opciones de Emisión y Entrega de Factura:
                </span>
                <span className="font-mono">
                  {selectedClient.email
                    ? `Correo cliente: ${selectedClient.email}`
                    : 'Correo cliente: Sin registrar (podrá ingresarlo al enviar)'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleCreateSale('print')}
                  disabled={isLoading || isOverpaid || (paymentType === 'contado' && remainingToPayVes > 0.5)}
                  className={`py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs ${
                    isLoading || isOverpaid || (paymentType === 'contado' && remainingToPayVes > 0.5)
                      ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                      : paymentType === 'credito'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  <Printer className="w-4 h-4 shrink-0" />
                  <span>
                    {isOverpaid
                      ? 'Ajuste el Sobrepago'
                      : isLoading
                      ? 'Emitiendo...'
                      : 'Cobrar e Imprimir Factura'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCreateSale('email')}
                  disabled={isLoading || isOverpaid || (paymentType === 'contado' && remainingToPayVes > 0.5)}
                  className={`py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs ${
                    isLoading || isOverpaid || (paymentType === 'contado' && remainingToPayVes > 0.5)
                      ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-sky-600 hover:bg-sky-700'
                  }`}
                >
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>
                    {isLoading ? 'Emitiendo...' : 'Cobrar y Enviar PDF por Correo'}
                  </span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="sm:w-44 py-2 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-[#1f2530] dark:hover:bg-[#2a3342] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Volver a la Factura
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateSale('none')}
                  disabled={isLoading || isOverpaid || (paymentType === 'contado' && remainingToPayVes > 0.5)}
                  className="flex-1 py-2 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-[#252e3d] dark:hover:bg-[#2f3a4d] disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>
                    Solo Emitir Factura (Bs. {totals.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })})
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: FACTURA EMITIDA / IMPRESIÓN Y REINICIO EN BLANCO           */}
      {/* ================================================================= */}
      {lastInvoice && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative animate-in fade-in duration-150 max-h-[92vh] overflow-y-auto">
            <button
              onClick={resetScreenForNextClient}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer print:hidden"
              title="Cerrar y reiniciar para nueva venta"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center pb-2.5 border-b border-slate-200 dark:border-[#262f3c] print:hidden">
              <span className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto mb-1.5">
                <CheckCircle className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold">¡Factura Emitida con Éxito!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {lastInvoice.invoiceNumber}
              </p>
            </div>

            <div
              id="printable-receipt"
              className="my-3 p-3.5 rounded-xl bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] text-xs font-mono space-y-2"
            >
              <div className="text-center font-bold pb-2 border-b border-dashed border-slate-300 dark:border-[#2d3748]">
                DISTRIBUIDORA ROECA C.A.
                <div className="font-normal text-[10px]">RIF: J-50182934-1</div>
                <div className="font-normal text-[10px]">Supermercado y Mayorista de Víveres</div>
              </div>

              <div className="pt-1 text-[11px] space-y-0.5">
                <div>Factura N°: {lastInvoice.invoiceNumber} · Fecha: {lastInvoice.date}</div>
                <div>
                  Cliente: {lastInvoice.clientName} ({lastInvoice.clientIdDoc})
                </div>
                {lastInvoice.clientEmail && <div>Correo: {lastInvoice.clientEmail}</div>}
                <div>
                  Condición: {lastInvoice.paymentType?.toUpperCase()} · Tasa BCV:{' '}
                  {lastInvoice.exchangeRate?.toFixed(2)} Bs./$
                </div>
              </div>

              <div className="pt-2 border-t border-dashed border-slate-300 dark:border-[#2d3748] space-y-1">
                {lastInvoice.items?.map((item: CartItem, idx: number) => {
                  const l = computeLine(item);
                  return (
                    <div key={idx} className="flex justify-between text-[11px] gap-2">
                      <span className="truncate">
                        [{item.product.code}] {item.quantity}x {item.product.name}
                        {item.discountPercent > 0 ? ` (-${item.discountPercent}%)` : ''}{' '}
                        {item.isExempt ? '(E)' : '(G 16%)'}
                      </span>
                      <span className="font-bold shrink-0">Bs. {l.lineTotalVes.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>

              {lastInvoice.totalsSnapshot && (
                <div className="pt-2 border-t border-dashed border-slate-300 dark:border-[#2d3748] space-y-0.5 text-[11px]">
                  <div className="flex justify-between">
                    <span>Exento (E):</span>
                    <span>Bs. {lastInvoice.totalsSnapshot.exemptBaseVes.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base Imponible (G):</span>
                    <span>Bs. {lastInvoice.totalsSnapshot.taxableBaseVes.toFixed(2)}</span>
                  </div>
                  {lastInvoice.totalsSnapshot.totalDiscountVes > 0 && (
                    <div className="flex justify-between">
                      <span>Descuentos:</span>
                      <span>-Bs. {lastInvoice.totalsSnapshot.totalDiscountVes.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>IVA (16%):</span>
                    <span>Bs. {lastInvoice.totalsSnapshot.totalIvaVes.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-300 dark:border-[#2d3748] space-y-1">
                <div className="flex justify-between text-sm font-bold">
                  <span>TOTAL A PAGAR:</span>
                  <span>Bs. {lastInvoice.totalVes?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Ref. Divisas:</span>
                  <span>${lastInvoice.totalUsd?.toFixed(2)} USD</span>
                </div>
              </div>

              {lastInvoice.paymentsUsed && lastInvoice.paymentsUsed.length > 0 && (
                <div className="pt-2 border-t border-dashed border-slate-300 dark:border-[#2d3748] space-y-0.5 text-[10px]">
                  <span className="font-bold block">Formas de Pago Aplicadas:</span>
                  {lastInvoice.paymentsUsed.map((p: any, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span>
                        • {p.paymentMethod.replace('_', ' ').toUpperCase()}{' '}
                        {p.reference ? `(Ref: ${p.reference})` : ''}
                      </span>
                      <span className="font-bold">
                        {p.currency === 'USD'
                          ? `$${p.amountOriginal.toFixed(2)}`
                          : `Bs. ${p.amountOriginal.toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {lastInvoice.balanceDueUsd > 0 && (
                <div className="pt-2 border-t border-slate-300 dark:border-[#2d3748] flex justify-between text-xs font-bold text-rose-700 dark:text-rose-400">
                  <span>SALDO PENDIENTE (CxC):</span>
                  <span>
                    Bs. {(lastInvoice.balanceDueUsd * rate).toFixed(2)} (${lastInvoice.balanceDueUsd?.toFixed(2)})
                  </span>
                </div>
              )}
            </div>

            {emailSentTo && (
              <div className="mb-2.5 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-2 print:hidden">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Factura PDF enviada por correo a {emailSentTo}</span>
              </div>
            )}

            <div className="space-y-2 mt-3 print:hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="py-2.5 px-3 rounded-xl bg-slate-900 dark:bg-[#242c38] text-white text-xs font-bold hover:bg-slate-800 dark:hover:bg-[#2f394a] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4 shrink-0" />
                  <span>Imprimir Factura</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmailModal(true)}
                  className="py-2.5 px-3 rounded-xl bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>Enviar PDF por Correo</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => downloadInvoicePdf(buildPdfDataFromLastInvoice(lastInvoice))}
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1f2530] dark:hover:bg-[#2a3342] text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileDown className="w-4 h-4 shrink-0" />
                  <span>Descargar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={resetScreenForNextClient}
                  className="py-2 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 shrink-0" />
                  <span>Siguiente Cliente / Nueva Venta</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ENVIAR FACTURA EN PDF POR GMAIL */}
      {showEmailModal && lastInvoice && (
        <EmailInvoiceModal
          invoice={buildPdfDataFromLastInvoice(lastInvoice)}
          onClose={() => setShowEmailModal(false)}
          onEmailSent={(recipient) => setEmailSentTo(recipient)}
          onClientEmailSaved={(clientId, savedEmail) => {
            setLastInvoice((prev: any) => (prev ? { ...prev, clientEmail: savedEmail } : prev));
            setClients((prev) =>
              prev.map((c) => (c.id === clientId ? { ...c, email: savedEmail } : c))
            );
          }}
        />
      )}

      {/* ================================================================= */}
      {/* MODAL COMPLETO DE REGISTRO DE CLIENTES (MÓDULO CLIENTES)          */}
      {/* ================================================================= */}
      <ClientFormModal
        isOpen={showAddClient}
        onClose={() => setShowAddClient(false)}
        clients={clients}
        zones={zones}
        initialQuery={addClientInitialQuery}
        submitCreateLabel="Guardar Cliente y Facturar"
        onSaved={(savedClient, isEdit) => {
          setClients((prev) =>
            isEdit
              ? prev.map((c) => (c.id === savedClient.id ? savedClient : c))
              : [...prev, savedClient]
          );
          handleSelectClient(savedClient);
        }}
        onSelectExistingForBilling={(existingClient) => {
          handleSelectClient(existingClient);
        }}
      />
    </div>
  );
};
