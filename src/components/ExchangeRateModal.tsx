import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState } from 'react';
import { X, TrendingUp, Check, RefreshCw } from 'lucide-react';
import { ExchangeRate } from '../types/index.ts';

interface ExchangeRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRate: ExchangeRate | null;
  onRateUpdated: () => void;
}

export const ExchangeRateModal: React.FC<ExchangeRateModalProps> = ({
  isOpen,
  onClose,
  currentRate,
  onRateUpdated,
}) => {
  const [newRate, setNewRate] = useState(currentRate?.rate ? String(currentRate.rate) : '76.50');
  const [source, setSource] = useState(currentRate?.source || 'BCV Oficial');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateNum = Number(newRate);
    if (isNaN(rateNum) || rateNum <= 0) {
      setErrorMsg('Ingrese un valor numérico válido mayor a cero.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await apiFetch('/api/exchange-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate: rateNum, source }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al actualizar tasa');
      }

      onRateUpdated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error en el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative animate-in fade-in duration-150">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
            <TrendingUp className="w-5 h-5" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Tasa de Cambio del Día</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ajuste el valor oficial en bolívares (VES) por cada dólar americano ($ USD).
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700 font-medium">
            {errorMsg}
          </div>
        )}

        <div className="mb-4 p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold text-emerald-950 block">Banco Central de Venezuela</span>
            <span className="text-[10px] text-emerald-700">Actualización oficial diaria automática</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              setIsLoading(true);
              setErrorMsg('');
              try {
                const res = await apiFetch('/api/exchange-rate/sync-bcv', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                  setNewRate(String(data.rate));
                  setSource(data.source || 'Banco Central de Venezuela (BCV Oficial)');
                  onRateUpdated();
                } else {
                  setErrorMsg(data.message || 'Error al sincronizar con BCV');
                }
              } catch (err: any) {
                setErrorMsg(err.message || 'Error de red');
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs shrink-0"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sincronizar Hoy</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              Valor en Bolívares (Bs. por 1 USD) *
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                placeholder="76.50"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="w-full py-2.5 px-3 border border-slate-200 rounded-lg text-lg font-bold font-mono focus:outline-hidden focus:border-emerald-600 text-slate-900"
                required
              />
              <span className="absolute right-3 top-3 text-xs font-semibold text-slate-400 font-mono">
                Bs./$
              </span>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Fuente / Referencia:</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full py-2 px-3 border border-slate-200 rounded-lg bg-white focus:outline-hidden"
            >
              <option value="BCV Oficial">Banco Central de Venezuela (BCV Oficial)</option>
              <option value="Tasa de Cierre Mercado">Tasa Ponderada de Mercado</option>
              <option value="Tasa Especial Distribuidor">Tasa Especial ROECA</option>
            </select>
          </div>

          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-[11px] text-emerald-900 space-y-1">
            <span className="font-bold block">Efecto Inmediato:</span>
            <p>
              Todos los cálculos de facturación, abonos en Bolívares y reportes utilizarán automáticamente esta tasa.
            </p>
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isLoading ? 'Guardando...' : 'Aplicar Tasa'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
