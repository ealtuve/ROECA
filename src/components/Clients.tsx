import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  CheckCircle,
  MapPin,
  Ban,
  UserCheck,
  Award,
  ShieldOff,
  FileText,
} from 'lucide-react';
import { Client, ExchangeRate, Zone } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { VENEZUELA_STATES } from '../lib/venezuelaGeo.ts';
import { ClientInvoicesModal } from './ClientInvoicesModal.tsx';
import { ClientFormModal, getCreditRatingMeta } from './ClientFormModal.tsx';

export { getCreditRatingMeta };

interface ClientsProps {
  exchangeRate: ExchangeRate | null;
  onNavigateToCxC?: (client: Client) => void;
  onPaymentRegistered?: () => void;
}

const normalizeText = (str: string) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const Clients: React.FC<ClientsProps> = ({
  exchangeRate,
  onPaymentRegistered,
}) => {
  const { hasPermission } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [withDebtOnly, setWithDebtOnly] = useState(false);
  const [filterState, setFilterState] = useState('');
  const [filterZoneId, setFilterZoneId] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [selectedClientIdForInvoices, setSelectedClientIdForInvoices] = useState<number | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const rate = exchangeRate?.rate || 76.5;

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cRes, zRes] = await Promise.all([apiFetch('/api/clients'), apiFetch('/api/zones')]);
      if (cRes.ok) setClients(await cRes.json());
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
    clients.forEach((c) => {
      if (c.state) set.add(c.state);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [zones, clients]);

  const filterZonesForState = useMemo(() => {
    if (!filterState) return zones;
    return zones.filter((z) => normalizeText(z.state) === normalizeText(filterState));
  }, [zones, filterState]);

  const openCreateModal = () => {
    setEditingClient(null);
    setIsModalOpen(true);
  };

  const openEditModal = (c: Client) => {
    setEditingClient(c);
    setIsModalOpen(true);
  };

  const handleToggleSuspend = async (client: Client) => {
    const nextSuspended = !client.isSuspended;
    try {
      const res = await apiFetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSuspended: nextSuspended }),
      });
      if (res.ok) {
        setSuccessMsg(
          nextSuspended
            ? `Cliente "${client.name}" ha sido SUSPENDIDO. No podrá emitir nuevas facturas hasta reactivarlo.`
            : `Cliente "${client.name}" ha sido REACTIVADO correctamente.`
        );
        setTimeout(() => setSuccessMsg(''), 5000);
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const confirmDeleteClient = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch(`/api/clients/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        setErrorMsg(err.error || 'Error al eliminar el cliente');
        setTimeout(() => setErrorMsg(''), 5000);
        setDeleteTarget(null);
      } else {
        setDeleteTarget(null);
        setSuccessMsg('Cliente eliminado correctamente.');
        setTimeout(() => setSuccessMsg(''), 4000);
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = clients.filter((c) => {
    const q = normalizeText(searchTerm);
    const matchesSearch =
      !q ||
      normalizeText(c.name).includes(q) ||
      normalizeText(c.idDoc).includes(q) ||
      (c.phone ? normalizeText(c.phone).includes(q) : false) ||
      (c.state ? normalizeText(c.state).includes(q) : false) ||
      (c.zoneName ? normalizeText(c.zoneName).includes(q) : false);

    const matchesDebt = !withDebtOnly || c.currentBalanceUsd > 0.05;
    const matchesState = !filterState || normalizeText(c.state || '') === normalizeText(filterState);
    const matchesZone = !filterZoneId || String(c.zoneId || '') === filterZoneId;

    let matchesCat = true;
    if (filterCategory === 'suspendido') matchesCat = Boolean(c.isSuspended);
    else if (filterCategory === 'solo_contado') matchesCat = c.creditEnabled === false;
    else if (['excelente', 'regular', 'malo', 'nuevo'].includes(filterCategory)) {
      matchesCat = (c.creditRating || 'nuevo') === filterCategory;
    }

    return matchesSearch && matchesDebt && matchesState && matchesZone && matchesCat;
  });

  // Quick KPI counts
  const ratingCounts = useMemo(() => {
    return clients.reduce(
      (acc, c) => {
        if (c.isSuspended) acc.suspendidos += 1;
        if (c.creditEnabled === false) acc.soloContado += 1;
        const r = c.creditRating || 'nuevo';
        if (r === 'excelente') acc.excelente += 1;
        else if (r === 'regular') acc.regular += 1;
        else if (r === 'malo') acc.malo += 1;
        return acc;
      },
      { excelente: 0, regular: 0, malo: 0, suspendidos: 0, soloContado: 0 }
    );
  }, [clients]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-[#161b22] p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Directorio de Clientes y Control Crediticio
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#202734] text-slate-700 dark:text-slate-300 font-semibold font-mono">
              {clients.length} registrados
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Estado/zona, permisos de crédito y categorización automática. Haga clic en cualquier cliente para consultar sus facturas emitidas, ver detalles y abonar o cancelar créditos.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setWithDebtOnly(!withDebtOnly)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
              withDebtOnly
                ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                : 'bg-white dark:bg-[#1c222b] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#2d3748] hover:bg-slate-50 dark:hover:bg-[#242c38]'
            }`}
          >
            Solo con Deuda Activa
          </button>

          {hasPermission('clients') && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Cliente</span>
            </button>
          )}
        </div>
      </div>

      {/* Credit Category Quick Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setFilterCategory(filterCategory === 'excelente' ? '' : 'excelente')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            filterCategory === 'excelente'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 ring-1 ring-emerald-400'
              : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-[#262f3c] hover:border-emerald-300'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
            Excelente (A Tiempo)
          </span>
          <span className="text-xl font-black font-mono text-slate-900 dark:text-slate-100">
            {ratingCounts.excelente}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterCategory(filterCategory === 'regular' ? '' : 'regular')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            filterCategory === 'regular'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 ring-1 ring-amber-400'
              : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-[#262f3c] hover:border-amber-300'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
            Regular (Casi a Tiempo)
          </span>
          <span className="text-xl font-black font-mono text-slate-900 dark:text-slate-100">
            {ratingCounts.regular}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterCategory(filterCategory === 'malo' ? '' : 'malo')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            filterCategory === 'malo'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 ring-1 ring-rose-400'
              : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-[#262f3c] hover:border-rose-300'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 block">
            Malo (Moroso)
          </span>
          <span className="text-xl font-black font-mono text-slate-900 dark:text-slate-100">
            {ratingCounts.malo}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterCategory(filterCategory === 'solo_contado' ? '' : 'solo_contado')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            filterCategory === 'solo_contado'
              ? 'bg-slate-100 dark:bg-slate-800 border-slate-400 ring-1 ring-slate-400'
              : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-[#262f3c] hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
            Solo Contado
          </span>
          <span className="text-xl font-black font-mono text-slate-900 dark:text-slate-100">
            {ratingCounts.soloContado}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterCategory(filterCategory === 'suspendido' ? '' : 'suspendido')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            filterCategory === 'suspendido'
              ? 'bg-rose-100 dark:bg-rose-950/60 border-rose-500 ring-1 ring-rose-500'
              : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-[#262f3c] hover:border-rose-400'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300 block">
            Suspendidos
          </span>
          <span className="text-xl font-black font-mono text-rose-700 dark:text-rose-400">
            {ratingCounts.suspendidos}
          </span>
        </button>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-300 font-semibold shadow-xs">
          {errorMsg}
        </div>
      )}

      {/* Search & Geo/Category Filters */}
      <div className="bg-white dark:bg-[#161b22] p-4 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs transition-colors grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar cliente por nombre, RIF, teléfono, estado o zona..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-600 transition-colors"
          />
        </div>

        <div className="md:col-span-2">
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

        <div className="md:col-span-2">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full py-2 px-2.5 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100"
          >
            <option value="">Todas las Categorías</option>
            <option value="excelente">Excelente</option>
            <option value="regular">Regular</option>
            <option value="malo">Malo</option>
            <option value="nuevo">Nuevo</option>
            <option value="solo_contado">Solo Contado</option>
            <option value="suspendido">Suspendidos</option>
          </select>
        </div>
      </div>

      {/* Clients Table */}
      <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1f2530] border-b border-slate-200 dark:border-[#262f3c] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Cédula / RIF</th>
                <th className="py-3 px-4">Nombre / Razón Social</th>
                <th className="py-3 px-4">Estado / Zona</th>
                <th className="py-3 px-4">Contacto</th>
                <th className="py-3 px-4">Condición Crédito</th>
                <th className="py-3 px-4 text-right">Deuda Pendiente</th>
                <th className="py-3 px-4 text-center">Categoría / Estatus</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Cargando clientes...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No se encontraron clientes con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filtered.map((client) => {
                  const hasDebt = client.currentBalanceUsd > 0.05;
                  const available = Math.max(0, client.creditLimitUsd - client.currentBalanceUsd);
                  const ratingMeta = getCreditRatingMeta(client.creditRating);
                  const creditAllowed = client.creditEnabled !== false;

                  return (
                    <tr
                      key={client.id}
                      onClick={() => setSelectedClientIdForInvoices(client.id)}
                      className={`hover:bg-emerald-50/50 dark:hover:bg-[#1f2733] transition-colors cursor-pointer ${
                        client.isSuspended ? 'bg-rose-50/40 dark:bg-rose-950/15' : ''
                      }`}
                      title="Clic para ver facturas emitidas, detalles y registrar abonos o cancelaciones"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {client.idDoc}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={
                              client.isSuspended
                                ? 'line-through text-slate-500'
                                : 'text-emerald-800 dark:text-emerald-300 hover:underline'
                            }
                          >
                            {client.name}
                          </span>
                          {client.isSuspended && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-600 text-white tracking-wider">
                              SUSPENDIDO
                            </span>
                          )}
                        </div>
                        {client.address && (
                          <span className="block text-[11px] text-slate-400 dark:text-slate-500 font-normal truncate max-w-xs">
                            {client.address}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {client.state || client.zoneName ? (
                          <div className="space-y-0.5">
                            {client.state && (
                              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>{client.state}</span>
                              </div>
                            )}
                            {client.zoneName && (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 pl-4">
                                {client.zoneName}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Sin asignar</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {client.phone && <div className="text-[11px] font-mono">{client.phone}</div>}
                        {client.email && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[160px]">
                            {client.email}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {creditAllowed ? (
                          <div>
                            <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              Lím. ${client.creditLimitUsd.toFixed(0)} · {client.creditDays || 15} días
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Disp: ${available.toFixed(2)} (Bs. {(available * rate).toFixed(0)})
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            <ShieldOff className="w-3 h-3" />
                            SOLO CONTADO
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className={hasDebt ? 'text-rose-700 dark:text-rose-400 font-bold' : 'text-slate-400'}>
                          Bs. {(client.currentBalanceUsd * rate).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          ${client.currentBalanceUsd.toFixed(2)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          {creditAllowed ? (
                            <span
                              title={ratingMeta.desc}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${ratingMeta.cls}`}
                            >
                              <Award className="w-3 h-3" />
                              {ratingMeta.label}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                              SIN CRÉDITO
                            </span>
                          )}
                          {(client.onTimePaymentsCount || 0) +
                            (client.latePaymentsCount || 0) +
                            (client.veryLatePaymentsCount || 0) >
                            0 && (
                            <span className="text-[9px] text-slate-400 font-mono">
                              {client.onTimePaymentsCount || 0} ok · {client.latePaymentsCount || 0} reg ·{' '}
                              {client.veryLatePaymentsCount || 0} mora
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className="py-3 px-4 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedClientIdForInvoices(client.id)}
                            className={`px-2 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                              hasDebt
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#232b38] dark:hover:bg-[#2c3647] text-slate-700 dark:text-slate-200'
                            }`}
                            title="Ver facturas emitidas, detalles y abonar o cancelar créditos"
                          >
                            <FileText className="w-3 h-3" />
                            <span>{hasDebt ? 'Facturas / Abonar' : 'Facturas'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleSuspend(client)}
                            className={`p-1.5 rounded transition-colors cursor-pointer ${
                              client.isSuspended
                                ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                                : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                            }`}
                            title={
                              client.isSuspended
                                ? 'Reactivar cliente suspendido'
                                : 'Suspender cliente (bloquear facturación)'
                            }
                          >
                            {client.isSuspended ? (
                              <UserCheck className="w-3.5 h-3.5" />
                            ) : (
                              <Ban className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(client)}
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#252d3b] rounded transition-colors cursor-pointer"
                            title="Editar cliente"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => !hasDebt && setDeleteTarget(client)}
                            disabled={hasDebt}
                            className={`p-1.5 rounded transition-colors ${
                              hasDebt
                                ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                : 'text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-[#252d3b] cursor-pointer'
                            }`}
                            title={hasDebt ? 'Cliente con deuda pendiente' : 'Eliminar cliente'}
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

      {/* Add / Edit Client Modal (Shared Full Form) */}
      <ClientFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        clients={clients}
        zones={zones}
        editingClient={editingClient}
        onSaved={(_saved, isEdit) => {
          setSuccessMsg(
            isEdit ? '¡Cliente actualizado exitosamente!' : '¡Nuevo cliente registrado exitosamente!'
          );
          setTimeout(() => setSuccessMsg(''), 5000);
          void loadData();
        }}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-[#2d3748]">
            <h4 className="text-sm font-bold mb-1">¿Eliminar cliente?</h4>
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
                onClick={confirmDeleteClient}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold cursor-pointer"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Client Emitted & Credit Invoices Detail / Abono Modal */}
      <ClientInvoicesModal
        client={clients.find((c) => c.id === selectedClientIdForInvoices) || null}
        exchangeRate={exchangeRate}
        onClose={() => setSelectedClientIdForInvoices(null)}
        onDataChanged={() => {
          void loadData();
          onPaymentRegistered?.();
        }}
      />
    </div>
  );
};
