import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  X,
  CreditCard,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  MapPin,
  Search,
  Clock,
} from 'lucide-react';
import { apiFetch } from '../lib/firestoreStore.ts';
import { Client, Zone, CreditRating } from '../types/index.ts';
import { VENEZUELA_STATES } from '../lib/venezuelaGeo.ts';

const normalizeText = (str: string) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const getCreditRatingMeta = (rating?: CreditRating) => {
  switch (rating) {
    case 'excelente':
      return {
        label: 'EXCELENTE',
        cls: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70',
        desc: 'Paga puntualmente dentro del plazo acordado',
      };
    case 'regular':
      return {
        label: 'REGULAR',
        cls: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/70',
        desc: 'Paga casi a tiempo o con retrasos leves (1–7 días)',
      };
    case 'malo':
      return {
        label: 'MALO',
        cls: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/70',
        desc: 'Retrasos prolongados (>7 días) en pagos de crédito',
      };
    default:
      return {
        label: 'NUEVO',
        cls: 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
        desc: 'Sin historial de pagos a crédito aún',
      };
  }
};

export interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  zones: Zone[];
  editingClient?: Client | null;
  initialQuery?: string;
  /** Called after client is created or updated in DB */
  onSaved: (savedClient: Client, isEdit: boolean) => void;
  /** Optional handler when used from POSBilling so user can select an existing duplicate/similar client directly for billing */
  onSelectExistingForBilling?: (existingClient: Client) => void;
  /** Optional label override for primary submit button when creating */
  submitCreateLabel?: string;
}

export const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  onClose,
  clients,
  zones,
  editingClient: externalEditingClient = null,
  initialQuery = '',
  onSaved,
  onSelectExistingForBilling,
  submitCreateLabel = 'Guardar Cliente',
}) => {
  const [editingClient, setEditingClient] = useState<Client | null>(externalEditingClient);
  const [idDoc, setIdDoc] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [stateName, setStateName] = useState('Mérida');
  const [zoneId, setZoneId] = useState<string>('');
  const [creditEnabled, setCreditEnabled] = useState(true);
  const [creditLimitUsd, setCreditLimitUsd] = useState('500');
  const [creditDays, setCreditDays] = useState('15');
  const [isSuspended, setIsSuspended] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const populateFromClient = (c: Client) => {
    setEditingClient(c);
    setIdDoc(c.idDoc);
    setName(c.name);
    setPhone(c.phone || '');
    setEmail(c.email || '');
    setAddress(c.address || '');
    setStateName(c.state || '');
    setZoneId(c.zoneId ? String(c.zoneId) : '');
    setCreditEnabled(c.creditEnabled !== false);
    setCreditLimitUsd(String(c.creditLimitUsd || 0));
    setCreditDays(String(c.creditDays || 15));
    setIsSuspended(Boolean(c.isSuspended));
    setFormError('');
  };

  useEffect(() => {
    if (!isOpen) return;
    if (externalEditingClient) {
      populateFromClient(externalEditingClient);
    } else {
      setEditingClient(null);
      const q = initialQuery.trim();
      if (q && /^[vjejp0-9-]/i.test(q) && /\d/.test(q)) {
        setIdDoc(q.toUpperCase());
        setName('');
      } else {
        setIdDoc('');
        setName(q);
      }
      setPhone('');
      setEmail('');
      setAddress('');
      setStateName('Mérida');
      setZoneId('');
      setCreditEnabled(true);
      setCreditLimitUsd('500');
      setCreditDays('15');
      setIsSuspended(false);
      setFormError('');
    }
  }, [isOpen, externalEditingClient, initialQuery]);

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

  const modalZonesForState = useMemo(() => {
    if (!stateName) return zones.filter((z) => z.isActive);
    return zones.filter(
      (z) => z.isActive && normalizeText(z.state) === normalizeText(stateName)
    );
  }, [zones, stateName]);

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

  const duplicateByDoc = useMemo(() => {
    const trimmed = normalizeText(idDoc);
    if (!trimmed) return null;
    return (
      clients.find((c) => c.id !== editingClient?.id && normalizeText(c.idDoc) === trimmed) || null
    );
  }, [idDoc, clients, editingClient]);

  const exactMatchByName = useMemo(() => {
    const trimmed = normalizeText(name);
    if (!trimmed) return null;
    return (
      clients.find((c) => c.id !== editingClient?.id && normalizeText(c.name) === trimmed) || null
    );
  }, [name, clients, editingClient]);

  const similarClients = useMemo(() => {
    const nameQuery = normalizeText(name);
    const docQuery = normalizeText(idDoc);
    if (nameQuery.length < 2 && docQuery.length < 2) return [];

    const tokens = nameQuery.split(/\s+/).filter((t) => t.length > 1);

    return clients
      .filter((c) => c.id !== editingClient?.id)
      .map((c) => {
        const cName = normalizeText(c.name);
        const cDoc = normalizeText(c.idDoc);
        let score = 0;

        if (docQuery.length >= 2) {
          if (cDoc === docQuery) score += 50;
          else if (cDoc.startsWith(docQuery)) score += 30;
          else if (cDoc.includes(docQuery)) score += 15;
        }
        if (nameQuery.length >= 2) {
          if (cName === nameQuery) score += 60;
          else if (cName.startsWith(nameQuery)) score += 35;
          else if (cName.includes(nameQuery)) score += 20;
          tokens.forEach((tok) => {
            if (cName.includes(tok)) score += 10;
          });
        }
        return { client: c, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => item.client);
  }, [name, idDoc, clients, editingClient]);

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idDoc.trim() || !name.trim()) {
      setFormError('Cédula/RIF y Nombre son obligatorios.');
      return;
    }

    if (duplicateByDoc) {
      setFormError(
        `No se puede registrar: la Cédula/RIF "${idDoc.trim()}" ya pertenece al cliente "${duplicateByDoc.name}".`
      );
      return;
    }

    if (!editingClient && exactMatchByName) {
      setFormError(
        `Ya existe un cliente registrado con el nombre idéntico "${exactMatchByName.name}" (${exactMatchByName.idDoc}). Verifique para evitar duplicados.`
      );
      return;
    }

    const chosenZone = zoneId ? zones.find((z) => String(z.id) === zoneId) : null;
    setIsSaving(true);
    setFormError('');

    try {
      const payload = {
        idDoc: idDoc.trim(),
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        state: stateName.trim() || chosenZone?.state || null,
        zoneId: chosenZone ? chosenZone.id : null,
        zoneName: chosenZone ? chosenZone.name : null,
        creditEnabled,
        creditLimitUsd: creditEnabled ? Math.max(0, Number(creditLimitUsd) || 0) : 0,
        creditDays: creditEnabled ? Math.max(1, Math.round(Number(creditDays) || 15)) : 0,
        isSuspended,
      };

      const url = editingClient ? `/api/clients/${editingClient.id}` : '/api/clients';
      const method = editingClient ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar cliente');
      }

      onSaved(data as Client, Boolean(editingClient));
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Error en el servidor');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative my-auto max-h-[92vh] overflow-y-auto animate-in fade-in duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>{editingClient ? 'Modificar Ficha de Cliente' : 'Registrar Nuevo Cliente'}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ubicación por estado/zona, autorización de crédito, plazos de pago, contacto y dirección comercial.
          </p>
        </div>

        {formError && (
          <div className="mb-3 p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Duplicate Cédula/RIF Alert */}
        {duplicateByDoc && (
          <div className="mb-3 p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 rounded-xl text-xs">
            <div className="flex items-start gap-2 text-rose-900 dark:text-rose-200 font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="block font-bold">¡Cliente ya registrado con esta Cédula / RIF!</span>
                <span className="block text-[11px] font-normal mt-0.5">
                  El documento <strong className="font-mono">{duplicateByDoc.idDoc}</strong> ya pertenece a{' '}
                  <strong>{duplicateByDoc.name}</strong>.
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {onSelectExistingForBilling && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectExistingForBilling(duplicateByDoc);
                        onClose();
                      }}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Seleccionar para Facturar</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => populateFromClient(duplicateByDoc)}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Cargar y Modificar Ficha</span>
                  </button>
                </div>
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
                <span className="block font-bold">¡Ya existe un cliente con este mismo nombre!</span>
                <span className="block text-[11px] font-normal mt-0.5">
                  <strong>{exactMatchByName.name}</strong> ya está registrado con documento{' '}
                  <strong className="font-mono">{exactMatchByName.idDoc}</strong>.
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {onSelectExistingForBilling && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectExistingForBilling(exactMatchByName);
                        onClose();
                      }}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Seleccionar para Facturar</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => populateFromClient(exactMatchByName)}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Cargar Cliente Existente</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSaveClient} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Cédula o RIF *
              </label>
              <input
                type="text"
                placeholder="V-12345678 o J-..."
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
                Nombre Completo o Razón Social *
              </label>
              <input
                type="text"
                placeholder="Nombre y Apellido / Inversiones..."
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
          </div>

          {/* Live Similar Clients Found Panel */}
          {similarClients.length > 0 && (
            <div className="p-2.5 bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] rounded-xl space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Search className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Clientes semejantes registrados ({similarClients.length} encontrados)</span>
                </span>
                <span className="text-[10px] text-slate-400">Verifique antes de crear</span>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-[#262f3c] max-h-28 overflow-y-auto">
                {similarClients.map((c) => (
                  <div key={c.id} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{c.name}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {c.idDoc} {c.state ? `· ${c.state}` : ''} {c.zoneName ? `/ ${c.zoneName}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {onSelectExistingForBilling && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectExistingForBilling(c);
                            onClose();
                          }}
                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold cursor-pointer"
                        >
                          Usar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => populateFromClient(c)}
                        className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 dark:bg-[#252e3d] dark:hover:bg-[#2f3b4f] text-slate-800 dark:text-slate-200 rounded text-[10px] font-semibold cursor-pointer"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Estado & Zona Selection */}
          <div className="p-3 bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] rounded-xl space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Ubicación Geográfica (Para Reportes por Estado / Zona)</span>
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

          {/* Credit Permission, Term & Suspension Controls */}
          <div className="p-3.5 bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Control de Crédito y Estatus</span>
              </span>
              {editingClient && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    getCreditRatingMeta(editingClient.creditRating).cls
                  }`}
                >
                  Categoría actual: {getCreditRatingMeta(editingClient.creditRating).label}
                </span>
              )}
            </div>

            {/* Toggle: Permitir Crédito */}
            <label className="flex items-start gap-2.5 p-2.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={creditEnabled}
                onChange={(e) => setCreditEnabled(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-emerald-600 rounded cursor-pointer"
              />
              <div className="flex-1">
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  Permitir compras a crédito a este cliente
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  {creditEnabled
                    ? 'Habilitado para facturación a crédito. Su categoría (Excelente / Regular / Malo) se calculará automáticamente según su puntualidad de pago.'
                    : 'Deshabilitado: el cliente solo podrá facturar de CONTADO en Caja / POS.'}
                </span>
              </div>
            </label>

            {creditEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Límite de Crédito ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="500"
                    value={creditLimitUsd}
                    onChange={(e) => setCreditLimitUsd(e.target.value)}
                    className="w-full py-1.5 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden focus:border-emerald-600 font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Plazo de Pago (días)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    placeholder="15"
                    value={creditDays}
                    onChange={(e) => setCreditDays(e.target.value)}
                    className="w-full py-1.5 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden focus:border-emerald-600 font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            )}

            {/* Toggle: Suspender Cliente */}
            <label
              className={`flex items-start gap-2.5 p-2.5 border rounded-lg cursor-pointer transition-colors ${
                isSuspended
                  ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800'
                  : 'bg-white dark:bg-[#12161d] border-slate-200 dark:border-[#2d3748]'
              }`}
            >
              <input
                type="checkbox"
                checked={isSuspended}
                onChange={(e) => setIsSuspended(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-rose-600 rounded cursor-pointer"
              />
              <div className="flex-1">
                <span className="font-bold text-rose-700 dark:text-rose-400 block">
                  Suspender cliente (bloquear facturación)
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Si está activo, el sistema impedirá emitir ventas a este cliente hasta reactivarlo.
                </span>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Teléfono</label>
              <input
                type="text"
                placeholder="+58 414-1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full py-1.5 px-3 bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden font-mono text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                placeholder="cliente@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full py-1.5 px-3 bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Dirección Comercial
            </label>
            <textarea
              rows={2}
              placeholder="Urb., calle, local o referencia..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full py-1.5 px-3 bg-white dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1e2531] dark:hover:bg-[#252e3d] text-slate-700 dark:text-slate-300 rounded-lg font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || Boolean(duplicateByDoc) || (!editingClient && Boolean(exactMatchByName))}
              className={`flex-1 py-2 rounded-lg font-semibold cursor-pointer transition-colors ${
                duplicateByDoc || (!editingClient && exactMatchByName)
                  ? 'bg-rose-300 dark:bg-rose-950/60 text-rose-800 dark:text-rose-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white'
              }`}
            >
              {isSaving
                ? 'Guardando...'
                : duplicateByDoc
                ? 'Cédula / RIF ya Registrada'
                : !editingClient && exactMatchByName
                ? 'Cliente ya Existe'
                : editingClient
                ? 'Actualizar Cliente'
                : submitCreateLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
