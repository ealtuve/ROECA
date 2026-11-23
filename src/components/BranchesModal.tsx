import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useMemo } from 'react';
import { X, GitBranch, Plus, CheckCircle, MapPin, AlertTriangle, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface BranchesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const normalizeText = (str: string) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const BranchesModal: React.FC<BranchesModalProps> = ({ isOpen, onClose }) => {
  const { branches, activeBranch, setActiveBranch, loadBranches } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const duplicateByCode = useMemo(() => {
    const q = normalizeText(code);
    if (!q) return null;
    return branches.find((b) => normalizeText(b.code) === q) || null;
  }, [code, branches]);

  const duplicateByName = useMemo(() => {
    const q = normalizeText(name);
    if (!q) return null;
    return branches.find((b) => normalizeText(b.name) === q) || null;
  }, [name, branches]);

  const similarBranches = useMemo(() => {
    const qName = normalizeText(name);
    const qCode = normalizeText(code);
    if (qName.length < 2 && qCode.length < 2) return [];
    return branches.filter(
      (b) =>
        (qCode.length >= 2 && normalizeText(b.code).includes(qCode)) ||
        (qName.length >= 2 && normalizeText(b.name).includes(qName))
    );
  }, [name, code, branches]);

  if (!isOpen) return null;

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setErrorMsg('Código y nombre de sucursal son obligatorios.');
      return;
    }

    if (duplicateByCode) {
      setErrorMsg(`El código "${code.trim()}" ya pertenece a la sucursal "${duplicateByCode.name}".`);
      return;
    }

    if (duplicateByName) {
      setErrorMsg(`Ya existe una sucursal con el nombre "${duplicateByName.name}" (${duplicateByName.code}).`);
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await apiFetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          address: address.trim() || null,
          phone: phone.trim() || null,
          isMain: false,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al crear la sucursal');
      }

      await loadBranches();
      setShowAddForm(false);
      setCode('');
      setName('');
      setAddress('');
      setPhone('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error en el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative animate-in fade-in duration-150 max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
            <GitBranch className="w-5 h-5" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Sucursales · Escalabilidad Distribuidora ROECA
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Administre múltiples puntos de venta, sedes y almacenes distribuidos en la región.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded text-xs text-rose-700 dark:text-rose-300 font-medium">
            {errorMsg}
          </div>
        )}

        {/* List of existing branches */}
        <div className="space-y-2 mb-4">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
            Sucursales Activas:
          </span>
          {branches.map((b) => {
            const isActive = activeBranch?.id === b.id;
            return (
              <div
                key={b.id}
                className={`p-3 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                  isActive
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40'
                    : 'border-slate-200 dark:border-[#2d3748] bg-slate-50/50 dark:bg-[#1a212b]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{b.code}</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{b.name}</span>
                    {b.isMain && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 dark:bg-[#252e3d] text-slate-700 dark:text-slate-300 font-bold">
                        SEDE CENTRAL
                      </span>
                    )}
                  </div>
                  {b.address && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span>{b.address}</span>
                    </div>
                  )}
                </div>

                <div>
                  {isActive ? (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Activa</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => setActiveBranch(b)}
                      className="px-2.5 py-1 bg-white dark:bg-[#12161d] hover:bg-slate-100 dark:hover:bg-[#1f2530] border border-slate-300 dark:border-[#2d3748] rounded font-medium text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      Operar Aquí
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add Branch Toggle */}
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1e2531] dark:hover:bg-[#252e3d] text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar Nueva Sucursal</span>
          </button>
        ) : (
          <form
            onSubmit={handleCreateBranch}
            className="p-4 bg-slate-50 dark:bg-[#1a212b] rounded-xl border border-slate-200 dark:border-[#2d3748] space-y-3 text-xs"
          >
            <h4 className="font-bold text-slate-800 dark:text-slate-200">Nueva Sucursal ROECA</h4>

            {(duplicateByCode || duplicateByName) && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 rounded-lg text-rose-900 dark:text-rose-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">¡Sucursal ya registrada!</span>
                  <span className="text-[11px]">
                    {duplicateByCode
                      ? `El código "${duplicateByCode.code}" ya pertenece a "${duplicateByCode.name}".`
                      : `Ya existe una sucursal llamada "${duplicateByName?.name}" (${duplicateByName?.code}).`}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Código Único *
                </label>
                <input
                  type="text"
                  placeholder="ej. ROEC-03"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={`w-full py-1.5 px-3 bg-white dark:bg-[#12161d] border rounded-lg focus:outline-hidden font-mono text-slate-900 dark:text-slate-100 ${
                    duplicateByCode
                      ? 'border-rose-500'
                      : 'border-slate-200 dark:border-[#2d3748] focus:border-emerald-600'
                  }`}
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nombre Comercial *
                </label>
                <input
                  type="text"
                  placeholder="ej. Sucursal Norte"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full py-1.5 px-3 bg-white dark:bg-[#12161d] border rounded-lg focus:outline-hidden text-slate-900 dark:text-slate-100 ${
                    duplicateByName
                      ? 'border-rose-500'
                      : 'border-slate-200 dark:border-[#2d3748] focus:border-emerald-600'
                  }`}
                  required
                />
              </div>
            </div>

            {similarBranches.length > 0 && !duplicateByCode && !duplicateByName && (
              <div className="p-2 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg space-y-1">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Search className="w-3 h-3" />
                  <span>Sucursales existentes similares:</span>
                </span>
                {similarBranches.map((b) => (
                  <div key={b.id} className="text-[11px] font-mono text-slate-700 dark:text-slate-300">
                    • <strong>{b.code}</strong> — {b.name}
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Dirección del Local
              </label>
              <input
                type="text"
                placeholder="Av., centro comercial, local..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full py-1.5 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Teléfono</label>
              <input
                type="text"
                placeholder="+58 241-..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full py-1.5 px-3 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] rounded-lg focus:outline-hidden font-mono text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="flex-1 py-1.5 bg-white dark:bg-[#12161d] border border-slate-200 dark:border-[#2d3748] text-slate-600 dark:text-slate-300 rounded font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isLoading || Boolean(duplicateByCode) || Boolean(duplicateByName)}
                className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold disabled:bg-slate-300 dark:disabled:bg-slate-800 cursor-pointer"
              >
                {duplicateByCode || duplicateByName
                  ? 'Sucursal ya Existe'
                  : isLoading
                  ? 'Guardando...'
                  : 'Crear Sucursal'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[#262f3c] text-right">
          <button
            onClick={onClose}
            className="py-1.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-[#1e2531] dark:hover:bg-[#252e3d] text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
