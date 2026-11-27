export type UserRole = 'admin' | 'gerente' | 'cajero' | 'almacen' | 'contador';

export type ModuleKey =
  | 'dashboard'
  | 'billing'
  | 'inventory'
  | 'receiving'
  | 'cxc'
  | 'cxp'
  | 'clients'
  | 'client_analytics'
  | 'suppliers'
  | 'reports'
  | 'exchange'
  | 'branches'
  | 'users_admin'
  | 'backup'
  | 'settings';

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  description: string;
  group: 'operativo' | 'finanzas' | 'administracion';
}

export const ALL_MODULES: ModuleDefinition[] = [
  { key: 'dashboard', label: 'Panel de Control', description: 'Métricas generales y flujo de caja', group: 'operativo' },
  { key: 'billing', label: 'Facturación (POS)', description: 'Ventas contado/crédito, impresión y correo PDF', group: 'operativo' },
  { key: 'inventory', label: 'Inventario', description: 'Catálogo, precios y alertas de stock', group: 'operativo' },
  { key: 'receiving', label: 'Cargar Mercancía', description: 'Recepción con factura o entrada manual', group: 'operativo' },
  { key: 'cxc', label: 'Cuentas por Cobrar', description: 'Créditos de clientes y abonos parciales', group: 'finanzas' },
  { key: 'cxp', label: 'Cuentas por Pagar', description: 'Facturas de proveedores y pagos', group: 'finanzas' },
  { key: 'clients', label: 'Clientes', description: 'Registro, zonas, límite y suspensión de crédito', group: 'operativo' },
  { key: 'client_analytics', label: 'Análisis de Clientes', description: 'Top 10 productos por cliente y ranking mensual de facturas', group: 'finanzas' },
  { key: 'suppliers', label: 'Proveedores', description: 'Directorio y saldos de proveedores', group: 'operativo' },
  { key: 'reports', label: 'Reportes Financieros', description: 'Reportes por fechas, estado y zona', group: 'finanzas' },
  { key: 'exchange', label: 'Tasa del Día (BCV)', description: 'Consulta y ajuste de tasa USD/VES', group: 'administracion' },
  { key: 'branches', label: 'Sucursales', description: 'Gestión de sedes y códigos ROECA', group: 'administracion' },
  { key: 'users_admin', label: 'Usuarios y Permisos', description: 'Crear usuarios, claves y tildar módulos', group: 'administracion' },
  { key: 'backup', label: 'Copia de Seguridad', description: 'Respaldo general, restauración y auditoría', group: 'administracion' },
];

export const ALL_MODULE_KEYS: ModuleKey[] = ALL_MODULES.map((m) => m.key);

export const ROLE_DEFAULT_MODULES: Record<UserRole, ModuleKey[]> = {
  admin: [...ALL_MODULE_KEYS],
  gerente: [
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
    'exchange',
    'branches',
    'backup',
  ],
  cajero: ['dashboard', 'billing', 'cxc', 'clients'],
  almacen: ['dashboard', 'inventory', 'receiving', 'suppliers', 'cxp'],
  contador: ['dashboard', 'cxc', 'cxp', 'clients', 'client_analytics', 'suppliers', 'reports', 'exchange', 'backup'],
};

export interface UserProfile {
  id: number;
  uid: string;
  username?: string;
  email: string;
  name: string;
  role: UserRole;
  allowedModules?: ModuleKey[];
  hasPassword?: boolean;
  lastLoginAt?: string | null;
  branchId?: number | null;
  isActive: boolean;
}

export interface AuditLog {
  id: number;
  operatorUsername: string;
  operatorName: string;
  operatorRole: string;
  action: string;
  module: string;
  details?: string | null;
  createdAt: string;
}

export interface Branch {
  id: number;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isMain: boolean;
}

export interface ExchangeRate {
  id: number;
  rate: number;
  date: string;
  source: string;
  updatedAt?: string;
}

export interface Category {
  id: number;
  name: string;
  description?: string | null;
}

export interface Zone {
  id: number;
  code: string;
  name: string;
  state: string;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
}

export interface Product {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  unit: string;
  costUsd: number;
  priceUsd: number;
  stock: number;
  minStock: number;
  branchId?: number | null;
  imageUrl?: string | null;
  updatedAt?: string;
}

export type CreditRating = 'nuevo' | 'excelente' | 'regular' | 'malo';

export interface Client {
  id: number;
  idDoc: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  state?: string | null;
  zoneId?: number | null;
  zoneName?: string | null;
  creditEnabled: boolean;
  creditDays: number;
  isSuspended: boolean;
  useCostPrice?: boolean;
  creditRating: CreditRating;
  onTimePaymentsCount?: number;
  latePaymentsCount?: number;
  veryLatePaymentsCount?: number;
  creditLimitUsd: number;
  currentBalanceUsd: number;
  branchId?: number | null;
}

export interface Supplier {
  id: number;
  idDoc: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  state?: string | null;
  zoneId?: number | null;
  zoneName?: string | null;
  currentBalanceUsd: number;
}

export interface SaleItem {
  id?: number;
  saleId?: number;
  productId: number;
  productName: string;
  productCode: string;
  quantity: number;
  unitPriceUsd: number;
  subtotalUsd: number;
}

export interface Sale {
  id: number;
  invoiceNumber: string;
  clientId: number;
  clientName: string;
  clientIdDoc?: string;
  clientPhone?: string;
  clientEmail?: string | null;
  clientAddress?: string;
  clientState?: string | null;
  clientZoneName?: string | null;
  branchId?: number | null;
  date: string;
  dueDate?: string | null;
  paymentType: 'contado' | 'credito';
  status: 'pagada' | 'parcial' | 'pendiente' | 'anulada';
  exchangeRate: number;
  totalUsd: number;
  totalVes: number;
  amountPaidUsd: number;
  balanceDueUsd: number;
  notes?: string | null;
  createdAt?: string;
  items?: SaleItem[];
  payments?: Payment[];
}

export interface PurchaseItem {
  id?: number;
  purchaseId?: number;
  productId: number;
  productName: string;
  productCode?: string;
  productUnit?: string;
  quantity: number;
  unitCostUsd: number;
  subtotalUsd: number;
}

export interface Purchase {
  id: number;
  invoiceNumber: string;
  supplierId: number;
  supplierName: string;
  supplierIdDoc?: string;
  supplierState?: string | null;
  supplierZoneName?: string | null;
  branchId?: number | null;
  date: string;
  paymentType: 'contado' | 'credito';
  status: 'pagada' | 'parcial' | 'pendiente' | 'anulada';
  exchangeRate: number;
  totalUsd: number;
  amountPaidUsd: number;
  balanceDueUsd: number;
  notes?: string | null;
  createdAt?: string;
}

export type PaymentMethod =
  | 'efectivo_usd'
  | 'efectivo_ves'
  | 'pago_movil'
  | 'transferencia'
  | 'punto_de_venta';

export interface Payment {
  id: number;
  type: 'cliente_abono' | 'proveedor_pago';
  saleId?: number | null;
  invoiceNumber?: string | null;
  purchaseId?: number | null;
  purchaseInvoiceNumber?: string | null;
  clientId?: number | null;
  clientName?: string | null;
  supplierId?: number | null;
  supplierName?: string | null;
  amountOriginal: number;
  currency: 'USD' | 'VES';
  exchangeRate: number;
  amountUsd: number;
  amountVes: number;
  paymentMethod: PaymentMethod;
  bank?: string | null;
  reference?: string | null;
  notes?: string | null;
  cashierUid?: string;
  createdAt: string;
}

export interface DashboardTopProduct {
  productId: number;
  productCode: string;
  productName: string;
  unit: string;
  unitsSold: number;
  revenueUsd: number;
  profitUsd: number;
  currentStock: number;
}

export interface DashboardLowStockItem {
  id: number;
  code: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  costUsd: number;
  priceUsd: number;
  deficit: number;
}

export interface DashboardDueReceivable {
  id: number;
  invoiceNumber: string;
  clientId: number;
  clientName: string;
  date: string;
  dueDate: string;
  daysUntilDue: number;
  totalUsd: number;
  balanceDueUsd: number;
  status: string;
}

export interface DashboardDuePayable {
  id: number;
  invoiceNumber: string;
  supplierId: number;
  supplierName: string;
  date: string;
  dueDate: string;
  daysUntilDue: number;
  totalUsd: number;
  balanceDueUsd: number;
  status: string;
  isEstimatedDueDate: boolean;
}

export interface DashboardDailyPoint {
  date: string;
  label: string;
  salesUsd: number;
  profitUsd: number;
  count: number;
}

export interface DashboardStats {
  salesTodayUsd: number;
  salesTodayCount: number;
  netProfitTodayUsd: number;
  salesMonthUsd: number;
  salesMonthCount: number;
  cogsMonthUsd: number;
  netProfitMonthUsd: number;
  netProfitMarginPct: number;
  topProductScope: 'mes' | 'historico';
  topProduct: DashboardTopProduct | null;
  topProducts: DashboardTopProduct[];
  cxcTotalUsd: number;
  cxcDebtorsCount: number;
  cxcOverdueCount: number;
  cxcOverdueUsd: number;
  cxcDueSoonCount: number;
  cxcDueSoonUsd: number;
  upcomingReceivables: DashboardDueReceivable[];
  cxpTotalUsd: number;
  cxpCreditorsCount: number;
  cxpOverdueCount: number;
  cxpOverdueUsd: number;
  cxpDueSoonCount: number;
  cxpDueSoonUsd: number;
  upcomingPayables: DashboardDuePayable[];
  lowStockCount: number;
  outOfStockCount: number;
  lowStockProducts: DashboardLowStockItem[];
  dailyTrend: DashboardDailyPoint[];
  incomeUsd: number;
  incomeVes: number;
  expenseUsd: number;
  expenseVes: number;
  netCashFlowUsd: number;
  recentSales: Array<{
    id: number;
    invoiceNumber: string;
    clientName: string;
    totalUsd: number;
    status: string;
    paymentType: string;
    date: string;
  }>;
  recentPayments: Array<{
    id: number;
    type: string;
    amountUsd: number;
    currency: string;
    amountOriginal: number;
    paymentMethod: string;
    reference?: string | null;
    createdAt: string;
  }>;
  currentExchangeRate: number;
}

export interface ClientTopProductItem {
  productId: number;
  productCode: string;
  productName: string;
  unit: string;
  totalQuantity: number;
  totalSpentUsd: number;
  purchaseFrequency: number;
  avgUnitPriceUsd: number;
  shareOfClientSpendPct: number;
}

export interface ClientAnalyticsRow {
  clientId: number;
  clientName: string;
  clientIdDoc: string;
  zoneName: string | null;
  state: string | null;
  useCostPrice: boolean;
  creditRating: CreditRating;
  currentBalanceUsd: number;
  invoiceCount: number;
  totalAmountUsd: number;
  totalArticles: number;
  distinctProductsCount: number;
  avgTicketUsd: number;
  avgArticlesPerInvoice: number;
  shareOfRevenuePct: number;
  lastInvoiceDate: string | null;
  topProductsPeriod: ClientTopProductItem[];
  topProductsAllTime: ClientTopProductItem[];
  allTimeInvoiceCount: number;
  allTimeTotalUsd: number;
  allTimeArticles: number;
}

export interface ClientAnalyticsResponse {
  selectedMonth: string;
  availableMonths: string[];
  currentExchangeRate: number;
  summary: {
    activeClientsCount: number;
    totalClientsCount: number;
    totalInvoices: number;
    totalAmountUsd: number;
    totalArticles: number;
    topByInvoices: ClientAnalyticsRow | null;
    topByAmount: ClientAnalyticsRow | null;
    topByArticles: ClientAnalyticsRow | null;
  };
  clients: ClientAnalyticsRow[];
}
