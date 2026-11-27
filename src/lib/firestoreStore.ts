import {
  collection,
  doc,
  getDocs,
  getDocsFromCache,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  limit,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase.ts';
import { MERIDA_TUCANI_SEED } from './venezuelaGeo.ts';
import {
  CreditRating,
  ModuleKey,
  UserProfile,
  UserRole,
  ROLE_DEFAULT_MODULES,
  ALL_MODULE_KEYS,
} from '../types/index.ts';
import { hashPassword, verifyPassword, computeSha256 } from './crypto.ts';
import { trackPendingWrite, markSyncedNow } from './offlineSync.ts';

// Keep a reference to the native browser fetch for external / stateless requests (like /api/bcv-live and Gmail API)
const nativeFetch: typeof window.fetch = window.fetch.bind(window);

const normalizeText = (str: string) =>
  String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const cleanProductCode = (val: unknown): string =>
  String(val ?? '')
    .trim()
    .replace(/^['´`’‘ʼ′ʹ"“”\u00B4\u02B9\u02BC\u2018\u2019\u2032]+/, '')
    .trim();

const normalizeProductName = (val: unknown): string =>
  normalizeText(String(val ?? '')).replace(/\s+/g, ' ');

const truncate = (val: unknown, maxLen: number): string | null => {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

const reqStr = (val: unknown, maxLen: number, fallback = ''): string => {
  const s = String(val ?? fallback).trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

const toIsoString = (val: unknown): string => {
  if (!val) return new Date().toISOString();
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as any).toDate === 'function') {
    return (val as any).toDate().toISOString();
  }
  return String(val);
};

const todayStr = () => new Date().toISOString().split('T')[0];

const addDaysToDateStr = (dateIso: string, days: number): string => {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(days)));
  return d.toISOString().split('T')[0];
};

const daysBetween = (fromIso: string, toIso: string): number => {
  const a = new Date(`${fromIso}T12:00:00Z`).getTime();
  const b = new Date(`${toIso}T12:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
};

export function computeCreditRating(params: {
  onTimeCount: number;
  lateCount: number;
  veryLateCount: number;
  maxOpenOverdueDays?: number;
}): CreditRating {
  const { onTimeCount, lateCount, veryLateCount, maxOpenOverdueDays = 0 } = params;
  const total = onTimeCount + lateCount + veryLateCount;

  // Severe overdue on an open invoice or repeated very late payments -> malo
  if (maxOpenOverdueDays > 7) return 'malo';
  if (veryLateCount >= 2 || (veryLateCount >= 1 && veryLateCount >= onTimeCount)) return 'malo';

  // Mild overdue on open invoice (1..7 days) or notable late payments ("casi a tiempo") -> regular
  if (maxOpenOverdueDays >= 1) return 'regular';
  if (veryLateCount >= 1 || lateCount >= 2 || (lateCount >= 1 && lateCount >= onTimeCount)) return 'regular';

  // Good track record -> excelente
  if (onTimeCount >= 1) return 'excelente';
  if (total === 0) return 'nuevo';
  return 'regular';
}

const requireUid = (): string => {
  const u = auth.currentUser;
  if (!u || !u.uid) {
    throw new Error('Conexión con la base de datos no inicializada. Verifique su conexión e intente nuevamente.');
  }
  return u.uid;
};

type ColName =
  | 'branches'
  | 'users'
  | 'exchangeRates'
  | 'categories'
  | 'zones'
  | 'products'
  | 'clients'
  | 'suppliers'
  | 'sales'
  | 'saleItems'
  | 'purchases'
  | 'purchaseItems'
  | 'payments'
  | 'auditLogs';

const DOC_PREFIX: Record<ColName, string> = {
  branches: 'br',
  users: 'usr',
  exchangeRates: 'rat',
  categories: 'cat',
  zones: 'zn',
  products: 'prd',
  clients: 'cli',
  suppliers: 'sup',
  sales: 'sal',
  saleItems: 'sli',
  purchases: 'pur',
  purchaseItems: 'pri',
  payments: 'pay',
  auditLogs: 'aud',
};

const docIdFor = (col: ColName, uid: string, numericId: number) =>
  `${DOC_PREFIX[col]}_${uid.slice(0, 8)}_${numericId}`;

const isOfflineNow = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

// Active operator context for automatic activity auditing
let activeOperatorCtx: { username: string; name: string; role: string } | null = null;

export function setActiveOperatorContext(op: UserProfile | null) {
  if (!op) {
    activeOperatorCtx = null;
    return;
  }
  activeOperatorCtx = {
    username: op.username || op.email.split('@')[0] || 'operador',
    name: op.name,
    role: op.role,
  };
}

export function getActiveOperatorContext() {
  return activeOperatorCtx;
}

const VALID_ROLES: UserRole[] = ['admin', 'gerente', 'cajero', 'almacen', 'contador'];

function normalizeAllowedModules(input: unknown, role: UserRole): ModuleKey[] {
  if (Array.isArray(input)) {
    const valid = input.filter((m): m is ModuleKey =>
      typeof m === 'string' && ALL_MODULE_KEYS.includes(m as ModuleKey)
    );
    return Array.from(new Set(valid));
  }
  return [...(ROLE_DEFAULT_MODULES[role] || ROLE_DEFAULT_MODULES.cajero)];
}

function sanitizeUser(u: any): UserProfile {
  const role: UserRole = VALID_ROLES.includes(u.role) ? u.role : 'cajero';
  return {
    id: Number(u.id),
    uid: String(u.uid || ''),
    username: u.username || (u.email ? String(u.email).split('@')[0] : `user${u.id}`),
    email: String(u.email || ''),
    name: String(u.name || ''),
    role,
    allowedModules: normalizeAllowedModules(u.allowedModules, role),
    hasPassword: Boolean(u.passwordHash && u.passwordSalt),
    lastLoginAt: u.lastLoginAt || null,
    branchId: u.branchId ?? 1,
    isActive: u.isActive !== false,
  };
}

async function listCollection<T extends { id: number }>(colName: ColName): Promise<Array<T & { _docId: string }>> {
  requireUid();
  const q = query(collection(db, colName), limit(5000));

  const mapSnap = (snap: any) =>
    snap.docs.map((d: any) => {
      const data = d.data() as any;
      return {
        ...data,
        _docId: d.id,
        createdAt: data.createdAt ? toIsoString(data.createdAt) : undefined,
        updatedAt: data.updatedAt ? toIsoString(data.updatedAt) : undefined,
      } as T & { _docId: string };
    });

  if (isOfflineNow()) {
    try {
      const cachedSnap = await getDocsFromCache(q);
      return mapSnap(cachedSnap);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, colName);
    }
  }

  try {
    const snap = await getDocs(q);
    return mapSnap(snap);
  } catch (err: any) {
    // Graceful offline cache fallback when network drops mid-request
    const msg = String(err?.message || err?.code || '').toLowerCase();
    if (msg.includes('offline') || msg.includes('unavailable') || msg.includes('network')) {
      try {
        const cachedSnap = await getDocsFromCache(q);
        return mapSnap(cachedSnap);
      } catch {
        // Fall through to standard error handler
      }
    }
    handleFirestoreError(err, OperationType.LIST, colName);
  }
}

async function createDoc<T extends Record<string, any>>(
  colName: ColName,
  numericId: number,
  payload: T
): Promise<T & { id: number }> {
  const uid = requireUid();
  const idStr = docIdFor(colName, uid, numericId);
  const fullData: Record<string, any> = {
    ...payload,
    id: numericId,
    ownerUid: uid,
    createdAt: serverTimestamp(),
  };
  if (colName === 'products') {
    fullData.updatedAt = serverTimestamp();
  }
  try {
    const writePromise = setDoc(doc(db, colName, idStr), fullData);
    if (isOfflineNow()) {
      // Queue in IndexedDB immediately so POS & ERP keep operating offline without blocking
      trackPendingWrite(writePromise);
    } else {
      await writePromise;
      markSyncedNow();
    }
    return {
      ...payload,
      id: numericId,
      createdAt: new Date().toISOString(),
    } as T & { id: number };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${colName}/${idStr}`);
  }
}

async function patchDoc(colName: ColName, docId: string, updates: Record<string, any>): Promise<void> {
  try {
    const finalUpdates = colName === 'products' ? { ...updates, updatedAt: serverTimestamp() } : updates;
    const writePromise = updateDoc(doc(db, colName, docId), finalUpdates);
    if (isOfflineNow()) {
      trackPendingWrite(writePromise);
    } else {
      await writePromise;
      markSyncedNow();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${colName}/${docId}`);
  }
}

async function removeDoc(colName: ColName, docId: string): Promise<void> {
  try {
    const writePromise = deleteDoc(doc(db, colName, docId));
    if (isOfflineNow()) {
      trackPendingWrite(writePromise);
    } else {
      await writePromise;
      markSyncedNow();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${colName}/${docId}`);
  }
}

const nextIdFrom = (rows: Array<{ id: number }>): number => {
  if (rows.length === 0) return 1;
  return rows.reduce((max, r) => (r.id > max ? r.id : max), 0) + 1;
};

async function recordAuditLog(
  action: string,
  module: string,
  details?: string | null,
  overrideOperator?: { username: string; name: string; role: string }
): Promise<void> {
  try {
    if (!auth.currentUser) return;
    const op = overrideOperator || activeOperatorCtx || {
      username: 'sistema',
      name: 'Sistema ROECA',
      role: 'admin',
    };
    const existingLogs = await listCollection<any>('auditLogs');
    await createDoc('auditLogs', nextIdFrom(existingLogs), {
      operatorUsername: reqStr(op.username, 60, 'sistema'),
      operatorName: reqStr(op.name, 160, 'Sistema ROECA'),
      operatorRole: reqStr(op.role, 40, 'admin'),
      action: reqStr(action, 120),
      module: reqStr(module, 60),
      details: truncate(details, 500),
    });
  } catch (e) {
    console.warn('[ROECA Audit] Could not record audit log:', e);
  }
}

const DEFAULT_OPERATOR_SPECS: Array<{
  username: string;
  initialKey: string;
  name: string;
  email: string;
  role: UserRole;
  allowedModules: ModuleKey[];
}> = [
  {
    username: 'admin',
    initialKey: 'admin123',
    name: 'Administrador General',
    email: 'admin@distribuidoraroeca.com',
    role: 'admin',
    allowedModules: [...ALL_MODULE_KEYS],
  },
  {
    username: 'gerente',
    initialKey: 'gerente123',
    name: 'Administradora / Gerente',
    email: 'gerente@distribuidoraroeca.com',
    role: 'gerente',
    allowedModules: [...ROLE_DEFAULT_MODULES.gerente],
  },
  {
    username: 'caja',
    initialKey: 'caja123',
    name: 'Operador de Caja',
    email: 'caja@distribuidoraroeca.com',
    role: 'cajero',
    allowedModules: [...ROLE_DEFAULT_MODULES.cajero],
  },
];

let ensureOperatorsPromise: Promise<void> | null = null;

export async function ensureDefaultOperators(): Promise<void> {
  if (!auth.currentUser) return;
  if (ensureOperatorsPromise) return ensureOperatorsPromise;

  ensureOperatorsPromise = (async () => {
    try {
      const existingUsers = await listCollection<any>('users');
      let nextId = nextIdFrom(existingUsers);

      for (const spec of DEFAULT_OPERATOR_SPECS) {
        const found = existingUsers.find(
          (u) =>
            normalizeText(u.username || '') === spec.username ||
            normalizeText(u.email || '') === spec.email
        );

        if (!found) {
          const { hash, salt } = await hashPassword(spec.initialKey);
          const created = await createDoc('users', nextId++, {
            uid: `op-${spec.username}-roeca`,
            username: spec.username,
            email: spec.email,
            name: spec.name,
            role: spec.role,
            passwordHash: hash,
            passwordSalt: salt,
            allowedModules: spec.allowedModules,
            lastLoginAt: null,
            branchId: 1,
            isActive: true,
          });
          existingUsers.push({ ...created, _docId: docIdFor('users', requireUid(), created.id) });
        } else if (!found.passwordHash || !found.passwordSalt || !found.username) {
          const { hash, salt } = await hashPassword(spec.initialKey);
          await patchDoc('users', found._docId, {
            username: found.username || spec.username,
            passwordHash: found.passwordHash || hash,
            passwordSalt: found.passwordSalt || salt,
            allowedModules: Array.isArray(found.allowedModules)
              ? found.allowedModules
              : spec.allowedModules,
          });
        }
      }
    } catch (e) {
      console.warn('[ROECA Auth] Error ensuring default operators:', e);
    } finally {
      ensureOperatorsPromise = null;
    }
  })();

  return ensureOperatorsPromise;
}

// Prevent duplicate concurrent auto-seeding runs
let seedingPromise: Promise<{ seeded: boolean; summary: string }> | null = null;
const seededUids = new Set<string>();

export async function seedMeridaTucaniData(force = false): Promise<{ seeded: boolean; summary: string }> {
  const uid = requireUid();
  if (!force && seededUids.has(uid)) {
    return { seeded: false, summary: 'Los datos de Mérida / Tucaní ya fueron cargados.' };
  }
  if (seedingPromise) return seedingPromise;

  seedingPromise = (async () => {
    try {
      const [
        existingRates,
        existingBranches,
        existingZones,
        existingCategories,
        existingProducts,
        existingClients,
        existingSuppliers,
        existingSales,
        existingPurchases,
      ] = await Promise.all([
        listCollection<any>('exchangeRates'),
        listCollection<any>('branches'),
        listCollection<any>('zones'),
        listCollection<any>('categories'),
        listCollection<any>('products'),
        listCollection<any>('clients'),
        listCollection<any>('suppliers'),
        listCollection<any>('sales'),
        listCollection<any>('purchases'),
      ]);

      // Ensure the 3 default operators (admin, gerente, caja) always exist with hashed credentials
      await ensureDefaultOperators();

      // If not forced and user already has products, clients, and zones, mark seeded and exit quickly
      if (!force && existingProducts.length >= 10 && existingClients.length >= 5 && existingZones.length >= 4) {
        seededUids.add(uid);
        return { seeded: false, summary: 'Catálogo ya disponible.' };
      }

      const today = todayStr();

      // 1. Exchange rate
      let activeRate = MERIDA_TUCANI_SEED.exchangeRate.rate;
      if (existingRates.length === 0) {
        try {
          const liveRes = await nativeFetch('/api/bcv-live');
          if (liveRes.ok) {
            const liveJson = await liveRes.json();
            if (liveJson?.rate && Number(liveJson.rate) > 0) {
              activeRate = Number(liveJson.rate);
            }
          }
        } catch {
          // keep reference rate
        }
        await createDoc('exchangeRates', 1, {
          rate: activeRate,
          date: today,
          source: MERIDA_TUCANI_SEED.exchangeRate.source,
        });
      } else {
        const sortedRates = [...existingRates].sort((a, b) => b.id - a.id);
        activeRate = sortedRates[0].rate;
      }

      // 2. Branches
      let nextBranchId = nextIdFrom(existingBranches);
      let mainBranchId = existingBranches.find((b) => b.isMain)?.id || existingBranches[0]?.id || 1;
      for (const b of MERIDA_TUCANI_SEED.branches) {
        const exists = existingBranches.find((x) => normalizeText(x.code) === normalizeText(b.code));
        if (!exists) {
          const id = nextBranchId++;
          await createDoc('branches', id, {
            code: b.code,
            name: b.name,
            address: b.address,
            phone: b.phone,
            isMain: b.isMain,
          });
          if (b.isMain) mainBranchId = id;
        }
      }

      // 3. Zones (Mérida / Tucaní / Zulia)
      let nextZoneId = nextIdFrom(existingZones);
      const zoneByCode = new Map<string, { id: number; name: string; state: string }>();
      existingZones.forEach((z) => zoneByCode.set(z.code.toUpperCase(), { id: z.id, name: z.name, state: z.state }));
      let zonesAdded = 0;
      for (const z of MERIDA_TUCANI_SEED.zones) {
        const existing = existingZones.find((x) => normalizeText(x.code) === normalizeText(z.code));
        if (!existing) {
          const id = nextZoneId++;
          await createDoc('zones', id, {
            code: z.code,
            name: z.name,
            state: z.state,
            description: z.description,
            isActive: true,
          });
          zoneByCode.set(z.code.toUpperCase(), { id, name: z.name, state: z.state });
          zonesAdded++;
        }
      }

      // 4. Categories
      let nextCatId = nextIdFrom(existingCategories);
      const catByName = new Map<string, number>();
      existingCategories.forEach((c) => catByName.set(normalizeText(c.name), c.id));
      for (const c of MERIDA_TUCANI_SEED.categories) {
        const key = normalizeText(c.name);
        if (!catByName.has(key)) {
          const id = nextCatId++;
          await createDoc('categories', id, {
            name: c.name,
            description: c.description,
          });
          catByName.set(key, id);
        }
      }

      // 5. Products
      let nextProdId = nextIdFrom(existingProducts);
      const prodByCode = new Map<string, { id: number; code: string; name: string; priceUsd: number; costUsd: number }>();
      existingProducts.forEach((p) => prodByCode.set(p.code, p));
      let productsAdded = 0;
      for (const p of MERIDA_TUCANI_SEED.products) {
        if (!prodByCode.has(p.code)) {
          const id = nextProdId++;
          await createDoc('products', id, {
            code: p.code,
            name: p.name,
            description: `${p.name} - Distribución Mérida / Tucaní`,
            categoryId: catByName.get(normalizeText(p.category)) || 1,
            unit: p.unit,
            costUsd: p.costUsd,
            priceUsd: p.priceUsd,
            stock: p.stock,
            minStock: p.minStock,
            branchId: mainBranchId,
            imageUrl: null,
          });
          prodByCode.set(p.code, { id, code: p.code, name: p.name, priceUsd: p.priceUsd, costUsd: p.costUsd });
          productsAdded++;
        }
      }

      // 6. Clients
      let nextClientId = nextIdFrom(existingClients);
      const clientByDoc = new Map<string, { id: number; docId: string; currentBalanceUsd: number; creditDays: number }>();
      existingClients.forEach((c) =>
        clientByDoc.set(normalizeText(c.idDoc), {
          id: c.id,
          docId: c._docId,
          currentBalanceUsd: Number(c.currentBalanceUsd) || 0,
          creditDays: Number(c.creditDays) || 7,
        })
      );
      let clientsAdded = 0;
      for (const c of MERIDA_TUCANI_SEED.clients) {
        const key = normalizeText(c.idDoc);
        if (!clientByDoc.has(key)) {
          const id = nextClientId++;
          const zInfo = zoneByCode.get(c.zoneCode.toUpperCase());
          await createDoc('clients', id, {
            idDoc: c.idDoc,
            name: c.name,
            phone: c.phone,
            email: c.email,
            address: c.address,
            state: zInfo?.state || c.state,
            zoneId: zInfo?.id || null,
            zoneName: zInfo?.name || null,
            creditEnabled: c.creditEnabled,
            creditDays: c.creditDays,
            isSuspended: c.isSuspended,
            creditRating: c.creditRating,
            onTimePaymentsCount: c.onTimePaymentsCount,
            latePaymentsCount: c.latePaymentsCount,
            veryLatePaymentsCount: c.veryLatePaymentsCount,
            creditLimitUsd: c.creditLimitUsd,
            currentBalanceUsd: 0,
            branchId: mainBranchId,
          });
          clientByDoc.set(key, {
            id,
            docId: docIdFor('clients', uid, id),
            currentBalanceUsd: 0,
            creditDays: c.creditDays,
          });
          clientsAdded++;
        }
      }

      // 7. Suppliers
      let nextSupId = nextIdFrom(existingSuppliers);
      const supByDoc = new Map<string, { id: number; docId: string; currentBalanceUsd: number }>();
      existingSuppliers.forEach((s) =>
        supByDoc.set(normalizeText(s.idDoc), {
          id: s.id,
          docId: s._docId,
          currentBalanceUsd: Number(s.currentBalanceUsd) || 0,
        })
      );
      let suppliersAdded = 0;
      for (const s of MERIDA_TUCANI_SEED.suppliers) {
        const key = normalizeText(s.idDoc);
        if (!supByDoc.has(key)) {
          const id = nextSupId++;
          const zInfo = zoneByCode.get(s.zoneCode.toUpperCase());
          await createDoc('suppliers', id, {
            idDoc: s.idDoc,
            name: s.name,
            contactPerson: s.contactPerson,
            phone: s.phone,
            email: s.email,
            address: s.address,
            state: zInfo?.state || s.state,
            zoneId: zInfo?.id || null,
            zoneName: zInfo?.name || null,
            currentBalanceUsd: 0,
          });
          supByDoc.set(key, {
            id,
            docId: docIdFor('suppliers', uid, id),
            currentBalanceUsd: 0,
          });
          suppliersAdded++;
        }
      }

      // 8. Sample Sales & Sale Items
      const existingSaleItems = await listCollection<any>('saleItems');
      const existingPayments = await listCollection<any>('payments');
      let nextSaleId = nextIdFrom(existingSales);
      let nextSaleItemId = nextIdFrom(existingSaleItems);
      let nextPayId = nextIdFrom(existingPayments);
      let salesAdded = 0;

      for (const s of MERIDA_TUCANI_SEED.sales) {
        if (existingSales.some((x) => normalizeText(x.invoiceNumber) === normalizeText(s.invoiceNumber))) continue;
        const cl = clientByDoc.get(normalizeText(s.clientDoc));
        if (!cl) continue;

        let totalUsd = 0;
        const resolvedItems: Array<{ prod: { id: number; code: string; name: string; priceUsd: number }; qty: number; sub: number }> = [];
        for (const it of s.items) {
          const prod = prodByCode.get(it.code);
          if (!prod) continue;
          const sub = Math.round(it.qty * prod.priceUsd * 100) / 100;
          totalUsd += sub;
          resolvedItems.push({ prod, qty: it.qty, sub });
        }
        totalUsd = Math.round(totalUsd * 100) / 100;
        const totalVes = Math.round(totalUsd * activeRate * 100) / 100;
        const amountPaidUsd = s.paymentType === 'contado' ? totalUsd : Math.min(totalUsd, Math.max(0, s.paidUsd));
        const balanceDueUsd = Math.max(0, Math.round((totalUsd - amountPaidUsd) * 100) / 100);
        const status = balanceDueUsd <= 0.01 ? 'pagada' : amountPaidUsd > 0 ? 'parcial' : 'pendiente';

        const saleId = nextSaleId++;
        await createDoc('sales', saleId, {
          invoiceNumber: s.invoiceNumber,
          clientId: cl.id,
          branchId: mainBranchId,
          cashierUid: uid,
          date: today,
          dueDate: s.paymentType === 'credito' ? addDaysToDateStr(today, cl.creditDays || 7) : null,
          paymentType: s.paymentType,
          status,
          exchangeRate: activeRate,
          totalUsd,
          totalVes,
          amountPaidUsd,
          balanceDueUsd,
          notes: s.notes,
        });

        for (const ri of resolvedItems) {
          await createDoc('saleItems', nextSaleItemId++, {
            saleId,
            productId: ri.prod.id,
            productName: ri.prod.name,
            productCode: ri.prod.code,
            quantity: ri.qty,
            unitPriceUsd: ri.prod.priceUsd,
            subtotalUsd: ri.sub,
          });
        }

        if (amountPaidUsd > 0) {
          await createDoc('payments', nextPayId++, {
            type: 'cliente_abono',
            saleId,
            purchaseId: null,
            clientId: cl.id,
            supplierId: null,
            amountOriginal: s.paymentType === 'contado' ? Math.round(amountPaidUsd * activeRate * 100) / 100 : amountPaidUsd,
            currency: s.paymentType === 'contado' ? 'VES' : 'USD',
            exchangeRate: activeRate,
            amountUsd: amountPaidUsd,
            amountVes: Math.round(amountPaidUsd * activeRate * 100) / 100,
            paymentMethod: s.paymentType === 'contado' ? 'pago_movil' : 'efectivo_usd',
            bank: s.paymentType === 'contado' ? 'Banco de Venezuela' : 'Caja Dólares',
            reference: s.paymentType === 'contado' ? 'PM-884129' : 'EFEC-001',
            notes: s.paymentType === 'contado' ? 'Pago completo contado' : 'Abono inicial en dólares BCV',
            cashierUid: uid,
          });
        }

        if (balanceDueUsd > 0.01) {
          cl.currentBalanceUsd = Math.round((cl.currentBalanceUsd + balanceDueUsd) * 100) / 100;
          await patchDoc('clients', cl.docId, { currentBalanceUsd: cl.currentBalanceUsd });
        }
        salesAdded++;
      }

      // 9. Sample Purchases & Purchase Items
      const existingPurItems = await listCollection<any>('purchaseItems');
      let nextPurId = nextIdFrom(existingPurchases);
      let nextPurItemId = nextIdFrom(existingPurItems);
      let purchasesAdded = 0;

      for (const pur of MERIDA_TUCANI_SEED.purchases) {
        if (existingPurchases.some((x) => normalizeText(x.invoiceNumber) === normalizeText(pur.invoiceNumber))) continue;
        const sup = supByDoc.get(normalizeText(pur.supplierDoc));
        if (!sup) continue;

        let totalUsd = 0;
        const resolvedItems: Array<{ prod: { id: number; name: string; costUsd: number }; qty: number; sub: number }> = [];
        for (const it of pur.items) {
          const prod = prodByCode.get(it.code);
          if (!prod) continue;
          const sub = Math.round(it.qty * prod.costUsd * 100) / 100;
          totalUsd += sub;
          resolvedItems.push({ prod, qty: it.qty, sub });
        }
        totalUsd = Math.round(totalUsd * 100) / 100;
        const amountPaidUsd = pur.paymentType === 'contado' ? totalUsd : Math.min(totalUsd, Math.max(0, pur.paidUsd));
        const balanceDueUsd = Math.max(0, Math.round((totalUsd - amountPaidUsd) * 100) / 100);
        const status = balanceDueUsd <= 0.01 ? 'pagada' : amountPaidUsd > 0 ? 'parcial' : 'pendiente';

        const purId = nextPurId++;
        await createDoc('purchases', purId, {
          invoiceNumber: pur.invoiceNumber,
          supplierId: sup.id,
          branchId: mainBranchId,
          date: today,
          paymentType: pur.paymentType,
          status,
          exchangeRate: activeRate,
          totalUsd,
          amountPaidUsd,
          balanceDueUsd,
          notes: pur.notes,
        });

        for (const ri of resolvedItems) {
          await createDoc('purchaseItems', nextPurItemId++, {
            purchaseId: purId,
            productId: ri.prod.id,
            productName: ri.prod.name,
            quantity: ri.qty,
            unitCostUsd: ri.prod.costUsd,
            subtotalUsd: ri.sub,
          });
        }

        if (amountPaidUsd > 0) {
          await createDoc('payments', nextPayId++, {
            type: 'proveedor_pago',
            saleId: null,
            purchaseId: purId,
            clientId: null,
            supplierId: sup.id,
            amountOriginal: Math.round(amountPaidUsd * activeRate * 100) / 100,
            currency: 'VES',
            exchangeRate: activeRate,
            amountUsd: amountPaidUsd,
            amountVes: Math.round(amountPaidUsd * activeRate * 100) / 100,
            paymentMethod: 'transferencia',
            bank: 'Banesco',
            reference: `TRF-${Math.floor(100000 + Math.random() * 899999)}`,
            notes: pur.paymentType === 'contado' ? `Pago de contado (${pur.invoiceNumber})` : `Abono parcial (${pur.invoiceNumber})`,
            cashierUid: uid,
          });
        }

        if (balanceDueUsd > 0.01) {
          sup.currentBalanceUsd = Math.round((sup.currentBalanceUsd + balanceDueUsd) * 100) / 100;
          await patchDoc('suppliers', sup.docId, { currentBalanceUsd: sup.currentBalanceUsd });
        }
        purchasesAdded++;
      }

      seededUids.add(uid);
      return {
        seeded: true,
        summary: `Cargados ${zonesAdded} zonas, ${productsAdded} productos, ${clientsAdded} clientes, ${suppliersAdded} proveedores, ${salesAdded} facturas de venta y ${purchasesAdded} compras de Mérida / Tucaní.`,
      };
    } finally {
      seedingPromise = null;
    }
  })();

  return seedingPromise;
}

// =========================================================================
// UNIFIED FIRESTORE API ROUTER (INTERCEPTS /api/* CALLS CLIENT-SIDE)
// =========================================================================
function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getCurrentRate(): Promise<number> {
  const rates = await listCollection<any>('exchangeRates');
  if (rates.length === 0) return MERIDA_TUCANI_SEED.exchangeRate.rate;
  rates.sort((a, b) => b.id - a.id);
  return Number(rates[0].rate) || MERIDA_TUCANI_SEED.exchangeRate.rate;
}

async function handleApiRequest(urlStr: string, init?: RequestInit): Promise<Response> {
  const url = new URL(urlStr, window.location.origin);
  const path = url.pathname;
  const method = (init?.method || 'GET').toUpperCase();
  const params = url.searchParams;

  let body: any = {};
  if (init?.body && typeof init.body === 'string') {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = {};
    }
  }

  // Pass through stateless BCV live proxy to Express server
  if (path === '/api/bcv-live') {
    return nativeFetch(urlStr, init);
  }

  // Ensure Firebase workspace session is active before querying Firestore
  if (!auth.currentUser) {
    return jsonResp({ error: 'Base de datos en espera de conexión. Reintente en unos segundos.' }, 401);
  }

  try {
    // ---------------------------------------------------------------------
    // SEED MERIDA / TUCANI ON DEMAND
    // ---------------------------------------------------------------------
    if (path === '/api/seed/merida-tucani' && method === 'POST') {
      const res = await seedMeridaTucaniData(true);
      return jsonResp(res);
    }

    // ---------------------------------------------------------------------
    // 1. EXCHANGE RATES
    // ---------------------------------------------------------------------
    if (path === '/api/exchange-rate' && method === 'GET') {
      const rates = await listCollection<any>('exchangeRates');
      rates.sort((a, b) => b.id - a.id);
      if (rates.length > 0) {
        return jsonResp(rates[0]);
      }
      const created = await createDoc('exchangeRates', 1, {
        rate: MERIDA_TUCANI_SEED.exchangeRate.rate,
        date: todayStr(),
        source: MERIDA_TUCANI_SEED.exchangeRate.source,
      });
      return jsonResp(created);
    }

    if (path === '/api/exchange-rates' && method === 'GET') {
      const rates = await listCollection<any>('exchangeRates');
      rates.sort((a, b) => b.id - a.id);
      return jsonResp(rates.slice(0, 30));
    }

    if (path === '/api/exchange-rate' && method === 'POST') {
      const rateNum = Number(body.rate);
      if (!rateNum || isNaN(rateNum) || rateNum <= 0) {
        return jsonResp({ error: 'La tasa de cambio debe ser un número positivo válido' }, 400);
      }
      const rates = await listCollection<any>('exchangeRates');
      const created = await createDoc('exchangeRates', nextIdFrom(rates), {
        rate: Math.round(rateNum * 10000) / 10000,
        date: todayStr(),
        source: reqStr(body.source, 120, 'BCV Oficial'),
      });
      void recordAuditLog('Actualización de tasa de cambio', 'exchange', `Nueva tasa: Bs. ${rateNum.toFixed(2)} / $ (${created.source})`);
      return jsonResp(created);
    }

    if (path === '/api/exchange-rate/sync-bcv' && method === 'POST') {
      try {
        const liveRes = await nativeFetch('/api/bcv-live');
        if (liveRes.ok) {
          const live = await liveRes.json();
          if (live?.success && Number(live.rate) > 0) {
            const rates = await listCollection<any>('exchangeRates');
            const latest = [...rates].sort((a, b) => b.id - a.id)[0];
            if (!latest || Math.abs(latest.rate - Number(live.rate)) > 0.0001 || latest.date !== live.date) {
              await createDoc('exchangeRates', nextIdFrom(rates), {
                rate: Number(live.rate),
                date: reqStr(live.date, 20, todayStr()),
                source: reqStr(live.source, 120, 'Banco Central de Venezuela (BCV Oficial)'),
              });
            }
            return jsonResp({
              success: true,
              rate: Number(live.rate),
              date: live.date || todayStr(),
              source: live.source || 'Banco Central de Venezuela (BCV Oficial)',
              updated: true,
              message: `Tasa oficial BCV sincronizada: Bs. ${Number(live.rate).toFixed(2)} / $`,
            });
          }
        }
      } catch {
        // Fallback below
      }
      const current = await getCurrentRate();
      return jsonResp({
        success: false,
        rate: current,
        error: 'No se pudo consultar el servicio externo del BCV en este momento. Puede ingresar la tasa manualmente.',
      }, 503);
    }

    // ---------------------------------------------------------------------
    // 2. BRANCHES
    // ---------------------------------------------------------------------
    if (path === '/api/branches' && method === 'GET') {
      const list = await listCollection<any>('branches');
      list.sort((a, b) => a.id - b.id);
      return jsonResp(list);
    }

    if (path === '/api/branches' && method === 'POST') {
      const code = reqStr(body.code, 40);
      const name = reqStr(body.name, 160);
      if (!code || !name) return jsonResp({ error: 'Código y nombre de sucursal requeridos' }, 400);
      const list = await listCollection<any>('branches');
      const dupCode = list.find((b) => normalizeText(b.code) === normalizeText(code));
      if (dupCode) return jsonResp({ error: `El código de sucursal "${code}" ya existe (${dupCode.name}).` }, 400);
      const dupName = list.find((b) => normalizeText(b.name) === normalizeText(name));
      if (dupName) return jsonResp({ error: `Ya existe una sucursal llamada "${name}".` }, 400);

      const created = await createDoc('branches', nextIdFrom(list), {
        code,
        name,
        address: truncate(body.address, 300),
        phone: truncate(body.phone, 40),
        isMain: Boolean(body.isMain),
      });
      return jsonResp(created, 201);
    }

    // ---------------------------------------------------------------------
    // 3. CATEGORIES
    // ---------------------------------------------------------------------
    if (path === '/api/categories' && method === 'GET') {
      const list = await listCollection<any>('categories');
      list.sort((a, b) => a.name.localeCompare(b.name));
      return jsonResp(list);
    }

    if (path === '/api/categories' && method === 'POST') {
      const name = reqStr(body.name, 120);
      if (!name) return jsonResp({ error: 'El nombre de la categoría es obligatorio' }, 400);
      const list = await listCollection<any>('categories');
      if (list.some((c) => normalizeText(c.name) === normalizeText(name))) {
        return jsonResp({ error: `La categoría "${name}" ya existe.` }, 400);
      }
      const created = await createDoc('categories', nextIdFrom(list), {
        name,
        description: truncate(body.description, 300),
      });
      return jsonResp(created, 201);
    }

    const catMatch = path.match(/^\/api\/categories\/(\d+)$/);
    if (catMatch) {
      const id = Number(catMatch[1]);
      const list = await listCollection<any>('categories');
      const target = list.find((c) => c.id === id);
      if (!target) return jsonResp({ error: 'Categoría no encontrada' }, 404);

      if (method === 'PUT') {
        const name = reqStr(body.name, 120);
        if (!name) return jsonResp({ error: 'El nombre de la categoría es obligatorio' }, 400);
        if (list.some((c) => c.id !== id && normalizeText(c.name) === normalizeText(name))) {
          return jsonResp({ error: `Ya existe otra categoría llamada "${name}".` }, 400);
        }
        const updates: Record<string, any> = { name };
        if (body.description !== undefined) updates.description = truncate(body.description, 300);
        await patchDoc('categories', target._docId, updates);
        return jsonResp({ ...target, ...updates });
      }
      if (method === 'DELETE') {
        const prods = await listCollection<any>('products');
        const used = prods.find((p) => p.categoryId === id);
        if (used) {
          return jsonResp({ error: `No se puede eliminar esta categoría porque está asignada a "${used.name}".` }, 400);
        }
        await removeDoc('categories', target._docId);
        return jsonResp({ message: 'Categoría eliminada' });
      }
    }

    // ---------------------------------------------------------------------
    // 4. ZONES & STATES
    // ---------------------------------------------------------------------
    if (path === '/api/zones' && method === 'GET') {
      const list = await listCollection<any>('zones');
      list.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
      return jsonResp(list);
    }

    if (path === '/api/zones' && method === 'POST') {
      const code = reqStr(body.code, 40).toUpperCase();
      const name = reqStr(body.name, 140);
      const state = reqStr(body.state, 80);
      if (!code || !name || !state) {
        return jsonResp({ error: 'Código, nombre de zona y estado son obligatorios' }, 400);
      }
      const list = await listCollection<any>('zones');
      const dupCode = list.find((z) => normalizeText(z.code) === normalizeText(code));
      if (dupCode) {
        return jsonResp({ error: `El código de zona "${code}" ya existe (${dupCode.name} · ${dupCode.state}).` }, 400);
      }
      const dupNameState = list.find(
        (z) => normalizeText(z.name) === normalizeText(name) && normalizeText(z.state) === normalizeText(state)
      );
      if (dupNameState) {
        return jsonResp({ error: `La zona "${name}" en el estado "${state}" ya está registrada.` }, 400);
      }
      const created = await createDoc('zones', nextIdFrom(list), {
        code,
        name,
        state,
        description: truncate(body.description, 300),
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      });
      return jsonResp(created, 201);
    }

    const zoneMatch = path.match(/^\/api\/zones\/(\d+)$/);
    if (zoneMatch) {
      const id = Number(zoneMatch[1]);
      const list = await listCollection<any>('zones');
      const target = list.find((z) => z.id === id);
      if (!target) return jsonResp({ error: 'Zona no encontrada' }, 404);

      if (method === 'PUT') {
        const updates: Record<string, any> = {};
        if (body.code !== undefined) {
          const code = reqStr(body.code, 40).toUpperCase();
          if (list.some((z) => z.id !== id && normalizeText(z.code) === normalizeText(code))) {
            return jsonResp({ error: `El código "${code}" ya pertenece a otra zona.` }, 400);
          }
          updates.code = code;
        }
        if (body.name !== undefined) updates.name = reqStr(body.name, 140);
        if (body.state !== undefined) updates.state = reqStr(body.state, 80);
        if (body.description !== undefined) updates.description = truncate(body.description, 300);
        if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
        await patchDoc('zones', target._docId, updates);
        return jsonResp({ ...target, ...updates });
      }
      if (method === 'DELETE') {
        await removeDoc('zones', target._docId);
        return jsonResp({ message: 'Zona eliminada' });
      }
    }

    // ---------------------------------------------------------------------
    // 5. PRODUCTS
    // ---------------------------------------------------------------------
    if (path === '/api/products' && method === 'GET') {
      const [prods, cats] = await Promise.all([
        listCollection<any>('products'),
        listCollection<any>('categories'),
      ]);
      const catMap = new Map(cats.map((c) => [c.id, c.name]));

      const search = params.get('search') || '';
      const categoryId = params.get('categoryId');
      const branchId = params.get('branchId');
      const lowStockOnly = params.get('lowStockOnly') === 'true';

      let result = prods.map((p) => ({
        ...p,
        categoryName: p.categoryId ? catMap.get(p.categoryId) || null : null,
      }));

      if (search) {
        const q = normalizeText(search);
        result = result.filter((p) => normalizeText(p.name).includes(q) || normalizeText(p.code).includes(q));
      }
      if (categoryId && !isNaN(Number(categoryId))) {
        result = result.filter((p) => p.categoryId === Number(categoryId));
      }
      if (branchId && !isNaN(Number(branchId))) {
        result = result.filter((p) => p.branchId === Number(branchId));
      }
      if (lowStockOnly) {
        result = result.filter((p) => p.stock <= p.minStock);
      }

      result.sort((a, b) => a.name.localeCompare(b.name));
      return jsonResp(result);
    }

    if (path === '/api/products' && method === 'POST') {
      const code = reqStr(cleanProductCode(body.code), 64);
      const name = reqStr(body.name, 200);
      if (!code || !name || body.priceUsd === undefined) {
        return jsonResp({ error: 'Código, nombre y precio son obligatorios' }, 400);
      }
      const list = await listCollection<any>('products');
      const dupCode = list.find((p) => normalizeText(cleanProductCode(p.code)) === normalizeText(code));
      if (dupCode) return jsonResp({ error: `El código "${code}" ya pertenece a "${dupCode.name}".` }, 400);
      const dupName = list.find((p) => normalizeProductName(p.name) === normalizeProductName(name));
      if (dupName) return jsonResp({ error: `Ya existe un producto llamado "${name}" (${dupName.code}).` }, 400);

      const created = await createDoc('products', nextIdFrom(list), {
        code,
        name,
        description: truncate(body.description, 400),
        categoryId: body.categoryId ? Number(body.categoryId) : null,
        unit: reqStr(body.unit, 40, 'unidad'),
        costUsd: Math.round(Math.max(0, Number(body.costUsd) || 0) * 100) / 100,
        priceUsd: Math.round(Math.max(0, Number(body.priceUsd) || 0) * 100) / 100,
        stock: Math.max(0, Number(body.stock) || 0),
        minStock: Math.max(0, Number(body.minStock) || 10),
        branchId: body.branchId ? Number(body.branchId) : 1,
        imageUrl: truncate(body.imageUrl, 500),
      });
      return jsonResp(created, 201);
    }

    if (path === '/api/products/bulk-import' && method === 'POST') {
      const items: any[] = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) {
        return jsonResp({ error: 'No se recibieron productos para importar.' }, 400);
      }

      const mode: 'upsert' | 'skip_existing' =
        body.mode === 'skip_existing' ? 'skip_existing' : 'upsert';
      const defaultBranchId = body.branchId ? Number(body.branchId) : 1;
      const defaultCategoryId = body.defaultCategoryId ? Number(body.defaultCategoryId) : null;
      const uid = requireUid();

      const [existingProducts, existingCategories] = await Promise.all([
        listCollection<any>('products'),
        listCollection<any>('categories'),
      ]);

      // Map existing products by normalized clean code and normalized description
      const prodByCode = new Map<string, any>();
      const prodByName = new Map<string, any>();
      for (const p of existingProducts) {
        const cKey = normalizeText(cleanProductCode(p.code));
        if (cKey && !prodByCode.has(cKey)) prodByCode.set(cKey, p);
        const nKey = normalizeProductName(p.name);
        if (nKey && !prodByName.has(nKey)) prodByName.set(nKey, p);
      }

      // Map existing categories by normalized name
      const catByName = new Map<string, number>();
      for (const c of existingCategories) {
        catByName.set(normalizeText(c.name), c.id);
      }
      let nextCatId = nextIdFrom(existingCategories);
      const newCategoryOps: Array<{ docId: string; data: Record<string, any> }> = [];

      const resolveCategoryId = (rawCatName: unknown): number | null => {
        const cleaned = truncate(rawCatName, 120);
        if (!cleaned) return defaultCategoryId;
        const key = normalizeText(cleaned);
        if (catByName.has(key)) return catByName.get(key)!;
        const newId = nextCatId++;
        catByName.set(key, newId);
        newCategoryOps.push({
          docId: docIdFor('categories', uid, newId),
          data: {
            id: newId,
            name: cleaned,
            description: null,
            ownerUid: uid,
            createdAt: serverTimestamp(),
          },
        });
        return newId;
      };

      // Deduplicate within the uploaded file:
      // 1) Strip leading apostrophes from code
      // 2) Keep only ONE row per unique code and per unique description
      const dedupedItems: any[] = [];
      const seenCodes = new Set<string>();
      const seenNames = new Set<string>();
      let skipped = 0;

      for (const raw of items) {
        const code = reqStr(cleanProductCode(raw?.code), 64);
        const name = reqStr(raw?.name, 200);
        if (!code || !name) {
          skipped++;
          continue;
        }
        const codeKey = normalizeText(code);
        const nameKey = normalizeProductName(name);
        if (seenCodes.has(codeKey) || seenNames.has(nameKey)) {
          skipped++;
          continue;
        }
        seenCodes.add(codeKey);
        seenNames.add(nameKey);
        dedupedItems.push({ ...raw, code, name });
      }

      let nextProdId = nextIdFrom(existingProducts);
      let created = 0;
      let updated = 0;
      const touchedExistingDocIds = new Set<string>();

      type BatchOp =
        | { type: 'set'; col: ColName; docId: string; data: Record<string, any> }
        | { type: 'update'; col: ColName; docId: string; data: Record<string, any> };

      const ops: BatchOp[] = [];

      for (const item of dedupedItems) {
        const code = reqStr(cleanProductCode(item.code), 64);
        const name = reqStr(item.name, 200);
        const codeKey = normalizeText(code);
        const nameKey = normalizeProductName(name);
        const costUsd = Math.max(0, Number(item.costUsd) || 0);
        const priceUsd = Math.max(0, Number(item.priceUsd) || 0);
        const hasStock = item.stock !== undefined && item.stock !== null && item.stock !== '';
        const hasMinStock = item.minStock !== undefined && item.minStock !== null && item.minStock !== '';
        const hasUnit = item.unit !== undefined && item.unit !== null && String(item.unit).trim() !== '';
        const hasCategory = item.categoryName !== undefined && item.categoryName !== null && String(item.categoryName).trim() !== '';
        const hasDescription = item.description !== undefined && item.description !== null && String(item.description).trim() !== '';

        const existingByCode = prodByCode.get(codeKey);
        const existingByName = prodByName.get(nameKey);
        const existing = existingByCode || existingByName;

        if (existing) {
          if (mode === 'skip_existing' || touchedExistingDocIds.has(existing._docId)) {
            skipped++;
            continue;
          }
          touchedExistingDocIds.add(existing._docId);
          const updates: Record<string, any> = {
            name,
            costUsd: Math.round(costUsd * 100) / 100,
            priceUsd: Math.round(priceUsd * 100) / 100,
            updatedAt: serverTimestamp(),
          };
          // Also clean leading apostrophe if the stored code had one
          const existingCleanCode = reqStr(cleanProductCode(existing.code), 64);
          if (existingCleanCode && existingCleanCode !== existing.code) {
            updates.code = existingCleanCode;
          }
          if (hasStock) updates.stock = Math.max(0, Number(item.stock) || 0);
          if (hasMinStock) updates.minStock = Math.max(0, Number(item.minStock) || 0);
          if (hasUnit) updates.unit = reqStr(item.unit, 40, existing.unit || 'unidad');
          if (hasCategory) updates.categoryId = resolveCategoryId(item.categoryName);
          if (hasDescription) updates.description = truncate(item.description, 400);

          ops.push({
            type: 'update',
            col: 'products',
            docId: existing._docId,
            data: updates,
          });
          updated++;
        } else {
          const newId = nextProdId++;
          const resolvedCatId = hasCategory ? resolveCategoryId(item.categoryName) : defaultCategoryId;
          const docData: Record<string, any> = {
            id: newId,
            code,
            name,
            description: hasDescription ? truncate(item.description, 400) : null,
            categoryId: resolvedCatId,
            unit: hasUnit ? reqStr(item.unit, 40, 'unidad') : 'unidad',
            costUsd: Math.round(costUsd * 100) / 100,
            priceUsd: Math.round(priceUsd * 100) / 100,
            stock: hasStock ? Math.max(0, Number(item.stock) || 0) : 0,
            minStock: hasMinStock ? Math.max(0, Number(item.minStock) || 10) : 10,
            branchId: defaultBranchId,
            imageUrl: null,
            ownerUid: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          ops.push({
            type: 'set',
            col: 'products',
            docId: docIdFor('products', uid, newId),
            data: docData,
          });
          prodByCode.set(codeKey, docData);
          prodByName.set(nameKey, docData);
          created++;
        }
      }

      // Prepend any newly created categories before products
      const allOps: BatchOp[] = [
        ...newCategoryOps.map((c) => ({
          type: 'set' as const,
          col: 'categories' as ColName,
          docId: c.docId,
          data: c.data,
        })),
        ...ops,
      ];

      // Commit in Firestore batches of 400 (safely under Firestore's 500-op batch limit)
      const CHUNK_SIZE = 400;
      for (let i = 0; i < allOps.length; i += CHUNK_SIZE) {
        const chunk = allOps.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const op of chunk) {
          const ref = doc(db, op.col, op.docId);
          if (op.type === 'set') {
            batch.set(ref, op.data);
          } else {
            batch.update(ref, op.data);
          }
        }
        try {
          const commitPromise = batch.commit();
          if (isOfflineNow()) {
            trackPendingWrite(commitPromise);
          } else {
            await commitPromise;
            markSyncedNow();
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'products/bulk-import');
        }
      }

      await recordAuditLog(
        'Importación masiva de inventario',
        'inventory',
        `Archivo procesado: ${created} productos nuevos, ${updated} actualizados, ${skipped} omitidos.`
      );

      return jsonResp({
        created,
        updated,
        skipped,
        categoriesCreated: newCategoryOps.length,
        totalProcessed: created + updated,
      });
    }

    if (path === '/api/products/cleanup' && method === 'POST') {
      const existingProducts = await listCollection<any>('products');

      // Group products by normalized description and keep only ONE per description
      const groupsByName = new Map<string, any[]>();
      for (const p of existingProducts) {
        const nKey = normalizeProductName(p.name) || `__id_${p.id}`;
        const arr = groupsByName.get(nKey) || [];
        arr.push(p);
        groupsByName.set(nKey, arr);
      }

      type CleanupOp =
        | { type: 'update'; docId: string; data: Record<string, any> }
        | { type: 'delete'; docId: string };

      const ops: CleanupOp[] = [];
      let cleanedCodes = 0;
      let removedDuplicates = 0;
      const usedCleanCodes = new Set<string>();

      for (const group of groupsByName.values()) {
        // Choose the best record to keep: highest stock, then clean code (without leading '), then lowest ID
        group.sort((a, b) => {
          const stockDiff = (Number(b.stock) || 0) - (Number(a.stock) || 0);
          if (stockDiff !== 0) return stockDiff;
          const aClean = cleanProductCode(a.code) === String(a.code || '').trim() ? 1 : 0;
          const bClean = cleanProductCode(b.code) === String(b.code || '').trim() ? 1 : 0;
          if (bClean !== aClean) return bClean - aClean;
          return (Number(a.id) || 0) - (Number(b.id) || 0);
        });

        const keeper = group[0];
        const duplicates = group.slice(1);

        for (const dup of duplicates) {
          ops.push({ type: 'delete', docId: dup._docId });
          removedDuplicates++;
        }

        const rawCode = String(keeper.code || '');
        const cleaned = reqStr(cleanProductCode(rawCode), 64);
        const cleanKey = normalizeText(cleaned);

        if (cleaned && cleaned !== rawCode && !usedCleanCodes.has(cleanKey)) {
          ops.push({
            type: 'update',
            docId: keeper._docId,
            data: {
              code: cleaned,
              updatedAt: serverTimestamp(),
            },
          });
          cleanedCodes++;
          usedCleanCodes.add(cleanKey);
        } else if (cleanKey) {
          usedCleanCodes.add(cleanKey);
        }
      }

      const CHUNK_SIZE = 400;
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        const chunk = ops.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const op of chunk) {
          const ref = doc(db, 'products', op.docId);
          if (op.type === 'update') {
            batch.update(ref, op.data);
          } else {
            batch.delete(ref);
          }
        }
        try {
          const commitPromise = batch.commit();
          if (isOfflineNow()) {
            trackPendingWrite(commitPromise);
          } else {
            await commitPromise;
            markSyncedNow();
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'products/cleanup');
        }
      }

      if (cleanedCodes > 0 || removedDuplicates > 0) {
        await recordAuditLog(
          'Limpieza de códigos y duplicados de inventario',
          'inventory',
          `Códigos limpiados (sin '): ${cleanedCodes} · Productos con descripción repetida eliminados: ${removedDuplicates}`
        );
      }

      return jsonResp({
        cleanedCodes,
        removedDuplicates,
        totalFixed: cleanedCodes + removedDuplicates,
      });
    }

    const prodMatch = path.match(/^\/api\/products\/(\d+)$/);
    if (prodMatch) {
      const id = Number(prodMatch[1]);
      const list = await listCollection<any>('products');
      const target = list.find((p) => p.id === id);
      if (!target) return jsonResp({ error: 'Producto no encontrado' }, 404);

      if (method === 'PUT') {
        const updates: Record<string, any> = {};
        if (body.code !== undefined) {
          const code = reqStr(cleanProductCode(body.code), 64);
          if (list.some((p) => p.id !== id && normalizeText(cleanProductCode(p.code)) === normalizeText(code))) {
            return jsonResp({ error: `El código "${code}" ya está asignado a otro producto.` }, 400);
          }
          updates.code = code;
        }
        if (body.name !== undefined) updates.name = reqStr(body.name, 200);
        if (body.description !== undefined) updates.description = truncate(body.description, 400);
        if (body.categoryId !== undefined) updates.categoryId = body.categoryId ? Number(body.categoryId) : null;
        if (body.unit !== undefined) updates.unit = reqStr(body.unit, 40, 'unidad');
        if (body.costUsd !== undefined) updates.costUsd = Math.round(Math.max(0, Number(body.costUsd) || 0) * 100) / 100;
        if (body.priceUsd !== undefined) updates.priceUsd = Math.round(Math.max(0, Number(body.priceUsd) || 0) * 100) / 100;
        if (body.stock !== undefined) updates.stock = Math.max(0, Number(body.stock) || 0);
        if (body.minStock !== undefined) updates.minStock = Math.max(0, Number(body.minStock) || 0);
        if (body.branchId !== undefined) updates.branchId = body.branchId ? Number(body.branchId) : null;
        await patchDoc('products', target._docId, updates);
        return jsonResp({ ...target, ...updates });
      }
      if (method === 'DELETE') {
        await removeDoc('products', target._docId);
        return jsonResp({ message: 'Producto eliminado exitosamente' });
      }
    }

    // ---------------------------------------------------------------------
    // 6. CLIENTS (WITH STATE, ZONE, CREDIT ENABLED, SUSPENSION & RATING)
    // ---------------------------------------------------------------------
    if (path === '/api/clients' && method === 'GET') {
      const [clientsList, salesList] = await Promise.all([
        listCollection<any>('clients'),
        listCollection<any>('sales'),
      ]);
      const today = todayStr();

      // Dynamically reflect open overdue credit invoices in rating if needed
      let result = clientsList.map((c) => {
        const openCreditSales = salesList.filter(
          (s) => s.clientId === c.id && s.paymentType === 'credito' && s.balanceDueUsd > 0.01 && s.status !== 'anulada'
        );
        let maxOverdue = 0;
        for (const s of openCreditSales) {
          const due = s.dueDate || addDaysToDateStr(s.date, c.creditDays || 7);
          const late = daysBetween(due, today);
          if (late > maxOverdue) maxOverdue = late;
        }
        const computed =
          maxOverdue > 0
            ? computeCreditRating({
                onTimeCount: Number(c.onTimePaymentsCount) || 0,
                lateCount: Number(c.latePaymentsCount) || 0,
                veryLateCount: Number(c.veryLatePaymentsCount) || 0,
                maxOpenOverdueDays: maxOverdue,
              })
            : (c.creditRating || 'nuevo');

        return {
          ...c,
          creditEnabled: c.creditEnabled !== undefined ? Boolean(c.creditEnabled) : true,
          creditDays: Number(c.creditDays) || 7,
          isSuspended: Boolean(c.isSuspended),
          useCostPrice: Boolean(c.useCostPrice),
          creditRating: computed,
        };
      });

      const search = params.get('search') || '';
      const withDebtOnly = params.get('withDebtOnly') === 'true';
      if (search) {
        const q = normalizeText(search);
        result = result.filter(
          (c) =>
            normalizeText(c.name).includes(q) ||
            normalizeText(c.idDoc).includes(q) ||
            (c.phone && normalizeText(c.phone).includes(q)) ||
            (c.state && normalizeText(c.state).includes(q)) ||
            (c.zoneName && normalizeText(c.zoneName).includes(q))
        );
      }
      if (withDebtOnly) {
        result = result.filter((c) => c.currentBalanceUsd > 0.05);
      }

      result.sort((a, b) => a.name.localeCompare(b.name));
      return jsonResp(result);
    }

    if (path === '/api/clients' && method === 'POST') {
      const idDoc = reqStr(body.idDoc, 40);
      const name = reqStr(body.name, 200);
      if (!idDoc || !name) return jsonResp({ error: 'Cédula/RIF y Nombre son obligatorios' }, 400);

      const [list, zonesList] = await Promise.all([
        listCollection<any>('clients'),
        listCollection<any>('zones'),
      ]);
      const dupDoc = list.find((c) => normalizeText(c.idDoc) === normalizeText(idDoc));
      if (dupDoc) {
        return jsonResp({ error: `Ya existe un cliente con Cédula/RIF "${idDoc}" (${dupDoc.name}).` }, 400);
      }
      const dupName = list.find((c) => normalizeText(c.name) === normalizeText(name));
      if (dupName) {
        return jsonResp({ error: `Ya existe un cliente registrado con el nombre "${name}".` }, 400);
      }

      const zoneObj = body.zoneId ? zonesList.find((z) => z.id === Number(body.zoneId)) : null;
      const creditEnabled = body.creditEnabled !== undefined ? Boolean(body.creditEnabled) : false;
      const creditDays = creditEnabled ? Math.min(365, Math.max(1, Number(body.creditDays) || 7)) : 0;
      const creditLimitUsd = creditEnabled ? Math.max(0, Number(body.creditLimitUsd) || 0) : 0;

      const created = await createDoc('clients', nextIdFrom(list), {
        idDoc,
        name,
        phone: truncate(body.phone, 40),
        email: truncate(body.email, 160),
        address: truncate(body.address, 350),
        state: truncate(body.state || zoneObj?.state, 80),
        zoneId: zoneObj ? zoneObj.id : body.zoneId ? Number(body.zoneId) : null,
        zoneName: truncate(zoneObj?.name || body.zoneName, 140),
        creditEnabled,
        creditDays,
        isSuspended: Boolean(body.isSuspended),
        useCostPrice: Boolean(body.useCostPrice),
        creditRating: 'nuevo',
        onTimePaymentsCount: 0,
        latePaymentsCount: 0,
        veryLatePaymentsCount: 0,
        creditLimitUsd,
        currentBalanceUsd: 0,
        branchId: body.branchId ? Number(body.branchId) : 1,
      });
      return jsonResp(created, 201);
    }

    const clientMatch = path.match(/^\/api\/clients\/(\d+)$/);
    if (clientMatch) {
      const id = Number(clientMatch[1]);
      const [list, zonesList] = await Promise.all([
        listCollection<any>('clients'),
        listCollection<any>('zones'),
      ]);
      const target = list.find((c) => c.id === id);
      if (!target) return jsonResp({ error: 'Cliente no encontrado' }, 404);

      if (method === 'PUT') {
        const updates: Record<string, any> = {};
        if (body.idDoc !== undefined) {
          const idDoc = reqStr(body.idDoc, 40);
          if (list.some((c) => c.id !== id && normalizeText(c.idDoc) === normalizeText(idDoc))) {
            return jsonResp({ error: `La Cédula/RIF "${idDoc}" ya pertenece a otro cliente.` }, 400);
          }
          updates.idDoc = idDoc;
        }
        if (body.name !== undefined) updates.name = reqStr(body.name, 200);
        if (body.phone !== undefined) updates.phone = truncate(body.phone, 40);
        if (body.email !== undefined) updates.email = truncate(body.email, 160);
        if (body.address !== undefined) updates.address = truncate(body.address, 350);
        if (body.zoneId !== undefined) {
          const zObj = body.zoneId ? zonesList.find((z) => z.id === Number(body.zoneId)) : null;
          updates.zoneId = zObj ? zObj.id : null;
          updates.zoneName = zObj ? zObj.name : truncate(body.zoneName, 140);
          if (zObj && !body.state) updates.state = zObj.state;
        }
        if (body.state !== undefined) updates.state = truncate(body.state, 80);
        if (body.creditEnabled !== undefined) {
          updates.creditEnabled = Boolean(body.creditEnabled);
          if (!updates.creditEnabled) {
            updates.creditLimitUsd = 0;
            updates.creditDays = 0;
          }
        }
        if (body.creditDays !== undefined) {
          updates.creditDays = Math.min(365, Math.max(0, Number(body.creditDays) || 0));
        }
        if (body.creditLimitUsd !== undefined && updates.creditEnabled !== false) {
          updates.creditLimitUsd = Math.max(0, Number(body.creditLimitUsd) || 0);
        }
        if (body.isSuspended !== undefined) updates.isSuspended = Boolean(body.isSuspended);
        if (body.useCostPrice !== undefined) updates.useCostPrice = Boolean(body.useCostPrice);
        if (body.creditRating !== undefined && ['nuevo', 'excelente', 'regular', 'malo'].includes(body.creditRating)) {
          updates.creditRating = body.creditRating;
        }
        await patchDoc('clients', target._docId, updates);
        return jsonResp({ ...target, ...updates });
      }
      if (method === 'DELETE') {
        if (target.currentBalanceUsd > 0.05) {
          return jsonResp({ error: 'No se puede eliminar un cliente con saldo pendiente de pago' }, 400);
        }
        await removeDoc('clients', target._docId);
        return jsonResp({ message: 'Cliente eliminado' });
      }
    }

    // ---------------------------------------------------------------------
    // 7. SUPPLIERS (WITH STATE & ZONE)
    // ---------------------------------------------------------------------
    if (path === '/api/suppliers' && method === 'GET') {
      let list = await listCollection<any>('suppliers');
      const search = params.get('search') || '';
      const withDebtOnly = params.get('withDebtOnly') === 'true';
      if (search) {
        const q = normalizeText(search);
        list = list.filter(
          (s) =>
            normalizeText(s.name).includes(q) ||
            normalizeText(s.idDoc).includes(q) ||
            (s.contactPerson && normalizeText(s.contactPerson).includes(q)) ||
            (s.state && normalizeText(s.state).includes(q)) ||
            (s.zoneName && normalizeText(s.zoneName).includes(q))
        );
      }
      if (withDebtOnly) {
        list = list.filter((s) => s.currentBalanceUsd > 0.05);
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      return jsonResp(list);
    }

    if (path === '/api/suppliers' && method === 'POST') {
      const idDoc = reqStr(body.idDoc, 40);
      const name = reqStr(body.name, 200);
      if (!idDoc || !name) return jsonResp({ error: 'RIF y Nombre de la empresa son requeridos' }, 400);

      const [list, zonesList] = await Promise.all([
        listCollection<any>('suppliers'),
        listCollection<any>('zones'),
      ]);
      const dupDoc = list.find((s) => normalizeText(s.idDoc) === normalizeText(idDoc));
      if (dupDoc) return jsonResp({ error: `Ya existe un proveedor con el RIF "${idDoc}" (${dupDoc.name}).` }, 400);
      const dupName = list.find((s) => normalizeText(s.name) === normalizeText(name));
      if (dupName) return jsonResp({ error: `Ya existe un proveedor con el nombre "${name}".` }, 400);

      const zoneObj = body.zoneId ? zonesList.find((z) => z.id === Number(body.zoneId)) : null;

      const created = await createDoc('suppliers', nextIdFrom(list), {
        idDoc,
        name,
        contactPerson: truncate(body.contactPerson, 160),
        phone: truncate(body.phone, 40),
        email: truncate(body.email, 160),
        address: truncate(body.address, 350),
        state: truncate(body.state || zoneObj?.state, 80),
        zoneId: zoneObj ? zoneObj.id : body.zoneId ? Number(body.zoneId) : null,
        zoneName: truncate(zoneObj?.name || body.zoneName, 140),
        currentBalanceUsd: 0,
      });
      return jsonResp(created, 201);
    }

    const supMatch = path.match(/^\/api\/suppliers\/(\d+)$/);
    if (supMatch) {
      const id = Number(supMatch[1]);
      const [list, zonesList] = await Promise.all([
        listCollection<any>('suppliers'),
        listCollection<any>('zones'),
      ]);
      const target = list.find((s) => s.id === id);
      if (!target) return jsonResp({ error: 'Proveedor no encontrado' }, 404);

      if (method === 'PUT') {
        const updates: Record<string, any> = {};
        if (body.idDoc !== undefined) {
          const idDoc = reqStr(body.idDoc, 40);
          if (list.some((s) => s.id !== id && normalizeText(s.idDoc) === normalizeText(idDoc))) {
            return jsonResp({ error: `El RIF "${idDoc}" ya pertenece a otro proveedor.` }, 400);
          }
          updates.idDoc = idDoc;
        }
        if (body.name !== undefined) updates.name = reqStr(body.name, 200);
        if (body.contactPerson !== undefined) updates.contactPerson = truncate(body.contactPerson, 160);
        if (body.phone !== undefined) updates.phone = truncate(body.phone, 40);
        if (body.email !== undefined) updates.email = truncate(body.email, 160);
        if (body.address !== undefined) updates.address = truncate(body.address, 350);
        if (body.zoneId !== undefined) {
          const zObj = body.zoneId ? zonesList.find((z) => z.id === Number(body.zoneId)) : null;
          updates.zoneId = zObj ? zObj.id : null;
          updates.zoneName = zObj ? zObj.name : truncate(body.zoneName, 140);
          if (zObj && !body.state) updates.state = zObj.state;
        }
        if (body.state !== undefined) updates.state = truncate(body.state, 80);
        await patchDoc('suppliers', target._docId, updates);
        return jsonResp({ ...target, ...updates });
      }
      if (method === 'DELETE') {
        if (target.currentBalanceUsd > 0.05) {
          return jsonResp({ error: 'No se puede eliminar un proveedor con saldo pendiente de pago' }, 400);
        }
        await removeDoc('suppliers', target._docId);
        return jsonResp({ message: 'Proveedor eliminado' });
      }
    }

    // ---------------------------------------------------------------------
    // 8. SALES & POS BILLING
    // ---------------------------------------------------------------------
    if (path === '/api/sales' && method === 'GET') {
      const [salesList, clientsList] = await Promise.all([
        listCollection<any>('sales'),
        listCollection<any>('clients'),
      ]);
      const clientMap = new Map(clientsList.map((c) => [c.id, c]));

      let result = salesList.map((s) => {
        const cl = clientMap.get(s.clientId);
        return {
          ...s,
          clientName: cl?.name || 'Cliente',
          clientIdDoc: cl?.idDoc || '',
          clientEmail: cl?.email || null,
          clientState: cl?.state || null,
          clientZoneName: cl?.zoneName || null,
        };
      });

      const status = params.get('status');
      const paymentType = params.get('paymentType');
      const clientId = params.get('clientId');
      const startDate = params.get('startDate');
      const endDate = params.get('endDate');
      const search = params.get('search');

      if (status && status !== 'todas') result = result.filter((s) => s.status === status);
      if (paymentType && paymentType !== 'todos') result = result.filter((s) => s.paymentType === paymentType);
      if (clientId && !isNaN(Number(clientId))) result = result.filter((s) => s.clientId === Number(clientId));
      if (startDate) result = result.filter((s) => s.date >= startDate);
      if (endDate) result = result.filter((s) => s.date <= endDate);
      if (search) {
        const q = normalizeText(search);
        result = result.filter(
          (s) => normalizeText(s.invoiceNumber).includes(q) || normalizeText(s.clientName).includes(q)
        );
      }

      result.sort((a, b) => b.id - a.id);
      return jsonResp(result);
    }

    const saleMatch = path.match(/^\/api\/sales\/(\d+)$/);
    if (saleMatch && method === 'GET') {
      const id = Number(saleMatch[1]);
      const [salesList, clientsList, itemsList, paymentsList] = await Promise.all([
        listCollection<any>('sales'),
        listCollection<any>('clients'),
        listCollection<any>('saleItems'),
        listCollection<any>('payments'),
      ]);
      const sale = salesList.find((s) => s.id === id);
      if (!sale) return jsonResp({ error: 'Factura no encontrada' }, 404);
      const cl = clientsList.find((c) => c.id === sale.clientId);
      const items = itemsList.filter((i) => i.saleId === id);
      const salePayments = paymentsList.filter((p) => p.saleId === id).sort((a, b) => b.id - a.id);
      return jsonResp({
        ...sale,
        clientName: cl?.name || 'Cliente',
        clientIdDoc: cl?.idDoc || '',
        clientPhone: cl?.phone || '',
        clientEmail: cl?.email || null,
        clientAddress: cl?.address || '',
        clientState: cl?.state || null,
        clientZoneName: cl?.zoneName || null,
        items,
        payments: salePayments,
      });
    }

    if (path === '/api/sales' && method === 'POST') {
      const { clientId, items, paymentType, paymentDetails, paymentsList, notes, branchId } = body;
      if (!clientId || !Array.isArray(items) || items.length === 0) {
        return jsonResp({ error: 'Debe seleccionar un cliente y al menos un producto' }, 400);
      }

      const [clientsList, prodsList, salesList, saleItemsList, existingPayments] = await Promise.all([
        listCollection<any>('clients'),
        listCollection<any>('products'),
        listCollection<any>('sales'),
        listCollection<any>('saleItems'),
        listCollection<any>('payments'),
      ]);

      const client = clientsList.find((c) => c.id === Number(clientId));
      if (!client) return jsonResp({ error: 'El cliente seleccionado no existe' }, 404);

      if (client.isSuspended) {
        return jsonResp(
          { error: `El cliente "${client.name}" está SUSPENDIDO. Debe reactivarlo en el módulo de Clientes antes de facturar.` },
          400
        );
      }

      const isCredit = paymentType === 'credito';
      if (isCredit && client.creditEnabled === false) {
        return jsonResp(
          { error: `El cliente "${client.name}" NO tiene permiso de crédito habilitado. Solo puede facturar de contado.` },
          400
        );
      }

      const currentRate = await getCurrentRate();
      let totalUsd = 0;
      const computedItems = items.map((item: any) => {
        const qty = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPriceUsd) || 0;
        const discountPct = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
        const isExempt = item.isExempt !== undefined ? Boolean(item.isExempt) : true;
        const gross = qty * unitPrice;
        const afterDiscount = gross * (1 - discountPct / 100);
        const ivaAmount = isExempt ? 0 : afterDiscount * 0.16;
        const lineTotalUsd = Math.round((afterDiscount + ivaAmount) * 100) / 100;
        totalUsd += lineTotalUsd;
        return {
          productId: Number(item.productId),
          quantity: qty,
          unitPriceUsd: unitPrice,
          discountPercent: discountPct,
          isExempt,
          lineTotalUsd,
        };
      });
      totalUsd = Math.round(totalUsd * 100) / 100;
      const totalVes = Math.round(totalUsd * currentRate * 100) / 100;

      const normalizedPayments: Array<{
        paymentMethod: string;
        amountOriginal: number;
        currency: 'USD' | 'VES';
        bank?: string | null;
        reference?: string | null;
        notes?: string | null;
      }> = [];

      if (Array.isArray(paymentsList) && paymentsList.length > 0) {
        for (const p of paymentsList) {
          const amt = Number(p.amountOriginal) || 0;
          if (amt > 0) {
            normalizedPayments.push({
              paymentMethod: p.paymentMethod || 'efectivo_usd',
              amountOriginal: amt,
              currency: p.currency === 'VES' ? 'VES' : 'USD',
              bank: p.bank || null,
              reference: p.reference || null,
              notes: p.notes || null,
            });
          }
        }
      } else if (paymentDetails && Number(paymentDetails.amountOriginal) > 0) {
        normalizedPayments.push({
          paymentMethod: paymentDetails.paymentMethod || 'efectivo_usd',
          amountOriginal: Number(paymentDetails.amountOriginal),
          currency: paymentDetails.currency === 'VES' ? 'VES' : 'USD',
          bank: paymentDetails.bank || null,
          reference: paymentDetails.reference || null,
          notes: paymentDetails.notes || null,
        });
      }

      let initialPaidUsd = 0;
      for (const p of normalizedPayments) {
        initialPaidUsd += p.currency === 'VES' ? p.amountOriginal / currentRate : p.amountOriginal;
      }
      initialPaidUsd = Math.round(initialPaidUsd * 100) / 100;

      if (!isCredit && initialPaidUsd > totalUsd + 0.1) {
        return jsonResp(
          { error: `El total abonado ($${initialPaidUsd.toFixed(2)}) supera el monto total de la factura ($${totalUsd.toFixed(2)}).` },
          400
        );
      }

      const balanceDueUsd = Math.max(0, Math.round((totalUsd - initialPaidUsd) * 100) / 100);
      if (isCredit && client.creditLimitUsd > 0 && client.currentBalanceUsd + balanceDueUsd > client.creditLimitUsd + 0.05) {
        const available = Math.max(0, client.creditLimitUsd - client.currentBalanceUsd);
        return jsonResp(
          {
            error: `El monto a crédito ($${balanceDueUsd.toFixed(2)}) supera el crédito disponible del cliente ($${available.toFixed(2)} de $${client.creditLimitUsd.toFixed(2)}).`,
          },
          400
        );
      }

      const saleStatus = balanceDueUsd <= 0.01 ? 'pagada' : initialPaidUsd > 0 ? 'parcial' : 'pendiente';
      const today = todayStr();
      const uid = requireUid();
      const newSaleId = nextIdFrom(salesList);
      const invoiceNumber = `FAC-${String(salesList.length + 101).padStart(5, '0')}`;
      const dueDate = isCredit ? addDaysToDateStr(today, Number(client.creditDays) || 7) : null;

      const createdSale = await createDoc('sales', newSaleId, {
        invoiceNumber,
        clientId: client.id,
        branchId: branchId ? Number(branchId) : 1,
        cashierUid: uid,
        date: today,
        dueDate,
        paymentType: isCredit ? 'credito' : 'contado',
        status: saleStatus,
        exchangeRate: currentRate,
        totalUsd,
        totalVes,
        amountPaidUsd: initialPaidUsd,
        balanceDueUsd,
        notes: truncate(notes, 500),
      });

      let nextItemId = nextIdFrom(saleItemsList);
      for (const item of computedItems) {
        const prod = prodsList.find((p) => p.id === item.productId);
        const tagParts: string[] = [];
        if (item.discountPercent > 0) tagParts.push(`Desc ${item.discountPercent}%`);
        tagParts.push(item.isExempt ? 'Exento' : 'IVA 16%');
        const displayName = prod
          ? `${prod.name}${item.discountPercent > 0 || !item.isExempt ? ` [${tagParts.join(' · ')}]` : ''}`
          : 'Producto';

        await createDoc('saleItems', nextItemId++, {
          saleId: newSaleId,
          productId: item.productId,
          productName: reqStr(displayName, 240, 'Producto'),
          productCode: prod ? prod.code : 'SKU',
          quantity: item.quantity,
          unitPriceUsd: item.unitPriceUsd,
          subtotalUsd: item.lineTotalUsd,
        });

        if (prod) {
          const newStock = Math.max(0, Math.round((prod.stock - item.quantity) * 100) / 100);
          await patchDoc('products', prod._docId, { stock: newStock });
        }
      }

      let nextPayId = nextIdFrom(existingPayments);
      for (const p of normalizedPayments) {
        const amtUsd = p.currency === 'VES' ? p.amountOriginal / currentRate : p.amountOriginal;
        const amtVes = p.currency === 'VES' ? p.amountOriginal : p.amountOriginal * currentRate;
        await createDoc('payments', nextPayId++, {
          type: 'cliente_abono',
          saleId: newSaleId,
          purchaseId: null,
          clientId: client.id,
          supplierId: null,
          amountOriginal: p.amountOriginal,
          currency: p.currency,
          exchangeRate: currentRate,
          amountUsd: Math.round(amtUsd * 100) / 100,
          amountVes: Math.round(amtVes * 100) / 100,
          paymentMethod: p.paymentMethod,
          bank: truncate(p.bank, 100),
          reference: truncate(p.reference, 100),
          notes: truncate(p.notes || `Pago en factura ${invoiceNumber}`, 500),
          cashierUid: uid,
        });
      }

      if (balanceDueUsd > 0.01) {
        const newBal = Math.round(((Number(client.currentBalanceUsd) || 0) + balanceDueUsd) * 100) / 100;
        await patchDoc('clients', client._docId, { currentBalanceUsd: newBal });
      }

      void recordAuditLog(
        'Factura emitida',
        'billing',
        `${invoiceNumber} · Cliente: ${client.name} · Total: $${totalUsd.toFixed(2)} (${isCredit ? 'Crédito' : 'Contado'}${isOfflineNow() ? ' · Modo Offline' : ''})`
      );

      return jsonResp(
        {
          ...createdSale,
          clientName: client.name,
          clientIdDoc: client.idDoc,
          clientEmail: client.email || null,
        },
        201
      );
    }

    // ---------------------------------------------------------------------
    // 9. PURCHASES & MERCHANDISE RECEIVING
    // ---------------------------------------------------------------------
    if (path === '/api/purchases' && method === 'GET') {
      const [purchasesList, suppliersList] = await Promise.all([
        listCollection<any>('purchases'),
        listCollection<any>('suppliers'),
      ]);
      const supMap = new Map(suppliersList.map((s) => [s.id, s]));

      let result = purchasesList.map((p) => {
        const sup = supMap.get(p.supplierId);
        return {
          ...p,
          supplierName: sup?.name || 'Proveedor',
          supplierIdDoc: sup?.idDoc || '',
          supplierState: sup?.state || null,
          supplierZoneName: sup?.zoneName || null,
        };
      });

      const status = params.get('status');
      const supplierId = params.get('supplierId');
      const startDate = params.get('startDate');
      const endDate = params.get('endDate');
      const search = params.get('search');

      if (status && status !== 'todas') result = result.filter((p) => p.status === status);
      if (supplierId && !isNaN(Number(supplierId))) result = result.filter((p) => p.supplierId === Number(supplierId));
      if (startDate) result = result.filter((p) => p.date >= startDate);
      if (endDate) result = result.filter((p) => p.date <= endDate);
      if (search) {
        const q = normalizeText(search);
        result = result.filter(
          (p) => normalizeText(p.invoiceNumber).includes(q) || normalizeText(p.supplierName).includes(q)
        );
      }

      result.sort((a, b) => b.id - a.id);
      return jsonResp(result);
    }

    const purMatch = path.match(/^\/api\/purchases\/(\d+)$/);
    if (purMatch && method === 'GET') {
      const id = Number(purMatch[1]);
      const [purchasesList, suppliersList, itemsList, prodsList, paymentsList] = await Promise.all([
        listCollection<any>('purchases'),
        listCollection<any>('suppliers'),
        listCollection<any>('purchaseItems'),
        listCollection<any>('products'),
        listCollection<any>('payments'),
      ]);
      const purchase = purchasesList.find((p) => p.id === id);
      if (!purchase) return jsonResp({ error: 'Factura de compra no encontrada' }, 404);
      const sup = suppliersList.find((s) => s.id === purchase.supplierId);
      const prodMap = new Map(prodsList.map((p) => [p.id, p]));
      const items = itemsList
        .filter((i) => i.purchaseId === id)
        .map((i) => ({
          ...i,
          productCode: prodMap.get(i.productId)?.code || '',
          productUnit: prodMap.get(i.productId)?.unit || 'unidad',
        }));
      const purchasePayments = paymentsList.filter((p) => p.purchaseId === id).sort((a, b) => b.id - a.id);

      return jsonResp({
        ...purchase,
        supplierName: sup?.name || 'Proveedor',
        supplierIdDoc: sup?.idDoc || '',
        supplierContactPerson: sup?.contactPerson || null,
        supplierPhone: sup?.phone || null,
        supplierAddress: sup?.address || null,
        supplierState: sup?.state || null,
        supplierZoneName: sup?.zoneName || null,
        items,
        payments: purchasePayments,
      });
    }

    if (path === '/api/purchases' && method === 'POST') {
      const {
        hasInvoice = true,
        supplierId,
        manualSupplier,
        invoiceNumber,
        date,
        paymentType,
        initialPayment,
        items,
        notes,
        branchId,
      } = body;

      if (!Array.isArray(items) || items.length === 0) {
        return jsonResp({ error: 'Debe ingresar al menos un producto para cargar al inventario.' }, 400);
      }

      const [suppliersList, zonesList, purchasesList, purchaseItemsList, prodsList, existingPayments] = await Promise.all([
        listCollection<any>('suppliers'),
        listCollection<any>('zones'),
        listCollection<any>('purchases'),
        listCollection<any>('purchaseItems'),
        listCollection<any>('products'),
        listCollection<any>('payments'),
      ]);

      let resolvedSupplier = supplierId ? suppliersList.find((s) => s.id === Number(supplierId)) : null;
      let docOriginTag = '';

      if (hasInvoice === false) {
        const supplierTypeLabels: Record<string, string> = {
          persona_natural: 'SIN FACTURA · Persona Natural',
          firma_personal: 'SIN FACTURA · Firma Personal',
          empresa_manual: 'FACTURACIÓN MANUAL · Empresa',
        };
        const stKey = manualSupplier?.supplierType || 'persona_natural';
        docOriginTag = `[${supplierTypeLabels[stKey] || 'SIN FACTURA'}]`;

        if (!resolvedSupplier) {
          if (!manualSupplier?.idDoc?.trim() || !manualSupplier?.name?.trim()) {
            return jsonResp(
              { error: 'Para cargar mercancía sin factura debe indicar Cédula/RIF y Nombre del proveedor.' },
              400
            );
          }
          const trimmedDoc = reqStr(manualSupplier.idDoc, 40).toUpperCase();
          const trimmedName = reqStr(manualSupplier.name, 200);
          resolvedSupplier =
            suppliersList.find(
              (s) => normalizeText(s.idDoc) === normalizeText(trimmedDoc) || normalizeText(s.name) === normalizeText(trimmedName)
            ) || null;

          if (!resolvedSupplier) {
            const newSupId = nextIdFrom(suppliersList);
            const zObj = manualSupplier.zoneId ? zonesList.find((z) => z.id === Number(manualSupplier.zoneId)) : null;
            const createdSup = await createDoc('suppliers', newSupId, {
              idDoc: trimmedDoc,
              name: trimmedName,
              contactPerson:
                truncate(manualSupplier.contactPerson, 160) ||
                (stKey === 'persona_natural'
                  ? 'Persona Natural'
                  : stKey === 'firma_personal'
                  ? 'Firma Personal'
                  : 'Facturación Manual'),
              phone: truncate(manualSupplier.phone, 40),
              email: truncate(manualSupplier.email, 160),
              address: truncate(manualSupplier.address, 350),
              state: truncate(manualSupplier.state || zObj?.state, 80),
              zoneId: zObj ? zObj.id : null,
              zoneName: truncate(zObj?.name || manualSupplier.zoneName, 140),
              currentBalanceUsd: 0,
            });
            resolvedSupplier = { ...createdSup, _docId: docIdFor('suppliers', requireUid(), newSupId) };
          }
        }
      }

      if (!resolvedSupplier) {
        return jsonResp({ error: 'Debe seleccionar o registrar un proveedor.' }, 400);
      }

      const entryDate = date || todayStr();
      let resolvedInvoiceNumber = reqStr(invoiceNumber, 80);
      if (hasInvoice !== false && !resolvedInvoiceNumber) {
        return jsonResp({ error: 'El N° de factura asociada a la compra es obligatorio.' }, 400);
      }
      if (!resolvedInvoiceNumber) {
        const prefix = manualSupplier?.supplierType === 'empresa_manual' ? 'MAN' : 'SIN-FAC';
        resolvedInvoiceNumber = `${prefix}-${entryDate.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const dupPur = purchasesList.find(
        (p) =>
          p.supplierId === resolvedSupplier!.id &&
          normalizeText(p.invoiceNumber) === normalizeText(resolvedInvoiceNumber)
      );
      if (dupPur) {
        return jsonResp(
          { error: `El documento / factura N° "${resolvedInvoiceNumber}" ya está registrado para este proveedor.` },
          400
        );
      }

      const currentRate = await getCurrentRate();
      let totalUsd = 0;
      let totalUnitsLoaded = 0;
      for (const item of items) {
        const qty = Number(item.quantity);
        const cost = Number(item.unitCostUsd);
        totalUsd += qty * cost;
        totalUnitsLoaded += qty;
      }
      totalUsd = Math.round(totalUsd * 100) / 100;

      const isCredit = paymentType === 'credito';
      let amountPaidUsd = isCredit ? 0 : totalUsd;
      let parsedInitialPayUsd = 0;
      let parsedInitialPayVes = 0;
      let parsedInitialOriginal = 0;
      let parsedInitialCurrency: 'USD' | 'VES' = 'VES';

      if (isCredit && initialPayment && Number(initialPayment.amountOriginal) > 0) {
        parsedInitialOriginal = Number(initialPayment.amountOriginal);
        parsedInitialCurrency = initialPayment.currency === 'USD' ? 'USD' : 'VES';
        parsedInitialPayUsd =
          parsedInitialCurrency === 'USD'
            ? Math.round(parsedInitialOriginal * 100) / 100
            : Math.round((parsedInitialOriginal / currentRate) * 100) / 100;
        parsedInitialPayVes =
          parsedInitialCurrency === 'VES'
            ? Math.round(parsedInitialOriginal * 100) / 100
            : Math.round(parsedInitialOriginal * currentRate * 100) / 100;

        if (parsedInitialPayUsd > totalUsd + 0.05) {
          return jsonResp({ error: 'El abono inicial no puede superar el total de la compra.' }, 400);
        }
        amountPaidUsd = Math.min(totalUsd, parsedInitialPayUsd);
      }

      const balanceDueUsd = Math.max(0, Math.round((totalUsd - amountPaidUsd) * 100) / 100);
      const status = balanceDueUsd <= 0.01 ? 'pagada' : amountPaidUsd > 0.01 ? 'parcial' : 'pendiente';
      const finalNotes = truncate([docOriginTag, (notes || '').trim()].filter(Boolean).join(' · '), 500);

      const newPurId = nextIdFrom(purchasesList);
      const createdPur = await createDoc('purchases', newPurId, {
        invoiceNumber: resolvedInvoiceNumber,
        supplierId: resolvedSupplier.id,
        branchId: branchId ? Number(branchId) : 1,
        date: entryDate,
        paymentType: isCredit ? 'credito' : 'contado',
        status,
        exchangeRate: currentRate,
        totalUsd,
        amountPaidUsd,
        balanceDueUsd,
        notes: finalNotes,
      });

      let nextPurItemId = nextIdFrom(purchaseItemsList);
      for (const item of items) {
        const prod = prodsList.find((p) => p.id === Number(item.productId));
        const qty = Number(item.quantity);
        const unitCost = Number(item.unitCostUsd);
        const subtotalUsd = Math.round(qty * unitCost * 100) / 100;

        await createDoc('purchaseItems', nextPurItemId++, {
          purchaseId: newPurId,
          productId: Number(item.productId),
          productName: prod ? prod.name : 'Producto',
          quantity: qty,
          unitCostUsd: unitCost,
          subtotalUsd,
        });

        if (prod) {
          const upd: Record<string, any> = {
            stock: Math.round((prod.stock + qty) * 100) / 100,
            costUsd: unitCost > 0 ? Math.round(unitCost * 100) / 100 : prod.costUsd,
          };
          if (item.newPriceUsd !== undefined && Number(item.newPriceUsd) > 0) {
            upd.priceUsd = Math.round(Number(item.newPriceUsd) * 100) / 100;
          }
          await patchDoc('products', prod._docId, upd);
        }
      }

      const uid = requireUid();
      let nextPayId = nextIdFrom(existingPayments);
      if (isCredit && parsedInitialPayUsd > 0) {
        await createDoc('payments', nextPayId++, {
          type: 'proveedor_pago',
          saleId: null,
          purchaseId: newPurId,
          clientId: null,
          supplierId: resolvedSupplier.id,
          amountOriginal: parsedInitialOriginal,
          currency: parsedInitialCurrency,
          exchangeRate: currentRate,
          amountUsd: amountPaidUsd,
          amountVes: parsedInitialPayVes,
          paymentMethod: initialPayment.paymentMethod || 'transferencia',
          bank: truncate(initialPayment.bank, 100),
          reference: truncate(initialPayment.reference, 100),
          notes: truncate(initialPayment.notes || `Abono inicial (${resolvedInvoiceNumber})`, 500),
          cashierUid: uid,
        });
      } else if (!isCredit && totalUsd > 0 && initialPayment?.paymentMethod) {
        await createDoc('payments', nextPayId++, {
          type: 'proveedor_pago',
          saleId: null,
          purchaseId: newPurId,
          clientId: null,
          supplierId: resolvedSupplier.id,
          amountOriginal:
            initialPayment.currency === 'USD' ? totalUsd : Math.round(totalUsd * currentRate * 100) / 100,
          currency: initialPayment.currency === 'USD' ? 'USD' : 'VES',
          exchangeRate: currentRate,
          amountUsd: totalUsd,
          amountVes: Math.round(totalUsd * currentRate * 100) / 100,
          paymentMethod: initialPayment.paymentMethod,
          bank: truncate(initialPayment.bank, 100),
          reference: truncate(initialPayment.reference, 100),
          notes: truncate(`Pago de contado (${resolvedInvoiceNumber})`, 500),
          cashierUid: uid,
        });
      }

      if (balanceDueUsd > 0.01) {
        const newBal = Math.round(((Number(resolvedSupplier.currentBalanceUsd) || 0) + balanceDueUsd) * 100) / 100;
        await patchDoc('suppliers', resolvedSupplier._docId, { currentBalanceUsd: newBal });
      }

      void recordAuditLog(
        'Carga de mercancía registrada',
        'receiving',
        `Doc: ${resolvedInvoiceNumber} · Proveedor: ${resolvedSupplier.name} · ${items.length} productos ($${totalUsd.toFixed(2)})`
      );

      return jsonResp(
        {
          ...createdPur,
          supplierName: resolvedSupplier.name,
          supplierIdDoc: resolvedSupplier.idDoc,
          totalItemsCount: items.length,
          totalUnitsLoaded,
        },
        201
      );
    }

    // ---------------------------------------------------------------------
    // 10. PAYMENTS & ABONOS (AUTOMATIC CREDIT RATING EVALUATION)
    // ---------------------------------------------------------------------
    if (path === '/api/payments' && method === 'GET') {
      const [paymentsList, salesList, purchasesList, clientsList, suppliersList] = await Promise.all([
        listCollection<any>('payments'),
        listCollection<any>('sales'),
        listCollection<any>('purchases'),
        listCollection<any>('clients'),
        listCollection<any>('suppliers'),
      ]);

      const saleMap = new Map(salesList.map((s) => [s.id, s]));
      const purMap = new Map(purchasesList.map((p) => [p.id, p]));
      const cliMap = new Map(clientsList.map((c) => [c.id, c]));
      const supMap = new Map(suppliersList.map((s) => [s.id, s]));

      let result = paymentsList.map((p) => ({
        ...p,
        invoiceNumber: p.saleId ? saleMap.get(p.saleId)?.invoiceNumber || null : null,
        purchaseInvoiceNumber: p.purchaseId ? purMap.get(p.purchaseId)?.invoiceNumber || null : null,
        clientName: p.clientId ? cliMap.get(p.clientId)?.name || null : null,
        supplierName: p.supplierId ? supMap.get(p.supplierId)?.name || null : null,
      }));

      const type = params.get('type');
      const saleId = params.get('saleId');
      const purchaseId = params.get('purchaseId');
      const clientId = params.get('clientId');
      const supplierId = params.get('supplierId');
      const paymentMethod = params.get('paymentMethod');

      if (type && type !== 'todos') result = result.filter((p) => p.type === type);
      if (saleId && !isNaN(Number(saleId))) result = result.filter((p) => p.saleId === Number(saleId));
      if (purchaseId && !isNaN(Number(purchaseId))) result = result.filter((p) => p.purchaseId === Number(purchaseId));
      if (clientId && !isNaN(Number(clientId))) result = result.filter((p) => p.clientId === Number(clientId));
      if (supplierId && !isNaN(Number(supplierId))) result = result.filter((p) => p.supplierId === Number(supplierId));
      if (paymentMethod && paymentMethod !== 'todos') result = result.filter((p) => p.paymentMethod === paymentMethod);

      result.sort((a, b) => b.id - a.id);
      return jsonResp(result);
    }

    if (path === '/api/payments/abono' && method === 'POST') {
      const { type, saleId, purchaseId, amountOriginal, currency, paymentMethod, bank, reference, notes, paymentsList } = body;
      if (!type) return jsonResp({ error: 'Tipo de operación requerida' }, 400);

      const currentRate = await getCurrentRate();
      const normalizedPayments: Array<{
        paymentMethod: string;
        amountOriginal: number;
        currency: 'USD' | 'VES';
        bank?: string | null;
        reference?: string | null;
        notes?: string | null;
      }> = [];

      if (Array.isArray(paymentsList) && paymentsList.length > 0) {
        for (const p of paymentsList) {
          const amt = Number(p.amountOriginal) || 0;
          if (amt > 0) {
            normalizedPayments.push({
              paymentMethod: p.paymentMethod || 'pago_movil',
              amountOriginal: amt,
              currency: p.currency === 'USD' ? 'USD' : 'VES',
              bank: p.bank || null,
              reference: p.reference || null,
              notes: p.notes || null,
            });
          }
        }
      } else if (Number(amountOriginal) > 0 && currency && paymentMethod) {
        normalizedPayments.push({
          paymentMethod,
          amountOriginal: Number(amountOriginal),
          currency: currency === 'USD' ? 'USD' : 'VES',
          bank: bank || null,
          reference: reference || null,
          notes: notes || null,
        });
      }

      if (normalizedPayments.length === 0) {
        return jsonResp({ error: 'Debe ingresar al menos un monto de abono mayor a 0.' }, 400);
      }

      let totalPaidUsd = 0;
      for (const p of normalizedPayments) {
        totalPaidUsd += p.currency === 'VES' ? p.amountOriginal / currentRate : p.amountOriginal;
      }
      totalPaidUsd = Math.round(totalPaidUsd * 100) / 100;

      const uid = requireUid();
      const existingPayments = await listCollection<any>('payments');
      let nextPayId = nextIdFrom(existingPayments);

      if (type === 'cliente_abono') {
        if (!saleId) return jsonResp({ error: 'Debe especificar el ID de la factura de venta' }, 400);
        const [salesList, clientsList] = await Promise.all([
          listCollection<any>('sales'),
          listCollection<any>('clients'),
        ]);
        const sale = salesList.find((s) => s.id === Number(saleId));
        if (!sale) return jsonResp({ error: 'Factura no encontrada' }, 404);
        if (sale.balanceDueUsd <= 0.001) return jsonResp({ error: 'Esta factura ya está completamente pagada' }, 400);
        if (totalPaidUsd > sale.balanceDueUsd + 0.1) {
          return jsonResp(
            { error: `El total abonado ($${totalPaidUsd.toFixed(2)}) supera el saldo pendiente ($${sale.balanceDueUsd.toFixed(2)}).` },
            400
          );
        }

        const appliedUsd = Math.min(sale.balanceDueUsd, totalPaidUsd);
        const newPaidUsd = Math.round((sale.amountPaidUsd + appliedUsd) * 100) / 100;
        const newBalanceUsd = Math.max(0, Math.round((sale.totalUsd - newPaidUsd) * 100) / 100);
        const newStatus = newBalanceUsd <= 0.01 ? 'pagada' : 'parcial';

        await patchDoc('sales', sale._docId, {
          amountPaidUsd: newPaidUsd,
          balanceDueUsd: newBalanceUsd,
          status: newStatus,
        });

        const client = clientsList.find((c) => c.id === sale.clientId);
        let updatedRating: CreditRating = client?.creditRating || 'nuevo';
        if (client) {
          const newClientBalance = Math.max(0, Math.round((client.currentBalanceUsd - appliedUsd) * 100) / 100);
          let onTimeCount = Number(client.onTimePaymentsCount) || 0;
          let lateCount = Number(client.latePaymentsCount) || 0;
          let veryLateCount = Number(client.veryLatePaymentsCount) || 0;

          // Evaluate payment punctuality vs invoice dueDate / client creditDays
          const dueDate = sale.dueDate || addDaysToDateStr(sale.date, Number(client.creditDays) || 7);
          const daysLate = daysBetween(dueDate, todayStr());
          if (daysLate <= 0) {
            onTimeCount += 1;
          } else if (daysLate <= 7) {
            lateCount += 1;
          } else {
            veryLateCount += 1;
          }

          updatedRating = computeCreditRating({
            onTimeCount,
            lateCount,
            veryLateCount,
          });

          await patchDoc('clients', client._docId, {
            currentBalanceUsd: newClientBalance,
            creditRating: updatedRating,
            onTimePaymentsCount: onTimeCount,
            latePaymentsCount: lateCount,
            veryLatePaymentsCount: veryLateCount,
          });
        }

        const insertedPayments = [];
        for (const p of normalizedPayments) {
          const amtUsd = p.currency === 'VES' ? p.amountOriginal / currentRate : p.amountOriginal;
          const amtVes = p.currency === 'VES' ? p.amountOriginal : p.amountOriginal * currentRate;
          const createdPay = await createDoc('payments', nextPayId++, {
            type: 'cliente_abono',
            saleId: sale.id,
            purchaseId: null,
            clientId: sale.clientId,
            supplierId: null,
            amountOriginal: p.amountOriginal,
            currency: p.currency,
            exchangeRate: currentRate,
            amountUsd: Math.round(amtUsd * 100) / 100,
            amountVes: Math.round(amtVes * 100) / 100,
            paymentMethod: p.paymentMethod,
            bank: truncate(p.bank, 100),
            reference: truncate(p.reference, 100),
            notes: truncate(p.notes || `Abono a factura ${sale.invoiceNumber}`, 500),
            cashierUid: uid,
          });
          insertedPayments.push(createdPay);
        }

        void recordAuditLog(
          'Abono de cliente registrado',
          'cxc',
          `Factura ${sale.invoiceNumber} · Abono $${appliedUsd.toFixed(2)} · Saldo restante $${newBalanceUsd.toFixed(2)}`
        );

        return jsonResp(
          {
            payment: insertedPayments[0],
            payments: insertedPayments,
            saleStatus: newStatus,
            remainingBalanceUsd: newBalanceUsd,
            clientCreditRating: updatedRating,
          },
          201
        );
      }

      if (type === 'proveedor_pago') {
        if (!purchaseId) return jsonResp({ error: 'Debe especificar el ID de la factura de compra' }, 400);
        const [purchasesList, suppliersList] = await Promise.all([
          listCollection<any>('purchases'),
          listCollection<any>('suppliers'),
        ]);
        const purchase = purchasesList.find((p) => p.id === Number(purchaseId));
        if (!purchase) return jsonResp({ error: 'Factura de compra no encontrada' }, 404);
        if (purchase.balanceDueUsd <= 0.001) return jsonResp({ error: 'Esta factura ya está liquidada' }, 400);
        if (totalPaidUsd > purchase.balanceDueUsd + 0.1) {
          return jsonResp(
            { error: `El total abonado ($${totalPaidUsd.toFixed(2)}) supera el saldo deudor ($${purchase.balanceDueUsd.toFixed(2)}).` },
            400
          );
        }

        const appliedUsd = Math.min(purchase.balanceDueUsd, totalPaidUsd);
        const newPaidUsd = Math.round((purchase.amountPaidUsd + appliedUsd) * 100) / 100;
        const newBalanceUsd = Math.max(0, Math.round((purchase.totalUsd - newPaidUsd) * 100) / 100);
        const newStatus = newBalanceUsd <= 0.01 ? 'pagada' : 'parcial';

        await patchDoc('purchases', purchase._docId, {
          amountPaidUsd: newPaidUsd,
          balanceDueUsd: newBalanceUsd,
          status: newStatus,
        });

        const sup = suppliersList.find((s) => s.id === purchase.supplierId);
        if (sup) {
          const newBal = Math.max(0, Math.round((sup.currentBalanceUsd - appliedUsd) * 100) / 100);
          await patchDoc('suppliers', sup._docId, { currentBalanceUsd: newBal });
        }

        const insertedPayments = [];
        for (const p of normalizedPayments) {
          const amtUsd = p.currency === 'VES' ? p.amountOriginal / currentRate : p.amountOriginal;
          const amtVes = p.currency === 'VES' ? p.amountOriginal : p.amountOriginal * currentRate;
          const createdPay = await createDoc('payments', nextPayId++, {
            type: 'proveedor_pago',
            saleId: null,
            purchaseId: purchase.id,
            clientId: null,
            supplierId: purchase.supplierId,
            amountOriginal: p.amountOriginal,
            currency: p.currency,
            exchangeRate: currentRate,
            amountUsd: Math.round(amtUsd * 100) / 100,
            amountVes: Math.round(amtVes * 100) / 100,
            paymentMethod: p.paymentMethod,
            bank: truncate(p.bank, 100),
            reference: truncate(p.reference, 100),
            notes: truncate(p.notes || `Pago a proveedor - Factura ${purchase.invoiceNumber}`, 500),
            cashierUid: uid,
          });
          insertedPayments.push(createdPay);
        }

        void recordAuditLog(
          'Pago a proveedor registrado',
          'cxp',
          `Factura ${purchase.invoiceNumber} · Pago $${appliedUsd.toFixed(2)} · Saldo restante $${newBalanceUsd.toFixed(2)}`
        );

        return jsonResp(
          {
            payment: insertedPayments[0],
            payments: insertedPayments,
            purchaseStatus: newStatus,
            remainingBalanceUsd: newBalanceUsd,
          },
          201
        );
      }

      return jsonResp({ error: 'Tipo de pago no válido' }, 400);
    }

    // ---------------------------------------------------------------------
    // 11. DASHBOARD STATS (EXECUTIVE METRICS & ALERTS)
    // ---------------------------------------------------------------------
    if (path === '/api/dashboard/stats' && method === 'GET') {
      const [
        salesList,
        saleItemsList,
        purchasesList,
        clientsList,
        suppliersList,
        prodsList,
        paymentsList,
        currentRate,
      ] = await Promise.all([
        listCollection<any>('sales'),
        listCollection<any>('saleItems'),
        listCollection<any>('purchases'),
        listCollection<any>('clients'),
        listCollection<any>('suppliers'),
        listCollection<any>('products'),
        listCollection<any>('payments'),
        getCurrentRate(),
      ]);

      const today = todayStr();
      const ym = today.substring(0, 7);
      const cliMap = new Map(clientsList.map((c) => [c.id, c]));
      const supMap = new Map(suppliersList.map((s) => [s.id, s]));
      const prodMap = new Map(prodsList.map((p) => [p.id, p]));

      // Exclude annulled sales from revenue and profit calculations
      const validSales = salesList.filter((s) => s.status !== 'anulada');
      const salesToday = validSales.filter((s) => s.date === today);
      const salesMonth = validSales.filter((s) => String(s.date).startsWith(ym));

      const salesTodayUsd = Math.round(salesToday.reduce((acc, s) => acc + (Number(s.totalUsd) || 0), 0) * 100) / 100;
      const salesMonthUsd = Math.round(salesMonth.reduce((acc, s) => acc + (Number(s.totalUsd) || 0), 0) * 100) / 100;

      // Group sale items by saleId for fast COGS and top-product calculations
      const itemsBySaleId = new Map<number, any[]>();
      for (const it of saleItemsList) {
        const sid = Number(it.saleId);
        const bucket = itemsBySaleId.get(sid);
        if (bucket) bucket.push(it);
        else itemsBySaleId.set(sid, [it]);
      }

      // Compute COGS & net profit for today and current month
      const computeSalesCogs = (targetSales: any[]): number => {
        let cogs = 0;
        for (const s of targetSales) {
          const sItems = itemsBySaleId.get(Number(s.id)) || [];
          for (const it of sItems) {
            const prod = prodMap.get(Number(it.productId));
            const qty = Number(it.quantity) || 0;
            const unitCost = Number(prod?.costUsd) || 0;
            cogs += qty * unitCost;
          }
        }
        return Math.round(cogs * 100) / 100;
      };

      const cogsTodayUsd = computeSalesCogs(salesToday);
      const netProfitTodayUsd = Math.round((salesTodayUsd - cogsTodayUsd) * 100) / 100;

      const cogsMonthUsd = computeSalesCogs(salesMonth);
      const netProfitMonthUsd = Math.round((salesMonthUsd - cogsMonthUsd) * 100) / 100;
      const netProfitMarginPct =
        salesMonthUsd > 0 ? Math.round((netProfitMonthUsd / salesMonthUsd) * 1000) / 10 : 0;

      // Best-selling products (prefer current month; fall back to historical if no items this month)
      const aggregateTopProducts = (targetSales: any[]) => {
        const agg = new Map<
          string,
          {
            productId: number;
            productCode: string;
            productName: string;
            unit: string;
            unitsSold: number;
            revenueUsd: number;
            profitUsd: number;
            currentStock: number;
          }
        >();

        for (const s of targetSales) {
          const sItems = itemsBySaleId.get(Number(s.id)) || [];
          for (const it of sItems) {
            const pid = Number(it.productId) || 0;
            const prod = prodMap.get(pid);
            const code = prod?.code || cleanProductCode(it.productCode || `SKU-${pid}`);
            const key = pid > 0 ? `id:${pid}` : `code:${normalizeText(code)}`;
            const cleanName = prod?.name || String(it.productName || 'Producto').replace(/\s*\[[^\]]+\]\s*$/, '').trim();
            const qty = Number(it.quantity) || 0;
            const rev = Number(it.subtotalUsd) || qty * (Number(it.unitPriceUsd) || 0);
            const cost = qty * (Number(prod?.costUsd) || 0);
            const prof = rev - cost;

            const existing = agg.get(key);
            if (existing) {
              existing.unitsSold = Math.round((existing.unitsSold + qty) * 100) / 100;
              existing.revenueUsd = Math.round((existing.revenueUsd + rev) * 100) / 100;
              existing.profitUsd = Math.round((existing.profitUsd + prof) * 100) / 100;
            } else {
              agg.set(key, {
                productId: pid,
                productCode: code,
                productName: cleanName,
                unit: prod?.unit || 'Unidad',
                unitsSold: Math.round(qty * 100) / 100,
                revenueUsd: Math.round(rev * 100) / 100,
                profitUsd: Math.round(prof * 100) / 100,
                currentStock: Number(prod?.stock) || 0,
              });
            }
          }
        }

        return Array.from(agg.values()).sort(
          (a, b) => b.unitsSold - a.unitsSold || b.revenueUsd - a.revenueUsd
        );
      };

      const monthTopProducts = aggregateTopProducts(salesMonth);
      const topProductScope: 'mes' | 'historico' = monthTopProducts.length > 0 ? 'mes' : 'historico';
      const topProducts = (monthTopProducts.length > 0 ? monthTopProducts : aggregateTopProducts(validSales)).slice(0, 5);
      const topProduct = topProducts[0] || null;

      // Low-stock inventory alerts (sorted: out-of-stock first, then steepest deficit ratio)
      const lowStockAll = prodsList
        .filter((p) => (Number(p.stock) || 0) <= (Number(p.minStock) || 0))
        .map((p) => {
          const stock = Number(p.stock) || 0;
          const minStock = Number(p.minStock) || 0;
          return {
            id: p.id,
            code: p.code,
            name: p.name,
            unit: p.unit || 'Unidad',
            stock,
            minStock,
            costUsd: Number(p.costUsd) || 0,
            priceUsd: Number(p.priceUsd) || 0,
            deficit: Math.max(0, Math.round((minStock - stock) * 100) / 100),
          };
        })
        .sort((a, b) => {
          const aZero = a.stock <= 0 ? 0 : 1;
          const bZero = b.stock <= 0 ? 0 : 1;
          if (aZero !== bZero) return aZero - bZero;
          const aRatio = a.stock / Math.max(1, a.minStock);
          const bRatio = b.stock / Math.max(1, b.minStock);
          return aRatio - bRatio || b.deficit - a.deficit;
        });

      const lowStockCount = lowStockAll.length;
      const outOfStockCount = lowStockAll.filter((p) => p.stock <= 0).length;
      const lowStockProducts = lowStockAll.slice(0, 12);

      // Accounts Receivable (CxC) approaching due date or overdue
      const openReceivables = validSales
        .filter((s) => (Number(s.balanceDueUsd) || 0) > 0.01)
        .map((s) => {
          const cl = cliMap.get(s.clientId);
          const dueDate = s.dueDate || addDaysToDateStr(s.date, Number(cl?.creditDays) || 7);
          const daysUntilDue = daysBetween(today, dueDate);
          return {
            id: s.id,
            invoiceNumber: s.invoiceNumber,
            clientId: s.clientId,
            clientName: cl?.name || 'Cliente',
            date: s.date,
            dueDate,
            daysUntilDue,
            totalUsd: Number(s.totalUsd) || 0,
            balanceDueUsd: Math.round((Number(s.balanceDueUsd) || 0) * 100) / 100,
            status: s.status,
          };
        })
        .sort((a, b) => a.daysUntilDue - b.daysUntilDue || b.balanceDueUsd - a.balanceDueUsd);

      const overdueReceivables = openReceivables.filter((r) => r.daysUntilDue < 0);
      const dueSoonReceivables = openReceivables.filter((r) => r.daysUntilDue >= 0 && r.daysUntilDue <= 7);
      const cxcOverdueCount = overdueReceivables.length;
      const cxcOverdueUsd = Math.round(overdueReceivables.reduce((acc, r) => acc + r.balanceDueUsd, 0) * 100) / 100;
      const cxcDueSoonCount = dueSoonReceivables.length;
      const cxcDueSoonUsd = Math.round(dueSoonReceivables.reduce((acc, r) => acc + r.balanceDueUsd, 0) * 100) / 100;
      const upcomingReceivables = openReceivables.slice(0, 12);

      // Accounts Payable (CxP) approaching due date or overdue
      const openPayables = purchasesList
        .filter((p) => p.status !== 'anulada' && (Number(p.balanceDueUsd) || 0) > 0.01)
        .map((p) => {
          const sup = supMap.get(p.supplierId);
          const hasExplicitDueDate = Boolean(p.dueDate);
          const dueDate = p.dueDate || addDaysToDateStr(p.date, 15);
          const daysUntilDue = daysBetween(today, dueDate);
          return {
            id: p.id,
            invoiceNumber: p.invoiceNumber,
            supplierId: p.supplierId,
            supplierName: sup?.name || 'Proveedor',
            date: p.date,
            dueDate,
            daysUntilDue,
            totalUsd: Number(p.totalUsd) || 0,
            balanceDueUsd: Math.round((Number(p.balanceDueUsd) || 0) * 100) / 100,
            status: p.status,
            isEstimatedDueDate: !hasExplicitDueDate,
          };
        })
        .sort((a, b) => a.daysUntilDue - b.daysUntilDue || b.balanceDueUsd - a.balanceDueUsd);

      const overduePayables = openPayables.filter((p) => p.daysUntilDue < 0);
      const dueSoonPayables = openPayables.filter((p) => p.daysUntilDue >= 0 && p.daysUntilDue <= 7);
      const cxpOverdueCount = overduePayables.length;
      const cxpOverdueUsd = Math.round(overduePayables.reduce((acc, p) => acc + p.balanceDueUsd, 0) * 100) / 100;
      const cxpDueSoonCount = dueSoonPayables.length;
      const cxpDueSoonUsd = Math.round(dueSoonPayables.reduce((acc, p) => acc + p.balanceDueUsd, 0) * 100) / 100;
      const upcomingPayables = openPayables.slice(0, 12);

      // 14-day revenue & net profit trend
      const dailyTrend: Array<{ date: string; label: string; salesUsd: number; profitUsd: number; count: number }> = [];
      const baseDate = new Date(`${today}T12:00:00Z`);
      const salesByDate = new Map<string, any[]>();
      for (const s of validSales) {
        const dKey = String(s.date || '').slice(0, 10);
        const bucket = salesByDate.get(dKey);
        if (bucket) bucket.push(s);
        else salesByDate.set(dKey, [s]);
      }

      for (let i = 13; i >= 0; i--) {
        const d = new Date(baseDate.getTime());
        d.setUTCDate(d.getUTCDate() - i);
        const iso = d.toISOString().split('T')[0];
        const dayNum = String(d.getUTCDate()).padStart(2, '0');
        const monthShort = d.toLocaleDateString('es-VE', { month: 'short', timeZone: 'UTC' }).replace('.', '');
        const daySales = salesByDate.get(iso) || [];
        const dayTotalUsd = Math.round(daySales.reduce((acc, s) => acc + (Number(s.totalUsd) || 0), 0) * 100) / 100;
        const dayCogsUsd = computeSalesCogs(daySales);
        const dayProfitUsd = Math.round((dayTotalUsd - dayCogsUsd) * 100) / 100;
        dailyTrend.push({
          date: iso,
          label: `${dayNum} ${monthShort}`,
          salesUsd: dayTotalUsd,
          profitUsd: dayProfitUsd,
          count: daySales.length,
        });
      }

      const cxcTotalUsd = Math.round(clientsList.reduce((acc, c) => acc + (Number(c.currentBalanceUsd) || 0), 0) * 100) / 100;
      const cxcDebtorsCount = clientsList.filter((c) => c.currentBalanceUsd > 0.05).length;

      const cxpTotalUsd = Math.round(suppliersList.reduce((acc, s) => acc + (Number(s.currentBalanceUsd) || 0), 0) * 100) / 100;
      const cxpCreditorsCount = suppliersList.filter((s) => s.currentBalanceUsd > 0.05).length;

      const incomePays = paymentsList.filter((p) => p.type === 'cliente_abono');
      const expensePays = paymentsList.filter((p) => p.type === 'proveedor_pago');

      const incomeUsd = incomePays.reduce((acc, p) => acc + (Number(p.amountUsd) || 0), 0);
      const incomeVes = incomePays.reduce((acc, p) => acc + (Number(p.amountVes) || 0), 0);
      const expenseUsd = expensePays.reduce((acc, p) => acc + (Number(p.amountUsd) || 0), 0);
      const expenseVes = expensePays.reduce((acc, p) => acc + (Number(p.amountVes) || 0), 0);

      const recentSales = [...salesList]
        .sort((a, b) => b.id - a.id)
        .slice(0, 5)
        .map((s) => ({
          id: s.id,
          invoiceNumber: s.invoiceNumber,
          clientName: cliMap.get(s.clientId)?.name || 'Cliente',
          totalUsd: s.totalUsd,
          status: s.status,
          paymentType: s.paymentType,
          date: s.date,
        }));

      const recentPayments = [...paymentsList]
        .sort((a, b) => b.id - a.id)
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          type: p.type,
          amountUsd: p.amountUsd,
          currency: p.currency,
          amountOriginal: p.amountOriginal,
          paymentMethod: p.paymentMethod,
          reference: p.reference,
          createdAt: p.createdAt || new Date().toISOString(),
        }));

      return jsonResp({
        salesTodayUsd,
        salesTodayCount: salesToday.length,
        netProfitTodayUsd,
        salesMonthUsd,
        salesMonthCount: salesMonth.length,
        cogsMonthUsd,
        netProfitMonthUsd,
        netProfitMarginPct,
        topProductScope,
        topProduct,
        topProducts,
        cxcTotalUsd,
        cxcDebtorsCount,
        cxcOverdueCount,
        cxcOverdueUsd,
        cxcDueSoonCount,
        cxcDueSoonUsd,
        upcomingReceivables,
        cxpTotalUsd,
        cxpCreditorsCount,
        cxpOverdueCount,
        cxpOverdueUsd,
        cxpDueSoonCount,
        cxpDueSoonUsd,
        upcomingPayables,
        lowStockCount,
        outOfStockCount,
        lowStockProducts,
        dailyTrend,
        incomeUsd,
        incomeVes,
        expenseUsd,
        expenseVes,
        netCashFlowUsd: incomeUsd - expenseUsd,
        recentSales,
        recentPayments,
        currentExchangeRate: currentRate,
      });
    }

    // ---------------------------------------------------------------------
    // 11B. CLIENT ANALYTICS (TOP 10 PRODUCTS PER CLIENT & MONTHLY RANKINGS)
    // ---------------------------------------------------------------------
    if (path === '/api/analytics/clients' && method === 'GET') {
      const [salesList, saleItemsList, clientsList, prodsList, currentRate] = await Promise.all([
        listCollection<any>('sales'),
        listCollection<any>('saleItems'),
        listCollection<any>('clients'),
        listCollection<any>('products'),
        getCurrentRate(),
      ]);

      const today = todayStr();
      const currentMonth = today.substring(0, 7);
      const requestedMonth = params.get('month') || currentMonth;

      const validSales = salesList.filter((s) => s.status !== 'anulada');
      const monthSet = new Set<string>([currentMonth]);
      for (const s of validSales) {
        const ym = String(s.date || '').substring(0, 7);
        if (/^\d{4}-\d{2}$/.test(ym)) monthSet.add(ym);
      }
      const availableMonths = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

      const periodSales =
        requestedMonth === 'all'
          ? validSales
          : validSales.filter((s) => String(s.date || '').startsWith(requestedMonth));

      const prodMap = new Map(prodsList.map((p) => [p.id, p]));
      const itemsBySaleId = new Map<number, any[]>();
      for (const it of saleItemsList) {
        const sid = Number(it.saleId);
        const bucket = itemsBySaleId.get(sid);
        if (bucket) bucket.push(it);
        else itemsBySaleId.set(sid, [it]);
      }

      const buildTopProducts = (clientSales: any[], clientTotalSpend: number) => {
        const agg = new Map<
          string,
          {
            productId: number;
            productCode: string;
            productName: string;
            unit: string;
            totalQuantity: number;
            totalSpentUsd: number;
            saleIds: Set<number>;
          }
        >();

        for (const s of clientSales) {
          const sItems = itemsBySaleId.get(Number(s.id)) || [];
          for (const it of sItems) {
            const pid = Number(it.productId) || 0;
            const prod = prodMap.get(pid);
            const code = prod?.code || cleanProductCode(it.productCode || `SKU-${pid}`);
            const key = pid > 0 ? `id:${pid}` : `code:${normalizeText(code)}`;
            const cleanName =
              prod?.name || String(it.productName || 'Producto').replace(/\s*\[[^\]]+\]\s*$/, '').trim();
            const qty = Number(it.quantity) || 0;
            const spent = Number(it.subtotalUsd) || qty * (Number(it.unitPriceUsd) || 0);

            const existing = agg.get(key);
            if (existing) {
              existing.totalQuantity = Math.round((existing.totalQuantity + qty) * 100) / 100;
              existing.totalSpentUsd = Math.round((existing.totalSpentUsd + spent) * 100) / 100;
              existing.saleIds.add(Number(s.id));
            } else {
              agg.set(key, {
                productId: pid,
                productCode: code,
                productName: cleanName,
                unit: prod?.unit || 'Unidad',
                totalQuantity: Math.round(qty * 100) / 100,
                totalSpentUsd: Math.round(spent * 100) / 100,
                saleIds: new Set([Number(s.id)]),
              });
            }
          }
        }

        return Array.from(agg.values())
          .sort((a, b) => b.totalQuantity - a.totalQuantity || b.totalSpentUsd - a.totalSpentUsd)
          .slice(0, 10)
          .map((item) => ({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            unit: item.unit,
            totalQuantity: item.totalQuantity,
            totalSpentUsd: item.totalSpentUsd,
            purchaseFrequency: item.saleIds.size,
            avgUnitPriceUsd:
              item.totalQuantity > 0
                ? Math.round((item.totalSpentUsd / item.totalQuantity) * 100) / 100
                : 0,
            shareOfClientSpendPct:
              clientTotalSpend > 0
                ? Math.round((item.totalSpentUsd / clientTotalSpend) * 1000) / 10
                : 0,
          }));
      };

      // Group sales by clientId for both selected period and all-time
      const periodSalesByClient = new Map<number, any[]>();
      for (const s of periodSales) {
        const cid = Number(s.clientId);
        const bucket = periodSalesByClient.get(cid);
        if (bucket) bucket.push(s);
        else periodSalesByClient.set(cid, [s]);
      }

      const allSalesByClient = new Map<number, any[]>();
      for (const s of validSales) {
        const cid = Number(s.clientId);
        const bucket = allSalesByClient.get(cid);
        if (bucket) bucket.push(s);
        else allSalesByClient.set(cid, [s]);
      }

      const totalPeriodAmountUsd =
        Math.round(periodSales.reduce((acc, s) => acc + (Number(s.totalUsd) || 0), 0) * 100) / 100;

      let totalPeriodArticles = 0;

      const clientRows = clientsList.map((cl) => {
        const cPeriodSales = periodSalesByClient.get(cl.id) || [];
        const cAllSales = allSalesByClient.get(cl.id) || [];

        const invoiceCount = cPeriodSales.length;
        const totalAmountUsd =
          Math.round(cPeriodSales.reduce((acc, s) => acc + (Number(s.totalUsd) || 0), 0) * 100) / 100;

        let totalArticles = 0;
        const distinctProds = new Set<string>();
        let lastInvoiceDate: string | null = null;

        for (const s of cPeriodSales) {
          if (!lastInvoiceDate || String(s.date) > lastInvoiceDate) {
            lastInvoiceDate = String(s.date);
          }
          const sItems = itemsBySaleId.get(Number(s.id)) || [];
          for (const it of sItems) {
            totalArticles += Number(it.quantity) || 0;
            distinctProds.add(String(it.productId || it.productCode || it.productName));
          }
        }
        totalArticles = Math.round(totalArticles * 100) / 100;
        totalPeriodArticles = Math.round((totalPeriodArticles + totalArticles) * 100) / 100;

        const allTimeInvoiceCount = cAllSales.length;
        const allTimeTotalUsd =
          Math.round(cAllSales.reduce((acc, s) => acc + (Number(s.totalUsd) || 0), 0) * 100) / 100;
        let allTimeArticles = 0;
        for (const s of cAllSales) {
          const sItems = itemsBySaleId.get(Number(s.id)) || [];
          for (const it of sItems) {
            allTimeArticles += Number(it.quantity) || 0;
          }
        }
        allTimeArticles = Math.round(allTimeArticles * 100) / 100;

        return {
          clientId: cl.id,
          clientName: cl.name,
          clientIdDoc: cl.idDoc || '',
          zoneName: cl.zoneName || null,
          state: cl.state || null,
          useCostPrice: Boolean(cl.useCostPrice),
          creditRating: (cl.creditRating || 'nuevo') as CreditRating,
          currentBalanceUsd: Number(cl.currentBalanceUsd) || 0,
          invoiceCount,
          totalAmountUsd,
          totalArticles,
          distinctProductsCount: distinctProds.size,
          avgTicketUsd:
            invoiceCount > 0 ? Math.round((totalAmountUsd / invoiceCount) * 100) / 100 : 0,
          avgArticlesPerInvoice:
            invoiceCount > 0 ? Math.round((totalArticles / invoiceCount) * 10) / 10 : 0,
          shareOfRevenuePct:
            totalPeriodAmountUsd > 0
              ? Math.round((totalAmountUsd / totalPeriodAmountUsd) * 1000) / 10
              : 0,
          lastInvoiceDate,
          topProductsPeriod: buildTopProducts(cPeriodSales, totalAmountUsd),
          topProductsAllTime: buildTopProducts(cAllSales, allTimeTotalUsd),
          allTimeInvoiceCount,
          allTimeTotalUsd,
          allTimeArticles,
        };
      });

      // Default sort: most invoices in the month -> highest amount -> most articles
      clientRows.sort(
        (a, b) =>
          b.invoiceCount - a.invoiceCount ||
          b.totalAmountUsd - a.totalAmountUsd ||
          b.totalArticles - a.totalArticles ||
          a.clientName.localeCompare(b.clientName)
      );

      const activeClients = clientRows.filter((c) => c.invoiceCount > 0);
      const topByInvoices = activeClients[0] || null;
      const topByAmount =
        [...activeClients].sort(
          (a, b) => b.totalAmountUsd - a.totalAmountUsd || b.invoiceCount - a.invoiceCount
        )[0] || null;
      const topByArticles =
        [...activeClients].sort(
          (a, b) => b.totalArticles - a.totalArticles || b.totalAmountUsd - a.totalAmountUsd
        )[0] || null;

      return jsonResp({
        selectedMonth: requestedMonth,
        availableMonths,
        currentExchangeRate: currentRate,
        summary: {
          activeClientsCount: activeClients.length,
          totalClientsCount: clientRows.length,
          totalInvoices: periodSales.length,
          totalAmountUsd: totalPeriodAmountUsd,
          totalArticles: totalPeriodArticles,
          topByInvoices,
          topByAmount,
          topByArticles,
        },
        clients: clientRows,
      });
    }

    // ---------------------------------------------------------------------
    // 12. USERS / OPERATORS, SECURITY LOGIN, AUDIT LOGS & BACKUP / RESTORE
    // ---------------------------------------------------------------------
    if (path === '/api/auth/ensure-operators' && method === 'POST') {
      await ensureDefaultOperators();
      const list = await listCollection<any>('users');
      list.sort((a, b) => a.id - b.id);
      return jsonResp(list.map(sanitizeUser));
    }

    if (path === '/api/auth/operator-login' && method === 'POST') {
      const rawUsername = reqStr(body.username, 80).toLowerCase();
      const rawPassword = String(body.password || '');
      if (!rawUsername || !rawPassword) {
        return jsonResp({ error: 'Debe ingresar su usuario y clave de acceso.' }, 400);
      }

      await ensureDefaultOperators();
      const list = await listCollection<any>('users');
      const found = list.find(
        (u) =>
          normalizeText(u.username || '') === normalizeText(rawUsername) ||
          normalizeText(u.email || '') === normalizeText(rawUsername)
      );

      if (!found) {
        return jsonResp({ error: 'Usuario o clave incorrectos.' }, 401);
      }
      if (found.isActive === false) {
        return jsonResp({ error: 'Este usuario está desactivado. Contacte al Administrador.' }, 403);
      }

      const ok = await verifyPassword(rawPassword, found.passwordSalt, found.passwordHash);
      if (!ok) {
        return jsonResp({ error: 'Usuario o clave incorrectos.' }, 401);
      }

      const nowIso = new Date().toISOString();
      await patchDoc('users', found._docId, { lastLoginAt: nowIso });
      const sanitized = sanitizeUser({ ...found, lastLoginAt: nowIso });
      setActiveOperatorContext(sanitized);

      void recordAuditLog(
        'Inicio de sesión',
        'auth',
        `Acceso validado como @${sanitized.username} (${sanitized.role})${isOfflineNow() ? ' · Modo Offline' : ''}`,
        { username: sanitized.username || 'usuario', name: sanitized.name, role: sanitized.role }
      );

      return jsonResp(sanitized);
    }

    if (path === '/api/users' && method === 'GET') {
      await ensureDefaultOperators();
      const list = await listCollection<any>('users');
      list.sort((a, b) => a.id - b.id);
      return jsonResp(list.map(sanitizeUser));
    }

    if (path === '/api/users' && method === 'POST') {
      const name = reqStr(body.name, 160);
      const username = reqStr(body.username, 60).toLowerCase().replace(/\s+/g, '');
      const email = reqStr(body.email || `${username}@distribuidoraroeca.com`, 160).toLowerCase();
      const rawPassword = String(body.password || '');

      if (!name || !username) {
        return jsonResp({ error: 'Nombre completo y nombre de usuario son obligatorios.' }, 400);
      }
      if (!/^[a-z0-9._-]+$/.test(username)) {
        return jsonResp({ error: 'El usuario solo debe contener letras minúsculas, números, punto, guión o guión bajo.' }, 400);
      }
      if (rawPassword.length < 4) {
        return jsonResp({ error: 'La clave de acceso debe tener al menos 4 caracteres.' }, 400);
      }

      const list = await listCollection<any>('users');
      if (list.some((u) => normalizeText(u.username || '') === normalizeText(username))) {
        return jsonResp({ error: `El usuario "${username}" ya está registrado.` }, 400);
      }
      if (list.some((u) => normalizeText(u.email) === normalizeText(email))) {
        return jsonResp({ error: `Ya existe un operador con el correo "${email}".` }, 400);
      }

      const role: UserRole = VALID_ROLES.includes(body.role) ? body.role : 'cajero';
      const allowedModules = normalizeAllowedModules(body.allowedModules, role);
      const { hash, salt } = await hashPassword(rawPassword);

      const created = await createDoc('users', nextIdFrom(list), {
        uid: `op-${username}-${Date.now().toString(36)}`,
        username,
        name,
        email,
        role,
        passwordHash: hash,
        passwordSalt: salt,
        allowedModules,
        lastLoginAt: null,
        branchId: body.branchId ? Number(body.branchId) : 1,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      });

      void recordAuditLog(
        'Usuario creado',
        'users_admin',
        `Usuario @${username} (${name}) · Rol: ${role} · ${allowedModules.length} módulos habilitados`
      );

      return jsonResp(sanitizeUser(created), 201);
    }

    const userMatch = path.match(/^\/api\/users\/(\d+)$/);
    if (userMatch) {
      const id = Number(userMatch[1]);
      const list = await listCollection<any>('users');
      const target = list.find((u) => u.id === id);
      if (!target) return jsonResp({ error: 'Usuario no encontrado' }, 404);

      if (method === 'PUT') {
        const updates: Record<string, any> = {};
        if (body.name !== undefined) updates.name = reqStr(body.name, 160);
        if (body.username !== undefined) {
          const uname = reqStr(body.username, 60).toLowerCase().replace(/\s+/g, '');
          if (!uname || !/^[a-z0-9._-]+$/.test(uname)) {
            return jsonResp({ error: 'Nombre de usuario inválido.' }, 400);
          }
          if (list.some((u) => u.id !== id && normalizeText(u.username || '') === normalizeText(uname))) {
            return jsonResp({ error: `El usuario "${uname}" ya pertenece a otro operador.` }, 400);
          }
          updates.username = uname;
        }
        if (body.email !== undefined) {
          const email = reqStr(body.email, 160).toLowerCase();
          if (list.some((u) => u.id !== id && normalizeText(u.email) === normalizeText(email))) {
            return jsonResp({ error: `El correo "${email}" ya pertenece a otro operador.` }, 400);
          }
          updates.email = email;
        }
        if (body.role !== undefined && VALID_ROLES.includes(body.role)) {
          updates.role = body.role;
        }
        if (body.allowedModules !== undefined) {
          const effRole: UserRole = updates.role || target.role || 'cajero';
          updates.allowedModules = normalizeAllowedModules(body.allowedModules, effRole);
        }
        if (body.password && String(body.password).trim().length > 0) {
          const rawPwd = String(body.password);
          if (rawPwd.length < 4) {
            return jsonResp({ error: 'La nueva clave debe tener al menos 4 caracteres.' }, 400);
          }
          const { hash, salt } = await hashPassword(rawPwd);
          updates.passwordHash = hash;
          updates.passwordSalt = salt;
        }
        if (body.branchId !== undefined) updates.branchId = body.branchId ? Number(body.branchId) : null;
        if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);

        await patchDoc('users', target._docId, updates);
        void recordAuditLog(
          'Usuario actualizado',
          'users_admin',
          `Usuario @${updates.username || target.username || target.email}${updates.passwordHash ? ' · Clave actualizada' : ''}${updates.allowedModules ? ` · ${updates.allowedModules.length} módulos` : ''}`
        );
        return jsonResp(sanitizeUser({ ...target, ...updates }));
      }
      if (method === 'DELETE') {
        const activeAdmins = list.filter((u) => u.role === 'admin' && u.isActive !== false && u.id !== id);
        if (target.role === 'admin' && activeAdmins.length === 0) {
          return jsonResp({ error: 'No puede eliminar el último usuario Administrador activo.' }, 400);
        }
        await removeDoc('users', target._docId);
        void recordAuditLog('Usuario eliminado', 'users_admin', `Eliminado @${target.username || target.email} (${target.name})`);
        return jsonResp({ message: 'Operador eliminado' });
      }
    }

    if (path === '/api/auth/sync' && method === 'POST') {
      await ensureDefaultOperators();
      const list = await listCollection<any>('users');
      const adminOp = list.find((u) => normalizeText(u.username || '') === 'admin') || list[0];
      return jsonResp(adminOp ? sanitizeUser(adminOp) : null);
    }

    // ---------------------------------------------------------------------
    // 13. AUDIT LOGS (PER-USER ACTIVITY TRAIL)
    // ---------------------------------------------------------------------
    if (path === '/api/audit-logs' && method === 'GET') {
      let logs = await listCollection<any>('auditLogs');
      const usernameFilter = params.get('username');
      const moduleFilter = params.get('module');
      if (usernameFilter && usernameFilter !== 'todos') {
        logs = logs.filter((l) => normalizeText(l.operatorUsername) === normalizeText(usernameFilter));
      }
      if (moduleFilter && moduleFilter !== 'todos') {
        logs = logs.filter((l) => l.module === moduleFilter);
      }
      logs.sort((a, b) => b.id - a.id);
      return jsonResp(logs.slice(0, 250));
    }

    if (path === '/api/audit-logs' && method === 'POST') {
      const action = reqStr(body.action, 120);
      const mod = reqStr(body.module, 60, 'sistema');
      if (!action) return jsonResp({ error: 'Acción requerida' }, 400);
      await recordAuditLog(action, mod, body.details || null);
      return jsonResp({ ok: true }, 201);
    }

    // ---------------------------------------------------------------------
    // 14. GENERAL DATABASE BACKUP & RESTORE
    // ---------------------------------------------------------------------
    if (path === '/api/backup/export' && method === 'GET') {
      const colNames: ColName[] = [
        'branches',
        'users',
        'exchangeRates',
        'categories',
        'zones',
        'products',
        'clients',
        'suppliers',
        'sales',
        'saleItems',
        'purchases',
        'purchaseItems',
        'payments',
        'auditLogs',
      ];

      const entries = await Promise.all(
        colNames.map(async (c) => {
          const rows = await listCollection<any>(c);
          const cleaned = rows.map(({ _docId, ownerUid, ...rest }) => rest);
          return [c, cleaned] as const;
        })
      );

      const collectionsObj: Record<string, any[]> = {};
      const counts: Record<string, number> = {};
      let totalRecords = 0;

      for (const [colName, rows] of entries) {
        collectionsObj[colName] = rows;
        counts[colName] = rows.length;
        totalRecords += rows.length;
      }

      const payloadWithoutChecksum = {
        app: 'Distribuidora ROECA C.A. - ERP & POS',
        version: '2.0',
        exportedAt: new Date().toISOString(),
        exportedBy: activeOperatorCtx?.username || auth.currentUser?.email || 'admin',
        totalRecords,
        counts,
        collections: collectionsObj,
      };

      const checksumSha256 = await computeSha256(JSON.stringify(payloadWithoutChecksum.collections));
      const fullBackup = {
        ...payloadWithoutChecksum,
        checksumSha256,
      };

      void recordAuditLog(
        'Copia de seguridad general exportada',
        'backup',
        `Respaldo completo generado (${totalRecords} registros · SHA-256: ${checksumSha256.slice(0, 12)}...)`
      );

      return jsonResp(fullBackup);
    }

    if (path === '/api/backup/restore' && method === 'POST') {
      if (!body || typeof body !== 'object' || !body.collections || typeof body.collections !== 'object') {
        return jsonResp({ error: 'El archivo de copia de seguridad no tiene un formato válido.' }, 400);
      }

      if (body.checksumSha256) {
        const computed = await computeSha256(JSON.stringify(body.collections));
        if (computed !== body.checksumSha256) {
          return jsonResp({ error: 'Verificación de integridad fallida: el archivo de respaldo fue modificado o está corrupto.' }, 400);
        }
      }

      const restoreOrder: ColName[] = [
        'branches',
        'exchangeRates',
        'categories',
        'zones',
        'products',
        'clients',
        'suppliers',
        'users',
        'sales',
        'saleItems',
        'purchases',
        'purchaseItems',
        'payments',
      ];

      let restoredCreated = 0;
      let restoredUpdated = 0;
      let skipped = 0;

      for (const colName of restoreOrder) {
        const incomingRows = body.collections[colName];
        if (!Array.isArray(incomingRows) || incomingRows.length === 0) continue;

        const existingRows = await listCollection<any>(colName);
        const existingById = new Map(existingRows.map((r) => [Number(r.id), r]));

        for (const row of incomingRows) {
          const numId = Number(row?.id);
          if (!numId || numId < 1) {
            skipped++;
            continue;
          }
          const { _docId, ownerUid, createdAt, updatedAt, ...cleanFields } = row;
          const existing = existingById.get(numId);

          if (!existing) {
            try {
              await createDoc(colName, numId, cleanFields);
              restoredCreated++;
            } catch {
              skipped++;
            }
          } else if (['branches', 'categories', 'zones', 'products', 'clients', 'suppliers'].includes(colName)) {
            // Update mutable master collections cleanly
            try {
              const { id: _ignoreId, ...mutableUpdates } = cleanFields;
              await patchDoc(colName, existing._docId, mutableUpdates);
              restoredUpdated++;
            } catch {
              skipped++;
            }
          } else {
            // Immutable ledgers (sales, items, payments, rates) already exist -> skip safely
            skipped++;
          }
        }
      }

      void recordAuditLog(
        'Copia de seguridad restaurada',
        'backup',
        `Restauración completada: ${restoredCreated} creados, ${restoredUpdated} actualizados, ${skipped} omitidos`
      );

      return jsonResp({
        success: true,
        restoredCreated,
        restoredUpdated,
        skipped,
        message: `Restauración completada: ${restoredCreated} registros nuevos restaurados y ${restoredUpdated} actualizados.`,
      });
    }

    return jsonResp({ error: `Ruta API no implementada: ${method} ${path}` }, 404);
  } catch (err: any) {
    console.error(`[Firestore API Error] ${method} ${path}:`, err);
    return jsonResp({ error: err?.message || 'Error al procesar operación en Firestore' }, 500);
  }
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

  // Route relative /api/* requests (excluding stateless /api/bcv-live) directly to Firestore
  if (urlStr.startsWith('/api/') && !urlStr.startsWith('/api/bcv-live')) {
    return handleApiRequest(urlStr, init);
  }

  return nativeFetch(input, init);
}

let interceptorInstalled = false;

export function installFirestoreApiInterceptor() {
  if (interceptorInstalled || typeof window === 'undefined') return;
  interceptorInstalled = true;

  // Best-effort override only when Window.fetch is configurable/writable;
  // all app modules call apiFetch directly so this never throws in getter-only sandboxes.
  try {
    const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (!desc || desc.writable) {
      window.fetch = apiFetch;
    } else if (desc.configurable) {
      Object.defineProperty(window, 'fetch', {
        value: apiFetch,
        writable: true,
        configurable: true,
      });
    }
  } catch {
    // Ignore when the runtime defines Window.fetch as a non-configurable getter
  }
}
