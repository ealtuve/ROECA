import { boolean, doublePrecision, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Branches (Sucursales para escalabilidad de Distribuidora ROECA)
export const branches = pgTable('branches', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  isMain: boolean('is_main').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// App Users & Roles (admin, cajero, almacen, contador)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').default('cajero').notNull(), // 'admin' | 'cajero' | 'almacen' | 'contador'
  branchId: integer('branch_id').references(() => branches.id),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Exchange Rates (Tasa de cambio del día USD / VES)
export const exchangeRates = pgTable('exchange_rates', {
  id: serial('id').primaryKey(),
  rate: doublePrecision('rate').notNull(), // e.g. 75.50 Bs por USD
  date: text('date').notNull(), // YYYY-MM-DD
  source: text('source').default('BCV').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Categories (Víveres, Lácteos, Charcutería, Enlatados, Bebidas, Limpieza, etc.)
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
});

// Zones & States (Zonas de distribución y Estados de Venezuela)
export const zones = pgTable('zones', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  state: text('state').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Products (Inventario con alerta de stock bajo)
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // Código de barra o SKU
  name: text('name').notNull(),
  description: text('description'),
  categoryId: integer('category_id').references(() => categories.id),
  unit: text('unit').default('unidad').notNull(), // 'kg', 'unidad', 'bulto', 'paquete', 'litro'
  costUsd: doublePrecision('cost_usd').default(0).notNull(),
  priceUsd: doublePrecision('price_usd').notNull(),
  stock: doublePrecision('stock').default(0).notNull(),
  minStock: doublePrecision('min_stock').default(10).notNull(),
  branchId: integer('branch_id').references(() => branches.id),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Clients (Clientes con límite de crédito y saldo de cuentas por cobrar)
export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  idDoc: text('id_doc').notNull().unique(), // RIF o Cédula (V-12345678, J-12345678-9)
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  creditLimitUsd: doublePrecision('credit_limit_usd').default(0).notNull(),
  currentBalanceUsd: doublePrecision('current_balance_usd').default(0).notNull(), // Deuda pendiente
  branchId: integer('branch_id').references(() => branches.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// Suppliers (Proveedores con cuentas por pagar)
export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  idDoc: text('id_doc').notNull().unique(), // RIF (J-...)
  name: text('name').notNull(),
  contactPerson: text('contact_person'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  currentBalanceUsd: doublePrecision('current_balance_usd').default(0).notNull(), // Deuda por pagar
  createdAt: timestamp('created_at').defaultNow(),
});

// Sales / Invoices (Facturación Contado o Crédito)
export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  branchId: integer('branch_id').references(() => branches.id),
  cashierUid: text('cashier_uid').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  paymentType: text('payment_type').default('contado').notNull(), // 'contado' | 'credito'
  status: text('status').default('pagada').notNull(), // 'pagada' | 'parcial' | 'pendiente' | 'anulada'
  exchangeRate: doublePrecision('exchange_rate').notNull(),
  totalUsd: doublePrecision('total_usd').notNull(),
  totalVes: doublePrecision('total_ves').notNull(),
  amountPaidUsd: doublePrecision('amount_paid_usd').default(0).notNull(),
  balanceDueUsd: doublePrecision('balance_due_usd').default(0).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Sale Items
export const saleItems = pgTable('sale_items', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id').references(() => sales.id).notNull(),
  productId: integer('product_id').references(() => products.id).notNull(),
  productName: text('product_name').notNull(),
  productCode: text('product_code').notNull(),
  quantity: doublePrecision('quantity').notNull(),
  unitPriceUsd: doublePrecision('unit_price_usd').notNull(),
  subtotalUsd: doublePrecision('subtotal_usd').notNull(),
});

// Purchases (Cuentas por pagar a proveedores)
export const purchases = pgTable('purchases', {
  id: serial('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull(),
  supplierId: integer('supplier_id').references(() => suppliers.id).notNull(),
  branchId: integer('branch_id').references(() => branches.id),
  date: text('date').notNull(),
  paymentType: text('payment_type').default('credito').notNull(), // 'contado' | 'credito'
  status: text('status').default('pendiente').notNull(), // 'pagada' | 'parcial' | 'pendiente' | 'anulada'
  exchangeRate: doublePrecision('exchange_rate').notNull(),
  totalUsd: doublePrecision('total_usd').notNull(),
  amountPaidUsd: doublePrecision('amount_paid_usd').default(0).notNull(),
  balanceDueUsd: doublePrecision('balance_due_usd').default(0).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Purchase Items
export const purchaseItems = pgTable('purchase_items', {
  id: serial('id').primaryKey(),
  purchaseId: integer('purchase_id').references(() => purchases.id).notNull(),
  productId: integer('product_id').references(() => products.id).notNull(),
  productName: text('product_name').notNull(),
  quantity: doublePrecision('quantity').notNull(),
  unitCostUsd: doublePrecision('unit_cost_usd').notNull(),
  subtotalUsd: doublePrecision('subtotal_usd').notNull(),
});

// Payments & Abonos (Tanto para CxC clientes como CxP proveedores, multimoneda USD/VES)
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(), // 'cliente_abono' | 'proveedor_pago'
  saleId: integer('sale_id').references(() => sales.id),
  purchaseId: integer('purchase_id').references(() => purchases.id),
  clientId: integer('client_id').references(() => clients.id),
  supplierId: integer('supplier_id').references(() => suppliers.id),
  amountOriginal: doublePrecision('amount_original').notNull(),
  currency: text('currency').notNull(), // 'USD' | 'VES'
  exchangeRate: doublePrecision('exchange_rate').notNull(),
  amountUsd: doublePrecision('amount_usd').notNull(),
  amountVes: doublePrecision('amount_ves').notNull(),
  paymentMethod: text('payment_method').notNull(), // 'efectivo_usd' | 'efectivo_ves' | 'pago_movil' | 'transferencia' | 'punto_de_venta'
  bank: text('bank'), // Banco de origen / destino (Banesco, Venezuela, Mercantil, etc.)
  reference: text('reference'), // Número de referencia/recibo de pago móvil o transferencia
  notes: text('notes'),
  cashierUid: text('cashier_uid').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Drizzle relations
export const branchesRelations = relations(branches, ({ many }) => ({
  users: many(users),
  products: many(products),
  clients: many(clients),
  sales: many(sales),
  purchases: many(purchases),
}));

export const usersRelations = relations(users, ({ one }) => ({
  branch: one(branches, {
    fields: [users.branchId],
    references: [branches.id],
  }),
}));

export const productsRelations = relations(products, ({ one }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  branch: one(branches, {
    fields: [products.branchId],
    references: [branches.id],
  }),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  client: one(clients, {
    fields: [sales.clientId],
    references: [clients.id],
  }),
  branch: one(branches, {
    fields: [sales.branchId],
    references: [branches.id],
  }),
  items: many(saleItems),
  payments: many(payments),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
  product: one(products, {
    fields: [saleItems.productId],
    references: [products.id],
  }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  sales: many(sales),
  payments: many(payments),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  purchases: many(purchases),
  payments: many(payments),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [purchases.supplierId],
    references: [suppliers.id],
  }),
  branch: one(branches, {
    fields: [purchases.branchId],
    references: [branches.id],
  }),
  items: many(purchaseItems),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  sale: one(sales, {
    fields: [payments.saleId],
    references: [sales.id],
  }),
  purchase: one(purchases, {
    fields: [payments.purchaseId],
    references: [purchases.id],
  }),
  client: one(clients, {
    fields: [payments.clientId],
    references: [clients.id],
  }),
  supplier: one(suppliers, {
    fields: [payments.supplierId],
    references: [suppliers.id],
  }),
}));
