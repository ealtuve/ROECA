import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Landmark,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  MapPin,
} from 'lucide-react';
import { Supplier, ExchangeRate, Zone } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { VENEZUELA_STATES } from '../lib/venezuelaGeo.ts';

interface SuppliersProps {
  exchangeRate: ExchangeRate | null;
  onNavigateToCxP?: (supplier: Supplier) => void;
}

const normalizeText = (str: string) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const Suppliers: React.FC<SuppliersProps> = ({ exchangeRate, onNavigateToCxP }) => {
  const { hasPermission } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterZoneId, setFilterZoneId] = useState('');
  const [withDebtOnly, setWithDebtOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [idDoc, setIdDoc] = useState('');
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [stateName, setStateName] = useState('Mérida');
  const [zoneId, setZoneId] = useState('');
  const [formError, setFormError] = useState('');

  const rate = exchangeRate?.rate || 76.5;

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [sRes, zRes] = await Promise.all([apiFetch('/api/suppliers'), apiFetch('/api/zones')]);
      if (sRes.ok) setSuppliers(await sRes.json());
      if (zRes.ok) setZones(await zRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const allStates = useMemo(() => {
    const set = new Set<string>(VENEZUELA_STATES);
    zones.forEach((z) => {
      if (z.state) set.add(z.state);
    });
    suppliers.forEach((s) => {
      if (s.state) set.add(s.state);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [zones, suppliers]);

  const modalZonesForState = useMemo(() => {
    if (!stateName) return zones.filter((z) => z.isActive);
    return zones.filter(
      (z) => z.isActive && normalizeText(z.state) === normalizeText(stateName)
    );
  }, [zones, stateName]);

  const filterZonesForState = useMemo(() => {
    if (!filterState) return zones;
    return zones.filter((z) => normalizeText(z.state) === normalizeText(filterState));
  }, [zones, filterState]);

  const openCreateModal = () => {
    setEditingSupplier(null);
    setIdDoc('');
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setStateName('Mérida');
    setZoneId('');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (s: Supplier) => {
    setEditingSupplier(s);
    setIdDoc(s.idDoc);
    setName(s.name);
    setContactPerson(s.contactPerson || '');
    setPhone(s.phone || '');
    setEmail(s.email || '');
    setAddress(s.address || '');
    setStateName(s.state || '');
    setZoneId(s.zoneId ? String(s.zoneId) : '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleStateChangeInModal = (newState: string) => {
    setStateName(newState);
    if (zoneId) {
      const selectedZone = zones.find((z) => String(z.id) === zoneId);
      if (selectedZone && newState && normalizeText(selectedZone.state) !== normalizeText(newState)) {
        setZoneId('');
      }
    }
  };

  const handleZoneChangeInModal = (newZoneId: string) => {
    setZoneId(newZoneId);
    if (newZoneId) {
      const z = zones.find((item) => String(item.id) === newZoneId);
      if (z?.state) setStateName(z.state);
    }
  };

  // Automatic real-time duplicate & similarity detection
  const duplicateByDoc = useMemo(() => {
    const trimmed = normalizeText(idDoc);
    if (!trimmed) return null;
    return (
      suppliers.find((s) => s.id !== editingSupplier?.id && normalizeText(s.idDoc) === trimmed) ||
      null
    );
  }, [idDoc, suppliers, editingSupplier]);

  const exactMatchByName = useMemo(() => {
    const trimmed = normalizeText(name);
    if (!trimmed) return null;
    return (
      suppliers.find((s) => s.id !== editingSupplier?.id && normalizeText(s.name) === trimmed) ||
      null
    );
  }, [name, suppliers, editingSupplier]);

  const similarSuppliers = useMemo(() => {
    const nameQuery = normalizeText(name);
    const docQuery = normalizeText(idDoc);
    if (nameQuery.length < 2 && docQuery.length < 2) return [];

    const tokens = nameQuery.split(/\s+/).filter((t) => t.length > 1);

    return suppliers
      .filter((s) => s.id !== editingSupplier?.id)
      .map((s) => {
        const sName = normalizeText(s.name);
        const sDoc = normalizeText(s.idDoc);
        let score = 0;

        if (docQuery.length >= 2) {
          if (sDoc === docQuery) score += 50;
          else if (sDoc.startsWith(docQuery)) score += 30;
          else if (sDoc.includes(docQuery)) score += 15;
        }
        if (nameQuery.length >= 2) {
          if (sName === nameQuery) score += 60;
          else if (sName.startsWith(nameQuery)) score += 35;
          else if (sName.includes(nameQuery)) score += 20;
          tokens.forEach((tok) => {
            if (sName.includes(tok)) score += 10;
          });
        }
        return { supplier: s, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => item.supplier);
  }, [name, idDoc, suppliers, editingSupplier]);

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idDoc.trim() || !name.trim()) {
      setFormError('RIF y Nombre de la empresa son requeridos.');
      return;
    }

    if (duplicateByDoc) {
      setFormError(
        `No se puede guardar: el RIF "${idDoc.trim()}" ya pertenece al proveedor "${duplicateByDoc.name}".`
      );
      return;
    }

    if (!editingSupplier && exactMatchByName) {
      setFormError(
        `Ya existe un proveedor con el nombre idéntico "${exactMatchByName.name}" (${exactMatchByName.idDoc}). Verifique para evitar duplicados.`
      );
      return;
    }

    const chosenZone = zoneId ? zones.find((z) => String(z.id) === zoneId) : null;

    try {
      const payload = {
        idDoc: idDoc.trim(),
        name: name.trim(),
        contactPerson: contactPerson.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        state: stateName.trim() || chosenZone?.state || null,
        zoneId: chosenZone ? chosenZone.id : null,
        zoneName: chosenZone ? chosenZone.name : null,
      };

      const url = editingSupplier ? `/api/suppliers/${editingSupplier.id}` : '/api/suppliers';
      const method = editingSupplier ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al guardar proveedor');
      }

      setIsModalOpen(false);
      setSuccessMsg(
        editingSupplier
          ? '¡Proveedor actualizado correctamente!'
          : '¡Nuevo proveedor registrado exitosamente!'
      );
      setTimeout(() => setSuccessMsg(''), 5000);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Error en el servidor');
    }
  };

  const confirmDeleteSupplier = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch(`/api/suppliers/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Error al eliminar el proveedor');
      } else {
        setDeleteTarget(null);
        setSuccessMsg('Proveedor eliminado correctamente.');
        setTimeout(() => setSuccessMsg(''), 4000);
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = suppliers.filter((s) => {
    const q = normalizeText(searchTerm);
    const matchesSearch =
      !q ||
      normalizeText(s.name).includes(q) ||
      normalizeText(s.idDoc).includes(q) ||
      (s.contactPerson ? normalizeText(s.contactPerson).includes(q) : false) ||
      (s.state ? normalizeText(s.state).includes(q) : false) ||
      (s.zoneName ? normalizeText(s.zoneName).includes(q) : false);
    const matchesDebt = !withDebtOnly || s.currentBalanceUsd > 0.05;
    const matchesState = !filterState || normalizeText(s.state || '') === normalizeText(filterState);
    const matchesZone = !filterZoneId || String(s.zoneId || '') === filterZoneId;
    return matchesSearch && matchesDebt && matchesState && matchesZone;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-[#161b22] p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Directorio de Proveedores Comerciales
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#202734] text-slate-700 dark:text-slate-300 font-semibold font-mono">
              {suppliers.length} empresas
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Empresas mayoristas, productores locales, clasificación por estado/zona y saldos pendientes.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setWithDebtOnly(!withDebtOnly)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
              withDebtOnly
                ? 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                : 'bg-white dark:bg-[#1c222b] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#2d3748] hover:bg-slate-50 dark:hover:bg-[#242c38]'
            }`}
          >
            Solo con Saldo Pendiente
          </button>

          {hasPermission('suppliers') && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Proveedor</span>
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Search & Geo Filters */}
      <div className="bg-white dark:bg-[#161b22] p-4 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs transition-colors grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por RIF, representante, nombre, estado o zona..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-600 transition-colors"
          />
        </div>

        <div className="md:col-span-3">
          <select
            value={filterState}
            onChange={(e) => {
              setFilterState(e.target.value);
              setFilterZoneId('');
            }}
            className="w-full py-2 px-2.5 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100"
          >
            <option value="">Todos los Estados</option>
            {allStates.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <select
            value={filterZoneId}
            onChange={(e) => setFilterZoneId(e.target.value)}
            className="w-full py-2 px-2.5 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100"
          >
            <option value="">Todas las Zonas</option>
            {filterZonesForState.map((z) => (
              <option key={z.id} value={String(z.id)}>
                {z.name} ({z.state})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1f2530] border-b border-slate-200 dark:border-[#262f3c] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">RIF Fiscal</th>
                <th className="py-3 px-4">Empresa / Razón Social</th>
                <th className="py-3 px-4">Estado / Zona</th>
                <th className="py-3 px-4">Contacto</th>
                <th className="py-3 px-4 text-right">Saldo Por Pagar</th>
                <th className="py-3 px-4 text-center">Estado Comercial</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Cargando proveedores...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No se encontraron proveedores.
                  </td>
                </tr>
              ) : (
                filtered.map((supplier) => {
                  const hasDebt = supplier.currentBalanceUsd > 0.05;

                  return (
                    <tr
                      key={supplier.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-[#1f2530] transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {supplier.idDoc}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {supplier.name}
                        {supplier.address && (
                          <span className="block text-[11px] text-slate-400 dark:text-slate-500 font-normal truncate max-w-xs">
                            {supplier.address}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {supplier.state || supplier.zoneName ? (
                          <div className="space-y-0.5">
                            {supplier.state && (
                              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>{supplier.state}</span>
                              </div>
                            )}
                            {supplier.zoneName && (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 pl-4">
                                {supplier.zoneName}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Sin asignar</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                          {supplier.contactPerson || 'Representante de Ventas'}
                        </div>
                        {supplier.phone && <div className="text-[11px] font-mono">{supplier.phone}</div>}
                        {supplier.email && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[160px]">
                            {supplier.email}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className={hasDebt ? 'text-rose-700 dark:text-rose-400 font-bold' : 'text-slate-400'}>
                          Bs. {(supplier.currentBalanceUsd * rate).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          ${supplier.currentBalanceUsd.toFixed(2)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {hasDebt ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                            FACTURAS PENDIENTES
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                            AL DÍA
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {hasDebt && onNavigateToCxP && (
                            <button
                              onClick={() => onNavigateToCxP(supplier)}
                              className="p-1 text-rose-600 dark:text-rose-400 hover:bg-slate-100 dark:hover:bg-[#252d3b] rounded transition-colors cursor-pointer"
                              title="Ver CxP y Pagar"
                            >
                              <Landmark className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(supplier)}
                            className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#252d3b] rounded transition-colors cursor-pointer"
                            title="Editar proveedor"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => !hasDebt && setDeleteTarget(supplier)}
                            disabled={hasDebt}
                            className={`p-1 rounded transition-colors ${
                              hasDebt
                                ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                : 'text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-[#252d3b] cursor-pointer'
                            }`}
                            title={hasDebt ? 'Proveedor con facturas pendientes' : 'Eliminar proveedor'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Add / Edit Supplier Modal with Estado/Zona */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative my-auto max-h-[92vh] overflow-y-auto animate-in fade-in duration-150">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>{editingSupplier ? 'Modificar Ficha de Proveedor' : 'Registrar Nuevo Proveedor'}</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Clasifique el proveedor por estado y zona para reportes territoriales de compras y CxP.
              </p>
            </div>

            {formError && (
              <div className="mb-3 p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Duplicate RIF Alert */}
            {duplicateByDoc && (
              <div className="mb-3 p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 rounded-xl text-xs">
                <div className="flex items-start gap-2 text-rose-900 dark:text-rose-200 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="block font-bold">¡Proveedor ya registrado con este RIF!</span>
                    <span className="block text-[11px] font-normal mt-0.5">
                      El RIF <strong className="font-mono">{duplicateByDoc.idDoc}</strong> ya pertenece a{' '}
                      <strong>{duplicateByDoc.name}</strong>.
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditModal(duplicateByDoc)}
                      className="mt-2 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Cargar y Modificar este Proveedor</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Exact Name Match Alert */}
            {!duplicateByDoc && exactMatchByName && (
              <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-xl text-xs">
                <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="block font-bold">¡Ya existe un proveedor con este mismo nombre!</span>
                    <span className="block text-[11px] font-normal mt-0.5">
                      <strong>{exactMatchByName.name}</strong> ya está registrado con RIF{' '}
                      <strong className="font-mono">{exactMatchByName.idDoc}</strong>.
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditModal(exactMatchByName)}
                      className="mt-2 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Cargar Proveedor Existente</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    RIF Fiscal *
                  </label>
                  <input
                    type="text"
                    placeholder="J-00041372-0"
                    value={idDoc}
                    onChange={(e) => setIdDoc(e.target.value)}
                    className={`w-full py-1.5 px-3 bg-white dark:bg-[#1c222b] border rounded-lg focus:outline-hidden font-mono text-slate-900 dark:text-slate-100 ${
                      duplicateByDoc
                        ? 'border-rose-500 ring-1 ring-rose-500/40'
                        : 'border-slate-200 dark:border-[#2d3748] focus:border-emerald-600'
                    }`}
                    required
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Persona de Contacto
                  </label>
                  <input
                    type="text"
                    placeholder="Lic. Carlos Morales"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full py-1.5 px-3 bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nombre Comercial / Empresa *
                </label>
                <input
                  type="text"
                  placeholder="ej. Empresas Polar Comercial C.A."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full py-1.5 px-3 bg-white dark:bg-[#1c222b] border rounded-lg focus:outline-hidden text-slate-900 dark:text-slate-100 ${
                    exactMatchByName
                      ? 'border-amber-500 ring-1 ring-amber-500/40'
                      : 'border-slate-200 dark:border-[#2d3748] focus:border-emerald-600'
                  }`}
                  required
                />
              </div>

              {/* Live Similar Suppliers Found Panel */}
              {similarSuppliers.length > 0 && (
                <div className="p-2.5 bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Search className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Proveedores semejantes registrados ({similarSuppliers.length})</span>
                    </span>
                    <span className="text-[10px] text-slate-400">Verifique antes de crear</span>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-[#262f3c] max-h-28 overflow-y-auto">
                    {similarSuppliers.map((s) => (
                      <div key={s.id} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{s.name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            {s.idDoc} {s.state ? `· ${s.state}` : ''} {s.zoneName ? `/ ${s.zoneName}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openEditModal(s)}
                          className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 dark:bg-[#252e3d] dark:hover:bg-[#2f3b4f] text-slate-800 dark:text-slate-200 rounded text-[10px] font-semibold shrink-0 cursor-pointer"
                        >
                          Cargar / Editar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Estado & Zona Selection */}
              <div className="p-3 bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] rounded-xl space-y-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Ubicación Geográfica (Estado y Zona)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Estado
                    </label>
                    <select
                      value={stateName}
                      onChange={(e) => handleStateChangeInModal(e.target.value)}
                      className="w-full py-1.5 px-2.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      <option value="">— Seleccionar Estado —</option>
                      {allStates.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Zona / Ruta
                    </label>
                    <select
                      value={zoneId}
                      onChange={(e) => handleZoneChangeInModal(e.target.value)}
                      className="w-full py-1.5 px-2.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      <option value="">— Seleccionar Zona —</option>
                      {modalZonesForState.map((z) => (
                        <option key={z.id} value={String(z.id)}>
                          {z.code} — {z.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Teléfono</label>
                  <input
                    type="text"
                    placeholder="+58 274-8765432"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full py-1.5 px-3 bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Correo de Pedidos
                  </label>
                  <input
                    type="email"
                    placeholder="ventas@proveedor.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full py-1.5 px-3 bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Dirección / Planta
                </label>
                <textarea
                  rows={2}
                  placeholder="Zona Industrial, galpón, ciudad..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full py-1.5 px-3 bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1e2531] dark:hover:bg-[#252e3d] text-slate-700 dark:text-slate-300 rounded-lg font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(duplicateByDoc) || (!editingSupplier && Boolean(exactMatchByName))}
                  className={`flex-1 py-2 rounded-lg font-semibold cursor-pointer transition-colors ${
                    duplicateByDoc || (!editingSupplier && exactMatchByName)
                      ? 'bg-rose-300 dark:bg-rose-950/60 text-rose-800 dark:text-rose-400 cursor-not-allowed'
                      : 'bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white'
                  }`}
                >
                  {duplicateByDoc
                    ? 'RIF ya Registrado'
                    : !editingSupplier && exactMatchByName
                    ? 'Proveedor ya Existe'
                    : editingSupplier
                    ? 'Actualizar Proveedor'
                    : 'Guardar Proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-[#2d3748]">
            <h4 className="text-sm font-bold mb-1">¿Eliminar proveedor?</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Está a punto de eliminar a <strong>{deleteTarget.name}</strong> ({deleteTarget.idDoc}). Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 bg-slate-100 dark:bg-[#1e2531] text-slate-700 dark:text-slate-300 rounded-lg font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteSupplier}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold cursor-pointer"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
