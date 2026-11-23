import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  RefreshCw,
  Tag,
  Users,
  MapPin,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  AlertTriangle,
  X,
  Save,
  ShieldCheck,
  Power,
  ExternalLink,
  Database,
  HardDriveDownload,
  Upload,
  KeyRound,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
  ClipboardList,
  Cloud,
  Loader2,
  GitBranch,
  Building,
  Phone,
} from 'lucide-react';
import {
  ExchangeRate,
  Category,
  UserProfile,
  Branch,
  Zone,
  UserRole,
  ModuleKey,
  ALL_MODULES,
  ALL_MODULE_KEYS,
  ROLE_DEFAULT_MODULES,
  AuditLog,
} from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { triggerManualSync, getOfflineSyncState } from '../lib/offlineSync.ts';

interface ControlPanelAdminProps {
  exchangeRate: ExchangeRate | null;
  onRateUpdated?: () => void;
  initialTab?: AdminTab;
}

export type AdminTab = 'tasa' | 'sucursales' | 'categorias' | 'operadores' | 'zonas' | 'backup' | 'auditoria';

const VENEZUELA_STATES = [
  'Amazonas',
  'Anzoátegui',
  'Apure',
  'Aragua',
  'Barinas',
  'Bolívar',
  'Carabobo',
  'Cojedes',
  'Delta Amacuro',
  'Distrito Capital',
  'Falcón',
  'Guárico',
  'La Guaira',
  'Lara',
  'Mérida',
  'Miranda',
  'Monagas',
  'Nueva Esparta',
  'Portuguesa',
  'Sucre',
  'Táchira',
  'Trujillo',
  'Yaracuy',
  'Zulia',
];

const normalizeText = (str: string) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const ControlPanelAdmin: React.FC<ControlPanelAdminProps> = ({
  exchangeRate,
  onRateUpdated,
  initialTab = 'tasa',
}) => {
  const { hasPermission, refreshOperatorProfile, activeBranch, setActiveBranch, loadBranches } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const resolveAllowedTab = (desired: AdminTab): AdminTab => {
    if (desired === 'tasa' && hasPermission('exchange')) return 'tasa';
    if (desired === 'sucursales' && hasPermission('branches')) return 'sucursales';
    if (desired === 'operadores' && hasPermission('users_admin')) return 'operadores';
    if ((desired === 'backup' || desired === 'auditoria') && hasPermission('backup')) return desired;
    if (desired === 'categorias' || desired === 'zonas') return desired;
    if (hasPermission('exchange')) return 'tasa';
    if (hasPermission('branches')) return 'sucursales';
    if (hasPermission('users_admin')) return 'operadores';
    if (hasPermission('backup')) return 'backup';
    return 'categorias';
  };

  // Sync external initialTab changes if user clicks a shortcut from Dashboard
  useEffect(() => {
    setActiveTab(resolveAllowedTab(initialTab));
  }, [initialTab]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  // =========================================================================
  // 1. TASA BCV / CAMBIAR TASA DEL DÍA
  // =========================================================================
  const [rateHistory, setRateHistory] = useState<ExchangeRate[]>([]);
  const [manualRate, setManualRate] = useState('');
  const [manualSource, setManualSource] = useState('Banco Central de Venezuela (BCV Oficial)');
  const [isSyncingBcv, setIsSyncingBcv] = useState(false);
  const [isSavingRate, setIsSavingRate] = useState(false);

  const loadRates = async () => {
    try {
      const res = await apiFetch('/api/exchange-rates');
      if (res.ok) setRateHistory(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleSyncBcv = async () => {
    setIsSyncingBcv(true);
    try {
      const res = await apiFetch('/api/exchange-rate/sync-bcv', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showMessage('success', `Tasa oficial BCV sincronizada: Bs. ${Number(data.rate).toFixed(2)} / $`);
        await loadRates();
        onRateUpdated?.();
      } else {
        showMessage('error', data.error || 'No se pudo obtener la tasa automática del BCV. Puede ingresarla manualmente.');
      }
    } catch {
      showMessage('error', 'Error de conexión al consultar el Banco Central de Venezuela.');
    } finally {
      setIsSyncingBcv(false);
    }
  };

  const handleSaveManualRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(manualRate);
    if (!num || num <= 0) {
      showMessage('error', 'Ingrese una tasa válida mayor a 0.');
      return;
    }
    setIsSavingRate(true);
    try {
      const res = await apiFetch('/api/exchange-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate: num, source: manualSource }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar tasa');
      setManualRate('');
      showMessage('success', `Nueva tasa del día registrada: Bs. ${num.toFixed(2)} / $`);
      await loadRates();
      onRateUpdated?.();
    } catch (err: any) {
      showMessage('error', err.message || 'Error al actualizar la tasa');
    } finally {
      setIsSavingRate(false);
    }
  };

  // =========================================================================
  // 2. CATEGORÍAS DE PRODUCTOS
  // =========================================================================
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catToDelete, setCatToDelete] = useState<Category | null>(null);

  const loadCategories = async () => {
    try {
      const res = await apiFetch('/api/categories');
      if (res.ok) setCategoriesList(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const duplicateCategory = useMemo(() => {
    const q = normalizeText(catName);
    if (!q) return null;
    return (
      categoriesList.find(
        (c) => normalizeText(c.name) === q && (!editingCategory || c.id !== editingCategory.id)
      ) || null
    );
  }, [catName, categoriesList, editingCategory]);

  const similarCategories = useMemo(() => {
    const q = normalizeText(catName);
    if (q.length < 2) return [];
    return categoriesList
      .filter(
        (c) =>
          normalizeText(c.name).includes(q) &&
          (!editingCategory || c.id !== editingCategory.id) &&
          c.id !== duplicateCategory?.id
      )
      .slice(0, 4);
  }, [catName, categoriesList, editingCategory, duplicateCategory]);

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      showMessage('error', 'El nombre de la categoría es obligatorio.');
      return;
    }
    if (duplicateCategory) {
      showMessage('error', `La categoría "${duplicateCategory.name}" ya existe.`);
      return;
    }
    try {
      const url = editingCategory ? `/api/categories/${editingCategory.id}` : '/api/categories';
      const method = editingCategory ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: catName.trim(), description: catDesc.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar categoría');
      showMessage('success', editingCategory ? 'Categoría actualizada.' : 'Categoría creada exitosamente.');
      setEditingCategory(null);
      setCatName('');
      setCatDesc('');
      loadCategories();
    } catch (err: any) {
      showMessage('error', err.message || 'Error al guardar categoría');
    }
  };

  const handleDeleteCategory = async () => {
    if (!catToDelete) return;
    try {
      const res = await apiFetch(`/api/categories/${catToDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
      showMessage('success', `Categoría "${catToDelete.name}" eliminada.`);
      setCatToDelete(null);
      loadCategories();
    } catch (err: any) {
      showMessage('error', err.message || 'Error al eliminar categoría');
      setCatToDelete(null);
    }
  };

  // =========================================================================
  // 3. USUARIOS, CLAVES Y PERMISOS POR MÓDULO (CHECKBOXES)
  // =========================================================================
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [branchesList, setBranchesList] = useState<Branch[]>([]);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [opName, setOpName] = useState('');
  const [opUsername, setOpUsername] = useState('');
  const [opPassword, setOpPassword] = useState('');
  const [showOpPassword, setShowOpPassword] = useState(false);
  const [opEmail, setOpEmail] = useState('');
  const [opRole, setOpRole] = useState<UserRole>('cajero');
  const [opAllowedModules, setOpAllowedModules] = useState<ModuleKey[]>([...ROLE_DEFAULT_MODULES.cajero]);
  const [opBranchId, setOpBranchId] = useState('1');
  const [opActive, setOpActive] = useState(true);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);

  const loadUsersAndBranches = async () => {
    try {
      const [uRes, bRes] = await Promise.all([apiFetch('/api/users'), apiFetch('/api/branches')]);
      if (uRes.ok) setUsersList(await uRes.json());
      if (bRes.ok) {
        const bData: Branch[] = await bRes.json();
        setBranchesList(bData);
        if (bData.length > 0 && !editingUser) {
          setOpBranchId(String(bData[0].id));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // =========================================================================
  // 1B. SUCURSALES / SEDES ROECA
  // =========================================================================
  const [branchCode, setBranchCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchIsMain, setBranchIsMain] = useState(false);
  const [isSavingBranch, setIsSavingBranch] = useState(false);

  const duplicateBranchByCode = useMemo(() => {
    const q = normalizeText(branchCode);
    if (!q) return null;
    return branchesList.find((b) => normalizeText(b.code) === q) || null;
  }, [branchCode, branchesList]);

  const duplicateBranchByName = useMemo(() => {
    const q = normalizeText(branchName);
    if (!q) return null;
    return branchesList.find((b) => normalizeText(b.name) === q) || null;
  }, [branchName, branchesList]);

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchCode.trim() || !branchName.trim()) {
      showMessage('error', 'El código y el nombre de la sucursal son obligatorios.');
      return;
    }
    if (duplicateBranchByCode) {
      showMessage('error', `Ya existe una sucursal con el código "${duplicateBranchByCode.code}" (${duplicateBranchByCode.name}).`);
      return;
    }
    if (duplicateBranchByName) {
      showMessage('error', `Ya existe una sucursal llamada "${duplicateBranchByName.name}".`);
      return;
    }

    setIsSavingBranch(true);
    try {
      const res = await apiFetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: branchCode.trim().toUpperCase(),
          name: branchName.trim(),
          address: branchAddress.trim() || null,
          phone: branchPhone.trim() || null,
          isMain: branchIsMain,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar sucursal');

      setBranchCode('');
      setBranchName('');
      setBranchPhone('');
      setBranchAddress('');
      setBranchIsMain(false);
      showMessage('success', `Sucursal "${data.name || branchName.trim()}" creada exitosamente.`);
      await Promise.all([loadUsersAndBranches(), loadBranches(), loadAuditLogs()]);
    } catch (err: any) {
      showMessage('error', err.message || 'No se pudo crear la sucursal.');
    } finally {
      setIsSavingBranch(false);
    }
  };

  const resetOperatorForm = () => {
    setEditingUser(null);
    setOpName('');
    setOpUsername('');
    setOpPassword('');
    setShowOpPassword(false);
    setOpEmail('');
    setOpRole('cajero');
    setOpAllowedModules([...ROLE_DEFAULT_MODULES.cajero]);
    setOpActive(true);
  };

  const loadOperatorIntoForm = (u: UserProfile) => {
    setEditingUser(u);
    setOpName(u.name);
    setOpUsername(u.username || u.email.split('@')[0] || '');
    setOpPassword('');
    setShowOpPassword(false);
    setOpEmail(u.email);
    setOpRole(u.role);
    setOpAllowedModules(
      Array.isArray(u.allowedModules)
        ? [...u.allowedModules]
        : [...(ROLE_DEFAULT_MODULES[u.role] || ROLE_DEFAULT_MODULES.cajero)]
    );
    setOpBranchId(String(u.branchId || 1));
    setOpActive(u.isActive);
  };

  const handleRolePresetChange = (newRole: UserRole) => {
    setOpRole(newRole);
    setOpAllowedModules([...(ROLE_DEFAULT_MODULES[newRole] || ROLE_DEFAULT_MODULES.cajero)]);
  };

  const toggleModulePermission = (modKey: ModuleKey) => {
    setOpAllowedModules((prev) =>
      prev.includes(modKey) ? prev.filter((k) => k !== modKey) : [...prev, modKey]
    );
  };

  const duplicateUserByUsername = useMemo(() => {
    const q = normalizeText(opUsername.replace(/\s+/g, ''));
    if (!q) return null;
    return (
      usersList.find(
        (u) => normalizeText(u.username || '') === q && (!editingUser || u.id !== editingUser.id)
      ) || null
    );
  }, [opUsername, usersList, editingUser]);

  const duplicateUserByEmail = useMemo(() => {
    const q = normalizeText(opEmail);
    if (!q) return null;
    return (
      usersList.find(
        (u) => normalizeText(u.email) === q && (!editingUser || u.id !== editingUser.id)
      ) || null
    );
  }, [opEmail, usersList, editingUser]);

  const handleSaveOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = opUsername.trim().toLowerCase().replace(/\s+/g, '');
    if (!opName.trim() || !cleanUsername) {
      showMessage('error', 'Nombre completo y usuario de acceso son obligatorios.');
      return;
    }
    if (!editingUser && opPassword.length < 4) {
      showMessage('error', 'Debe asignar una clave de acceso de al menos 4 caracteres.');
      return;
    }
    if (editingUser && opPassword.length > 0 && opPassword.length < 4) {
      showMessage('error', 'Si cambia la clave, debe tener al menos 4 caracteres.');
      return;
    }
    if (opAllowedModules.length === 0) {
      showMessage('error', 'Seleccione (tilde) al menos un módulo permitido para este usuario.');
      return;
    }
    if (duplicateUserByUsername || duplicateUserByEmail) {
      showMessage('error', 'Ya existe un operador con ese nombre de usuario o correo.');
      return;
    }

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';
      const payload: Record<string, any> = {
        name: opName.trim(),
        username: cleanUsername,
        email: (opEmail.trim() || `${cleanUsername}@distribuidoraroeca.com`).toLowerCase(),
        role: opRole,
        allowedModules: opAllowedModules,
        branchId: Number(opBranchId) || 1,
        isActive: opActive,
      };
      if (opPassword.trim().length > 0) {
        payload.password = opPassword;
      }

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar operador');

      showMessage(
        'success',
        editingUser
          ? `Usuario @${cleanUsername} actualizado (${opAllowedModules.length} módulos habilitados).`
          : `Usuario @${cleanUsername} creado exitosamente con clave cifrada y ${opAllowedModules.length} módulos.`
      );
      resetOperatorForm();
      await loadUsersAndBranches();
      await refreshOperatorProfile();
      await loadAuditLogs();
    } catch (err: any) {
      showMessage('error', err.message || 'Error al guardar operador');
    }
  };

  const handleToggleUserActive = async (u: UserProfile) => {
    try {
      const res = await apiFetch(`/api/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      if (res.ok) {
        await loadUsersAndBranches();
        await refreshOperatorProfile();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      const res = await apiFetch(`/api/users/${userToDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
      showMessage('success', `Usuario "${userToDelete.name}" eliminado.`);
      setUserToDelete(null);
      await loadUsersAndBranches();
      await loadAuditLogs();
    } catch (err: any) {
      showMessage('error', err.message || 'Error al eliminar operador');
      setUserToDelete(null);
    }
  };

  // =========================================================================
  // 5. COPIA DE SEGURIDAD GENERAL Y RESTAURACIÓN
  // =========================================================================
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [lastBackupMeta, setLastBackupMeta] = useState<{
    exportedAt: string;
    totalRecords: number;
    checksumShort: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem('roeca_last_backup_meta');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [pendingRestorePayload, setPendingRestorePayload] = useState<any | null>(null);
  const [pendingRestoreFileName, setPendingRestoreFileName] = useState('');

  const handleDownloadBackup = async () => {
    setIsExportingBackup(true);
    try {
      const res = await apiFetch('/api/backup/export');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo generar la copia de seguridad');

      const jsonText = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ROECA_Respaldo_General_${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const meta = {
        exportedAt: data.exportedAt,
        totalRecords: data.totalRecords,
        checksumShort: String(data.checksumSha256 || '').slice(0, 14),
      };
      setLastBackupMeta(meta);
      try {
        localStorage.setItem('roeca_last_backup_meta', JSON.stringify(meta));
      } catch {
        // Ignore
      }
      showMessage('success', `Copia de seguridad general descargada (${data.totalRecords} registros protegidos).`);
      await loadAuditLogs();
    } catch (err: any) {
      showMessage('error', err.message || 'Error al generar copia de seguridad.');
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleSelectRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !parsed.collections || typeof parsed.collections !== 'object') {
        showMessage('error', 'El archivo seleccionado no es una copia de seguridad válida de ROECA.');
        return;
      }
      setPendingRestorePayload(parsed);
      setPendingRestoreFileName(file.name);
    } catch {
      showMessage('error', 'No se pudo leer el archivo JSON de respaldo.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestorePayload) return;
    setIsRestoringBackup(true);
    try {
      const res = await apiFetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingRestorePayload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al restaurar copia de seguridad');
      showMessage('success', data.message || 'Copia de seguridad restaurada exitosamente.');
      setPendingRestorePayload(null);
      setPendingRestoreFileName('');
      await Promise.all([loadRates(), loadCategories(), loadUsersAndBranches(), loadZones(), loadAuditLogs()]);
      onRateUpdated?.();
    } catch (err: any) {
      showMessage('error', err.message || 'Error al restaurar respaldo.');
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleSyncCloudNow = async () => {
    setIsSyncingNow(true);
    try {
      const ok = await triggerManualSync();
      if (ok) {
        showMessage('success', 'Base de datos sincronizada correctamente con el respaldo en la nube.');
      } else {
        showMessage('error', 'Sin conexión a internet. Los datos siguen resguardados localmente y se sincronizarán automáticamente al reconectar.');
      }
    } finally {
      setIsSyncingNow(false);
    }
  };

  // =========================================================================
  // 6. REGISTRO DE ACTIVIDAD POR USUARIO (AUDITORÍA)
  // =========================================================================
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditUserFilter, setAuditUserFilter] = useState('todos');
  const [auditModuleFilter, setAuditModuleFilter] = useState('todos');

  const loadAuditLogs = async () => {
    try {
      const res = await apiFetch('/api/audit-logs');
      if (res.ok) setAuditLogs(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((l) => {
      if (auditUserFilter !== 'todos' && l.operatorUsername !== auditUserFilter) return false;
      if (auditModuleFilter !== 'todos' && l.module !== auditModuleFilter) return false;
      return true;
    });
  }, [auditLogs, auditUserFilter, auditModuleFilter]);

  // =========================================================================
  // 4. ZONAS Y ESTADOS
  // =========================================================================
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [zoneCode, setZoneCode] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [zoneState, setZoneState] = useState('Mérida');
  const [zoneCustomState, setZoneCustomState] = useState('');
  const [zoneDesc, setZoneDesc] = useState('');
  const [zoneActive, setZoneActive] = useState(true);
  const [zoneToDelete, setZoneToDelete] = useState<Zone | null>(null);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);

  const handleSeedMeridaTucani = async () => {
    setIsSeedingDemo(true);
    try {
      const res = await apiFetch('/api/seed/merida-tucani', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error cargando datos de prueba');
      showMessage('success', data.summary || 'Catálogo e inventario de Mérida / Tucaní cargado correctamente.');
      await Promise.all([loadRates(), loadCategories(), loadUsersAndBranches(), loadZones()]);
      onRateUpdated?.();
    } catch (err: any) {
      showMessage('error', err.message || 'No se pudieron cargar los datos de prueba.');
    } finally {
      setIsSeedingDemo(false);
    }
  };

  const loadZones = async () => {
    try {
      const res = await apiFetch('/api/zones');
      if (res.ok) setZonesList(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const effectiveState = zoneState === '__custom__' ? zoneCustomState.trim() : zoneState;

  const duplicateZoneByCode = useMemo(() => {
    const q = normalizeText(zoneCode);
    if (!q) return null;
    return (
      zonesList.find(
        (z) => normalizeText(z.code) === q && (!editingZone || z.id !== editingZone.id)
      ) || null
    );
  }, [zoneCode, zonesList, editingZone]);

  const duplicateZoneByNameState = useMemo(() => {
    const qName = normalizeText(zoneName);
    const qState = normalizeText(effectiveState);
    if (!qName || !qState) return null;
    return (
      zonesList.find(
        (z) =>
          normalizeText(z.name) === qName &&
          normalizeText(z.state) === qState &&
          (!editingZone || z.id !== editingZone.id)
      ) || null
    );
  }, [zoneName, effectiveState, zonesList, editingZone]);

  const similarZones = useMemo(() => {
    const qCode = normalizeText(zoneCode);
    const qName = normalizeText(zoneName);
    if (qCode.length < 2 && qName.length < 2) return [];
    return zonesList
      .filter(
        (z) =>
          (!editingZone || z.id !== editingZone.id) &&
          z.id !== duplicateZoneByCode?.id &&
          z.id !== duplicateZoneByNameState?.id &&
          ((qCode.length >= 2 && normalizeText(z.code).includes(qCode)) ||
            (qName.length >= 2 && normalizeText(z.name).includes(qName)))
      )
      .slice(0, 4);
  }, [zoneCode, zoneName, zonesList, editingZone, duplicateZoneByCode, duplicateZoneByNameState]);

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneCode.trim() || !zoneName.trim() || !effectiveState) {
      showMessage('error', 'Código, nombre de zona y estado son obligatorios.');
      return;
    }
    if (duplicateZoneByCode || duplicateZoneByNameState) {
      showMessage('error', 'Esta zona o código ya existe en el sistema.');
      return;
    }
    try {
      const url = editingZone ? `/api/zones/${editingZone.id}` : '/api/zones';
      const method = editingZone ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: zoneCode.trim().toUpperCase(),
          name: zoneName.trim(),
          state: effectiveState,
          description: zoneDesc.trim() || null,
          isActive: zoneActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar zona/estado');
      showMessage('success', editingZone ? 'Zona / Estado actualizado.' : 'Zona / Estado creado exitosamente.');
      setEditingZone(null);
      setZoneCode('');
      setZoneName('');
      setZoneDesc('');
      setZoneCustomState('');
      setZoneActive(true);
      loadZones();
    } catch (err: any) {
      showMessage('error', err.message || 'Error al guardar zona');
    }
  };

  const handleToggleZoneActive = async (z: Zone) => {
    try {
      const res = await apiFetch(`/api/zones/${z.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !z.isActive }),
      });
      if (res.ok) loadZones();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteZone = async () => {
    if (!zoneToDelete) return;
    try {
      const res = await apiFetch(`/api/zones/${zoneToDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
      showMessage('success', `Zona "${zoneToDelete.name}" eliminada.`);
      setZoneToDelete(null);
      loadZones();
    } catch (err: any) {
      showMessage('error', err.message || 'Error al eliminar zona');
      setZoneToDelete(null);
    }
  };

  // Load initial admin resources on mount
  useEffect(() => {
    loadRates();
    loadCategories();
    loadUsersAndBranches();
    loadZones();
    loadAuditLogs();
  }, []);

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    gerente: 'Administradora / Gerente',
    cajero: 'Caja / Ventas',
    almacen: 'Almacén / Inventario',
    contador: 'Contador',
  };

  const rate = exchangeRate?.rate || 76.5;
  const syncSnapshot = getOfflineSyncState();

  return (
    <div
      id="panel-admin-config"
      className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs overflow-hidden transition-colors"
    >
      {/* Header & Segmented Navigation Tabs */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#262f3c] flex flex-col gap-3 bg-slate-50/70 dark:bg-[#1a2029]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Configuración, Seguridad y Respaldo General
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Administre la tasa del día BCV, sucursales, usuarios con claves y permisos por módulo, copias de seguridad, bitácora, categorías y zonas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {hasPermission('backup') && (
              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={isExportingBackup}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                title="Descargar respaldo completo de toda la base de datos en archivo JSON"
              >
                <HardDriveDownload className="w-3.5 h-3.5" />
                <span>{isExportingBackup ? 'Generando Respaldo...' : 'Hacer Copia de Seguridad'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSeedMeridaTucani}
              disabled={isSeedingDemo}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-60 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              title="Verifica o recarga el inventario y directorio de prueba de Mérida / Tucaní"
            >
              <Database className={`w-3.5 h-3.5 ${isSeedingDemo ? 'animate-pulse' : ''}`} />
              <span>{isSeedingDemo ? 'Cargando datos...' : 'Datos Mérida / Tucaní'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-[#12161d] rounded-lg border border-slate-200 dark:border-[#262f3c]">
          {hasPermission('exchange') && (
            <button
              type="button"
              onClick={() => setActiveTab('tasa')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'tasa'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Tasa del Día (BCV)</span>
            </button>
          )}

          {hasPermission('branches') && (
            <button
              type="button"
              onClick={() => setActiveTab('sucursales')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'sucursales'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Sucursales ({branchesList.length})</span>
            </button>
          )}

          {hasPermission('users_admin') && (
            <button
              type="button"
              onClick={() => setActiveTab('operadores')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'operadores'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Usuarios y Claves ({usersList.length})</span>
            </button>
          )}

          {hasPermission('backup') && (
            <button
              type="button"
              onClick={() => setActiveTab('backup')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'backup'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <HardDriveDownload className="w-3.5 h-3.5" />
              <span>Copia de Seguridad</span>
            </button>
          )}

          {hasPermission('backup') && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('auditoria');
                void loadAuditLogs();
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'auditoria'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Registro por Usuario ({auditLogs.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('categorias')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'categorias'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Categorías ({categoriesList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('zonas')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'zonas'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Zonas / Estados ({zonesList.length})</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mx-5 mt-4 p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 1: TASA DEL DÍA / BANCO CENTRAL DE VENEZUELA (BCV)            */}
      {/* ================================================================= */}
      {activeTab === 'tasa' && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Sync BCV & Manual Change */}
          <div className="lg:col-span-6 space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-[#15241e] border border-emerald-200 dark:border-emerald-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 block">
                  Tasa Vigente en Todo el Sistema
                </span>
                <span className="text-2xl font-black text-emerald-950 dark:text-emerald-200 font-mono tabular-nums">
                  Bs. {rate.toFixed(2)} / $
                </span>
                <span className="block text-[11px] text-emerald-700 dark:text-emerald-400/80 mt-0.5">
                  {exchangeRate?.source || 'BCV Oficial'} · Fecha: {exchangeRate?.date || 'Hoy'}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSyncBcv}
                disabled={isSyncingBcv}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-xs transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncingBcv ? 'animate-spin' : ''}`} />
                <span>{isSyncingBcv ? 'Consultando BCV...' : 'Actualizar desde BCV'}</span>
              </button>
            </div>

            <form
              onSubmit={handleSaveManualRate}
              className="p-4 rounded-xl bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] space-y-3 text-xs"
            >
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Cambiar Tasa Manualmente
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Nueva Tasa (Bs. por 1 USD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder={`ej. ${rate.toFixed(2)}`}
                    value={manualRate}
                    onChange={(e) => setManualRate(e.target.value)}
                    className="w-full py-2 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-600 tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Fuente / Referencia
                  </label>
                  <select
                    value={manualSource}
                    onChange={(e) => setManualSource(e.target.value)}
                    className="w-full py-2 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  >
                    <option value="Banco Central de Venezuela (BCV Oficial)">BCV Oficial (Manual)</option>
                    <option value="Tasa Administrativa del Día">Tasa Administrativa del Día</option>
                    <option value="Ajuste Gerencia">Ajuste Gerencia</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={isSavingRate}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingRate ? 'Guardando...' : 'Aplicar Nueva Tasa'}</span>
              </button>
            </form>
          </div>

          {/* Right: Rate History */}
          <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden flex flex-col">
            <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] text-xs font-bold text-slate-800 dark:text-slate-200">
              Historial Reciente de Tasas Registradas
            </div>
            <div className="overflow-y-auto max-h-60 divide-y divide-slate-100 dark:divide-[#262f3c] text-xs">
              {rateHistory.length === 0 ? (
                <div className="p-6 text-center text-slate-400">Sin historial registrado aún.</div>
              ) : (
                rateHistory.slice(0, 10).map((r) => (
                  <div key={r.id} className="px-3.5 py-2 flex items-center justify-between">
                    <div>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{r.date}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-2">{r.source}</span>
                    </div>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      Bs. {r.rate.toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 1B: GESTIÓN Y CREACIÓN DE SUCURSALES (SEDES ROECA)            */}
      {/* ================================================================= */}
      {activeTab === 'sucursales' && hasPermission('branches') && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Form: Crear Nueva Sucursal */}
          <form
            onSubmit={handleCreateBranch}
            className="lg:col-span-5 p-4 rounded-xl bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] space-y-3 text-xs self-start"
          >
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <GitBranch className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Registrar Nueva Sucursal / Sede</span>
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Expanda la operación de Distribuidora ROECA con nuevas tiendas, depósitos o puntos de venta.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Código de Sucursal *
                </label>
                <input
                  type="text"
                  placeholder="ej. ROEC-02"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  className={`w-full py-2 px-3 bg-white dark:bg-[#12161d] border rounded-lg font-mono uppercase text-slate-900 dark:text-slate-100 focus:outline-hidden ${
                    duplicateBranchByCode
                      ? 'border-rose-500 ring-1 ring-rose-500/40'
                      : 'border-slate-200 dark:border-[#2d3748] focus:border-teal-600'
                  }`}
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Teléfono de Contacto
                </label>
                <input
                  type="text"
                  placeholder="+58 414-0000000"
                  value={branchPhone}
                  onChange={(e) => setBranchPhone(e.target.value)}
                  className="w-full py-2 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-teal-600"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Nombre de la Sucursal *
              </label>
              <input
                type="text"
                placeholder="ej. Sucursal El Vigía / Sede Tucaní Norte"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className={`w-full py-2 px-3 bg-white dark:bg-[#12161d] border rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden ${
                  duplicateBranchByName
                    ? 'border-amber-500 ring-1 ring-amber-500/40'
                    : 'border-slate-200 dark:border-[#2d3748] focus:border-teal-600'
                }`}
                required
              />
            </div>

            {(duplicateBranchByCode || duplicateBranchByName) && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 rounded-lg text-[11px] text-rose-800 dark:text-rose-200 flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>
                  {duplicateBranchByCode
                    ? `El código "${duplicateBranchByCode.code}" ya pertenece a "${duplicateBranchByCode.name}".`
                    : `Ya existe una sucursal con el nombre "${duplicateBranchByName?.name}".`}
                </span>
              </div>
            )}

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Dirección / Ubicación Física
              </label>
              <input
                type="text"
                placeholder="Av. Panamericana, Sector Centro, Mérida..."
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
                className="w-full py-2 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-teal-600"
              />
            </div>

            <label className="flex items-center gap-2 p-2.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={branchIsMain}
                onChange={(e) => setBranchIsMain(e.target.checked)}
                className="w-4 h-4 accent-teal-600 rounded cursor-pointer"
              />
              <span className="text-slate-700 dark:text-slate-300 font-semibold">
                Designar como Sede Principal / Casa Matriz
              </span>
            </label>

            <button
              type="submit"
              disabled={isSavingBranch || Boolean(duplicateBranchByCode) || Boolean(duplicateBranchByName)}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{isSavingBranch ? 'Registrando Sucursal...' : 'Crear Sucursal'}</span>
            </button>
          </form>

          {/* List: Sucursales Registradas */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden flex flex-col">
            <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
              <span>Sucursales Activas ({branchesList.length})</span>
              <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                Sede operando: <strong className="text-teal-600 dark:text-teal-400">{activeBranch?.name || 'Principal'}</strong>
              </span>
            </div>
            <div className="overflow-y-auto max-h-80 divide-y divide-slate-100 dark:divide-[#262f3c] text-xs">
              {branchesList.length === 0 ? (
                <div className="p-6 text-center text-slate-400">No hay sucursales registradas aún.</div>
              ) : (
                branchesList.map((b) => {
                  const isActive = activeBranch?.id === b.id;
                  return (
                    <div
                      key={b.id}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        isActive
                          ? 'bg-teal-50/70 dark:bg-teal-950/25'
                          : 'hover:bg-slate-50 dark:hover:bg-[#1c222b]/70'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`p-2 rounded-lg shrink-0 ${
                            isActive
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-100 dark:bg-[#252e3d] text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          <Building className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                              {b.code}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              {b.name}
                            </span>
                            {b.isMain && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                Principal
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {b.address && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3 shrink-0" />
                                {b.address}
                              </span>
                            )}
                            {b.phone && (
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Phone className="w-3 h-3 shrink-0" />
                                {b.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-950/60 border border-teal-300 dark:border-teal-800 px-2.5 py-1 rounded-lg">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Sede Activa
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveBranch(b);
                              showMessage('success', `Operando ahora en sucursal: ${b.name} (${b.code}).`);
                            }}
                            className="px-3 py-1.5 bg-white hover:bg-slate-100 dark:bg-[#12161d] dark:hover:bg-[#252e3d] border border-slate-200 dark:border-[#2d3748] text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors"
                          >
                            Operar Aquí
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: CATEGORÍAS DE PRODUCTOS                                    */}
      {/* ================================================================= */}
      {activeTab === 'categorias' && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Form */}
          <form
            onSubmit={handleSaveCategory}
            className="lg:col-span-5 p-4 rounded-xl bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] space-y-3 text-xs self-start"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {editingCategory ? `Editando: ${editingCategory.name}` : 'Agregar Nueva Categoría'}
              </h4>
              {editingCategory && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategory(null);
                    setCatName('');
                    setCatDesc('');
                  }}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-[11px] underline cursor-pointer"
                >
                  Cancelar edición
                </button>
              )}
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Nombre de la Categoría *
              </label>
              <input
                type="text"
                placeholder="ej. Víveres, Carnicería, Panadería, Higiene..."
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                className="w-full py-2 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-600"
                required
              />
            </div>

            {duplicateCategory && (
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-lg text-[11px]">
                <div className="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>La categoría «{duplicateCategory.name}» ya existe.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategory(duplicateCategory);
                    setCatName(duplicateCategory.name);
                    setCatDesc(duplicateCategory.description || '');
                  }}
                  className="mt-1.5 px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Cargar para Editar</span>
                </button>
              </div>
            )}

            {similarCategories.length > 0 && (
              <div className="p-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg space-y-1">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                  Categorías semejantes encontradas:
                </span>
                {similarCategories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-700 dark:text-slate-300">{c.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(c);
                        setCatName(c.name);
                        setCatDesc(c.description || '');
                      }}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Descripción (opcional)
              </label>
              <input
                type="text"
                placeholder="Breve descripción de los artículos..."
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                className="w-full py-2 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={Boolean(duplicateCategory)}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-rose-300 dark:disabled:bg-rose-950/60 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>
                {duplicateCategory
                  ? 'Categoría ya Existe'
                  : editingCategory
                  ? 'Guardar Cambios'
                  : 'Crear Categoría'}
              </span>
            </button>
          </form>

          {/* List */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden">
            <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] text-xs font-bold text-slate-800 dark:text-slate-200">
              Categorías Registradas ({categoriesList.length})
            </div>
            <div className="overflow-y-auto max-h-72 divide-y divide-slate-100 dark:divide-[#262f3c] text-xs">
              {categoriesList.length === 0 ? (
                <div className="p-6 text-center text-slate-400">No hay categorías registradas aún.</div>
              ) : (
                categoriesList.map((cat) => (
                  <div
                    key={cat.id}
                    className="px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1c222b]/70"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{cat.name}</div>
                      {cat.description && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {cat.description}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategory(cat);
                          setCatName(cat.name);
                          setCatDesc(cat.description || '');
                        }}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded cursor-pointer"
                        title="Editar categoría"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCatToDelete(cat)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded cursor-pointer"
                        title="Eliminar categoría"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: USUARIOS, CLAVES Y PERMISOS POR MÓDULO (CHECKBOXES)        */}
      {/* ================================================================= */}
      {activeTab === 'operadores' && hasPermission('users_admin') && (
        <div className="p-5 grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Form */}
          <form
            onSubmit={handleSaveOperator}
            className="xl:col-span-6 p-4 rounded-xl bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] space-y-3.5 text-xs self-start"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {editingUser ? `Editando Usuario: @${editingUser.username || editingUser.name}` : 'Crear Nuevo Usuario y Clave'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Defina usuario, clave secreta, nivel de seguridad y tilde los módulos donde puede ingresar.
                </p>
              </div>
              {editingUser && (
                <button
                  type="button"
                  onClick={resetOperatorForm}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-[11px] underline cursor-pointer shrink-0"
                >
                  Cancelar
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  placeholder="ej. María Gómez"
                  value={opName}
                  onChange={(e) => setOpName(e.target.value)}
                  className="w-full py-2 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-600"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Usuario (para iniciar sesión) *
                </label>
                <input
                  type="text"
                  placeholder="ej. admin, gerente, caja"
                  value={opUsername}
                  onChange={(e) => setOpUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  className="w-full py-2 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-600"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {editingUser ? 'Nueva Clave (dejar vacío para conservar)' : 'Clave de Acceso *'}
                </label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showOpPassword ? 'text' : 'password'}
                    placeholder={editingUser ? 'Opcional: escribir nueva clave' : 'Mínimo 4 caracteres'}
                    value={opPassword}
                    onChange={(e) => setOpPassword(e.target.value)}
                    className="w-full pl-8 pr-8 py-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-600"
                    required={!editingUser}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showOpPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Correo Electrónico (opcional)
                </label>
                <input
                  type="email"
                  placeholder="usuario@distribuidoraroeca.com"
                  value={opEmail}
                  onChange={(e) => setOpEmail(e.target.value)}
                  className="w-full py-2 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-600"
                />
              </div>
            </div>

            {(duplicateUserByUsername || duplicateUserByEmail) && (
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-lg text-[11px] flex items-center justify-between gap-2">
                <div className="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Ya existe un usuario con ese nombre o correo.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const u = duplicateUserByUsername || duplicateUserByEmail;
                    if (u) loadOperatorIntoForm(u);
                  }}
                  className="px-2 py-1 bg-amber-600 text-white rounded text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Editar</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nivel de Seguridad (Plantilla)
                </label>
                <select
                  value={opRole}
                  onChange={(e) => handleRolePresetChange(e.target.value as UserRole)}
                  className="w-full py-2 px-2.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="admin">Administrador (Acceso Total)</option>
                  <option value="gerente">Administradora / Gerente</option>
                  <option value="cajero">Caja / Facturación</option>
                  <option value="almacen">Almacén / Inventario</option>
                  <option value="contador">Contador / Finanzas</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Sucursal Asignada
                </label>
                <select
                  value={opBranchId}
                  onChange={(e) => setOpBranchId(e.target.value)}
                  className="w-full py-2 px-2.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100"
                >
                  {branchesList.length === 0 ? (
                    <option value="1">Sede Principal</option>
                  ) : (
                    branchesList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Per-module checkboxes (Tildar Módulos) */}
            <div className="p-3 rounded-xl bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Módulos Permitidos — Tilde dónde puede entrar ({opAllowedModules.length}/{ALL_MODULES.length})
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setOpAllowedModules([...ALL_MODULE_KEYS])}
                    className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                  >
                    Marcar todos
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <button
                    type="button"
                    onClick={() => setOpAllowedModules(['dashboard'])}
                    className="text-slate-500 hover:underline cursor-pointer"
                  >
                    Solo panel
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {ALL_MODULES.map((mod) => {
                  const checked = opAllowedModules.includes(mod.key);
                  return (
                    <button
                      key={mod.key}
                      type="button"
                      onClick={() => toggleModulePermission(mod.key)}
                      className={`p-2 rounded-lg border text-left flex items-start gap-2 transition-colors cursor-pointer ${
                        checked
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                          : 'bg-slate-50/70 dark:bg-[#181e28] border-slate-200 dark:border-[#262f3c] text-slate-500 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <span className="block font-semibold text-[11px] leading-tight truncate">
                          {mod.label}
                        </span>
                        <span className="block text-[10px] opacity-75 truncate">{mod.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={Boolean(duplicateUserByUsername) || Boolean(duplicateUserByEmail)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-rose-300 dark:disabled:bg-rose-950/60 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {duplicateUserByUsername || duplicateUserByEmail
                  ? 'Usuario ya Registrado'
                  : editingUser
                  ? 'Guardar Cambios y Permisos'
                  : 'Crear Usuario con Clave y Permisos'}
              </span>
            </button>
          </form>

          {/* Users List */}
          <div className="xl:col-span-6 rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
              <span>Usuarios Registrados ({usersList.length})</span>
              <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                Claves protegidas con cifrado seguro
              </span>
            </div>
            <div className="overflow-y-auto max-h-[540px] divide-y divide-slate-100 dark:divide-[#262f3c] text-xs">
              {usersList.length === 0 ? (
                <div className="p-6 text-center text-slate-400">No hay usuarios registrados aún.</div>
              ) : (
                usersList.map((u) => {
                  const branchName = branchesList.find((b) => b.id === u.branchId)?.name || 'Sede Principal';
                  const modList = u.allowedModules || ROLE_DEFAULT_MODULES[u.role] || [];
                  return (
                    <div
                      key={u.id}
                      className="p-3.5 hover:bg-slate-50 dark:hover:bg-[#1c222b]/70 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900 dark:text-slate-100">{u.name}</span>
                            <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              @{u.username || u.email.split('@')[0]}
                            </span>
                            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              · {roleLabels[u.role] || u.role}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {branchName} ·{' '}
                            <span className={u.isActive ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-500 font-semibold'}>
                              {u.isActive ? 'Activo' : 'Desactivado'}
                            </span>
                            {u.lastLoginAt && (
                              <span>
                                {' '}· Último ingreso: {new Date(u.lastLoginAt).toLocaleString('es-VE')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleUserActive(u)}
                            className={`p-1.5 rounded cursor-pointer ${
                              u.isActive
                                ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252e3d]'
                            }`}
                            title={u.isActive ? 'Desactivar usuario' : 'Activar usuario'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => loadOperatorIntoForm(u)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded cursor-pointer"
                            title="Editar usuario, clave y módulos"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setUserToDelete(u)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded cursor-pointer"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Enabled modules summary */}
                      <div className="flex flex-wrap gap-1">
                        {modList.map((mk) => {
                          const label = ALL_MODULES.find((m) => m.key === mk)?.label || mk;
                          return (
                            <span
                              key={mk}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c] text-slate-600 dark:text-slate-300"
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 5: COPIA DE SEGURIDAD GENERAL Y RESTAURACIÓN                  */}
      {/* ================================================================= */}
      {activeTab === 'backup' && hasPermission('backup') && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
          {/* Export General Backup */}
          <div className="lg:col-span-6 p-5 rounded-xl bg-sky-50/70 dark:bg-[#131d29] border border-sky-200 dark:border-sky-900/60 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <HardDriveDownload className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Copia de Seguridad General de la Base de Datos
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                  Descargue un respaldo íntegro y verificable (.JSON) con todas las facturas, clientes, proveedores, inventario, abonos CxC/CxP, tasas BCV, usuarios, zonas y bitácora.
                </p>
              </div>
            </div>

            {lastBackupMeta && (
              <div className="p-3 rounded-lg bg-white dark:bg-[#12161d] border border-sky-200 dark:border-sky-900/50 text-[11px] space-y-1">
                <div className="font-semibold text-slate-700 dark:text-slate-200">
                  Última copia descargada: {new Date(lastBackupMeta.exportedAt).toLocaleString('es-VE')}
                </div>
                <div className="text-slate-500 dark:text-slate-400 font-mono">
                  {lastBackupMeta.totalRecords} registros · Sello SHA-256: {lastBackupMeta.checksumShort}...
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleDownloadBackup}
              disabled={isExportingBackup}
              className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors"
            >
              {isExportingBackup ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Empaquetando toda la base de datos...
                </>
              ) : (
                <>
                  <HardDriveDownload className="w-4 h-4" />
                  Descargar Copia de Seguridad General (.JSON)
                </>
              )}
            </button>

            {/* Cloud Persistence & Offline Sync Status */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-900 dark:text-slate-100 block">
                    Base de Datos Permanente + Caché Offline
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {syncSnapshot.isOnline
                      ? 'Conectado a Firestore en la nube · Información persistente.'
                      : `Modo sin internet activo (${syncSnapshot.pendingWrites} pendientes por subir).`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSyncCloudNow}
                disabled={isSyncingNow}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg font-semibold text-[11px] flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                <span>Sincronizar Ahora</span>
              </button>
            </div>
          </div>

          {/* Restore General Backup */}
          <div className="lg:col-span-6 p-5 rounded-xl bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-emerald-700 text-white flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Restaurar desde Copia de Seguridad
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Cargue un archivo de respaldo previamente descargado para recuperar productos, clientes, proveedores, facturas y configuraciones verificando su sello de integridad.
                </p>
              </div>
            </div>

            <label className="block border-2 border-dashed border-slate-300 dark:border-[#2d3748] hover:border-emerald-500 rounded-xl p-5 text-center cursor-pointer transition-colors bg-white dark:bg-[#12161d]">
              <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
              <span className="block font-bold text-slate-800 dark:text-slate-200">
                Seleccionar archivo de respaldo (.json)
              </span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Verificación automática de integridad SHA-256 antes de restaurar
              </span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleSelectRestoreFile}
                className="hidden"
              />
            </label>

            {pendingRestorePayload && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2.5">
                <div className="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Archivo listo para restaurar: {pendingRestoreFileName}</span>
                </div>
                <div className="text-[11px] text-amber-900 dark:text-amber-300 space-y-0.5 font-mono">
                  <div>Fecha respaldo: {pendingRestorePayload.exportedAt || 'No especificada'}</div>
                  <div>Registros detectados: {pendingRestorePayload.totalRecords || 'Varios'}</div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleConfirmRestore}
                    disabled={isRestoringBackup}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    {isRestoringBackup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    <span>{isRestoringBackup ? 'Restaurando...' : 'Confirmar Restauración'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingRestorePayload(null);
                      setPendingRestoreFileName('');
                    }}
                    className="px-3 py-2 bg-slate-200 dark:bg-[#252c38] text-slate-700 dark:text-slate-300 rounded-lg font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 6: REGISTRO DE ACTIVIDAD POR USUARIO (AUDITORÍA)              */}
      {/* ================================================================= */}
      {activeTab === 'auditoria' && hasPermission('backup') && (
        <div className="p-5 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                Bitácora de Actividad por Usuario
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Historial permanente de inicios de sesión, facturación, abonos, cargas de mercancía, cambios de usuarios y copias de seguridad.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={auditUserFilter}
                onChange={(e) => setAuditUserFilter(e.target.value)}
                className="py-1.5 px-2.5 bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs"
              >
                <option value="todos">Todos los usuarios</option>
                {Array.from(new Set(auditLogs.map((l) => l.operatorUsername))).map((u) => (
                  <option key={u} value={u}>
                    @{u}
                  </option>
                ))}
              </select>

              <select
                value={auditModuleFilter}
                onChange={(e) => setAuditModuleFilter(e.target.value)}
                className="py-1.5 px-2.5 bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs"
              >
                <option value="todos">Todos los módulos</option>
                <option value="auth">Seguridad / Accesos</option>
                <option value="billing">Facturación POS</option>
                <option value="cxc">Cuentas por Cobrar</option>
                <option value="cxp">Cuentas por Pagar</option>
                <option value="receiving">Carga de Mercancía</option>
                <option value="exchange">Tasa BCV</option>
                <option value="users_admin">Usuarios y Permisos</option>
                <option value="backup">Copia de Seguridad</option>
              </select>

              <button
                type="button"
                onClick={() => void loadAuditLogs()}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Actualizar</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] text-[11px] text-slate-600 dark:text-slate-400 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Fecha y Hora</th>
                    <th className="py-2.5 px-3 font-semibold">Usuario</th>
                    <th className="py-2.5 px-3 font-semibold">Módulo</th>
                    <th className="py-2.5 px-3 font-semibold">Acción</th>
                    <th className="py-2.5 px-3 font-semibold">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]">
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Sin registros de actividad para este filtro todavía.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-[#1c222b]/60">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('es-VE')}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                            @{log.operatorUsername}
                          </span>
                          <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                            {log.operatorName}
                          </span>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c] text-[10px] font-semibold uppercase">
                            {log.module}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {log.action}
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-300 max-w-md truncate" title={log.details || ''}>
                          {log.details || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 4: ZONAS Y ESTADOS                                            */}
      {/* ================================================================= */}
      {activeTab === 'zonas' && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Form */}
          <form
            onSubmit={handleSaveZone}
            className="lg:col-span-5 p-4 rounded-xl bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] space-y-3 text-xs self-start"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {editingZone ? `Editando: ${editingZone.code}` : 'Crear Zona o Estado'}
              </h4>
              {editingZone && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingZone(null);
                    setZoneCode('');
                    setZoneName('');
                    setZoneState('Distrito Capital');
                    setZoneCustomState('');
                    setZoneDesc('');
                    setZoneActive(true);
                  }}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-[11px] underline cursor-pointer"
                >
                  Cancelar
                </button>
              )}
            </div>

            <div className="grid grid-cols-12 gap-2.5">
              <div className="col-span-5">
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Código *
                </label>
                <input
                  type="text"
                  placeholder="ej. ZON-01"
                  value={zoneCode}
                  onChange={(e) => setZoneCode(e.target.value.toUpperCase())}
                  className="w-full py-2 px-2.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-600"
                  required
                />
              </div>

              <div className="col-span-7">
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Estado *
                </label>
                <select
                  value={zoneState}
                  onChange={(e) => setZoneState(e.target.value)}
                  className="w-full py-2 px-2.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100"
                >
                  {VENEZUELA_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                  <option value="__custom__">Otro Estado / Región...</option>
                </select>
              </div>
            </div>

            {zoneState === '__custom__' && (
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Escriba el Estado / Región *
                </label>
                <input
                  type="text"
                  placeholder="Nombre del estado o región"
                  value={zoneCustomState}
                  onChange={(e) => setZoneCustomState(e.target.value)}
                  className="w-full py-2 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-600"
                  required
                />
              </div>
            )}

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Nombre de la Zona / Sector / Ruta *
              </label>
              <input
                type="text"
                placeholder="ej. Zona Centro, Chacao, Valencia Norte, Maracaibo Sur..."
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                className="w-full py-2 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-emerald-600"
                required
              />
            </div>

            {(duplicateZoneByCode || duplicateZoneByNameState) && (
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-lg text-[11px]">
                <div className="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Esta zona o código ya existe.</span>
                </div>
                <div className="text-amber-800 dark:text-amber-300 mt-0.5">
                  {(duplicateZoneByCode || duplicateZoneByNameState)?.code} ·{' '}
                  {(duplicateZoneByCode || duplicateZoneByNameState)?.name} (
                  {(duplicateZoneByCode || duplicateZoneByNameState)?.state})
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const z = duplicateZoneByCode || duplicateZoneByNameState;
                    if (z) {
                      setEditingZone(z);
                      setZoneCode(z.code);
                      setZoneName(z.name);
                      if (VENEZUELA_STATES.includes(z.state)) {
                        setZoneState(z.state);
                        setZoneCustomState('');
                      } else {
                        setZoneState('__custom__');
                        setZoneCustomState(z.state);
                      }
                      setZoneDesc(z.description || '');
                      setZoneActive(z.isActive);
                    }
                  }}
                  className="mt-1.5 px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Cargar para Editar</span>
                </button>
              </div>
            )}

            {similarZones.length > 0 && (
              <div className="p-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg space-y-1">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                  Zonas semejantes encontradas:
                </span>
                {similarZones.map((z) => (
                  <div key={z.id} className="flex items-center justify-between text-[11px]">
                    <span className="truncate text-slate-700 dark:text-slate-300">
                      <strong>{z.code}</strong> · {z.name} ({z.state})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingZone(z);
                        setZoneCode(z.code);
                        setZoneName(z.name);
                        if (VENEZUELA_STATES.includes(z.state)) {
                          setZoneState(z.state);
                          setZoneCustomState('');
                        } else {
                          setZoneState('__custom__');
                          setZoneCustomState(z.state);
                        }
                        setZoneDesc(z.description || '');
                        setZoneActive(z.isActive);
                      }}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold ml-2 shrink-0 cursor-pointer"
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Observación / Ruta de Despacho (opcional)
              </label>
              <input
                type="text"
                placeholder="ej. Despacho Lunes y Jueves · Ruta Oeste"
                value={zoneDesc}
                onChange={(e) => setZoneDesc(e.target.value)}
                className="w-full py-2 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={Boolean(duplicateZoneByCode) || Boolean(duplicateZoneByNameState)}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-rose-300 dark:disabled:bg-rose-950/60 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <MapPin className="w-4 h-4" />
              <span>
                {duplicateZoneByCode || duplicateZoneByNameState
                  ? 'Zona ya Registrada'
                  : editingZone
                  ? 'Guardar Cambios'
                  : 'Crear Zona / Estado'}
              </span>
            </button>
          </form>

          {/* List */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden">
            <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#1c222b] border-b border-slate-200 dark:border-[#262f3c] text-xs font-bold text-slate-800 dark:text-slate-200">
              Zonas y Estados Configurados ({zonesList.length})
            </div>
            <div className="overflow-y-auto max-h-72 divide-y divide-slate-100 dark:divide-[#262f3c] text-xs">
              {zonesList.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  Aún no hay zonas o estados registrados. Cree el primero en el formulario izquierdo.
                </div>
              ) : (
                zonesList.map((z) => (
                  <div
                    key={z.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-[#1c222b]/70"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{z.code}</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{z.name}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">· {z.state}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {z.description || 'Sin observación de ruta'} ·{' '}
                        <span className={z.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>
                          {z.isActive ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleZoneActive(z)}
                        className={`p-1.5 rounded cursor-pointer ${
                          z.isActive
                            ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                            : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252e3d]'
                        }`}
                        title={z.isActive ? 'Desactivar zona' : 'Activar zona'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingZone(z);
                          setZoneCode(z.code);
                          setZoneName(z.name);
                          if (VENEZUELA_STATES.includes(z.state)) {
                            setZoneState(z.state);
                            setZoneCustomState('');
                          } else {
                            setZoneState('__custom__');
                            setZoneCustomState(z.state);
                          }
                          setZoneDesc(z.description || '');
                          setZoneActive(z.isActive);
                        }}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded cursor-pointer"
                        title="Editar zona"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setZoneToDelete(z)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded cursor-pointer"
                        title="Eliminar zona"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* In-app Delete Confirmations (never window.confirm) */}
      {(catToDelete || userToDelete || zoneToDelete) && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-[#2d3748]">
            <h4 className="text-sm font-bold flex items-center gap-2 text-rose-700 dark:text-rose-400 mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Confirmar Eliminación</span>
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4">
              {catToDelete && `¿Desea eliminar la categoría "${catToDelete.name}"?`}
              {userToDelete && `¿Desea eliminar al operador "${userToDelete.name}" (${userToDelete.email})?`}
              {zoneToDelete && `¿Desea eliminar la zona "${zoneToDelete.code} · ${zoneToDelete.name}" (${zoneToDelete.state})?`}
            </p>
            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setCatToDelete(null);
                  setUserToDelete(null);
                  setZoneToDelete(null);
                }}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1f2530] text-slate-700 dark:text-slate-300 rounded-lg font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (catToDelete) handleDeleteCategory();
                  else if (userToDelete) handleDeleteUser();
                  else if (zoneToDelete) handleDeleteZone();
                }}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold cursor-pointer"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
