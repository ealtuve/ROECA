import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  RefreshCw,
  Calculator,
  Calendar,
  CheckCircle,
  Building,
  History,
  DollarSign,
  ArrowRightLeft,
} from 'lucide-react';
import { ExchangeRate } from '../types/index.ts';

interface ExchangeRateModuleProps {
  currentRate: ExchangeRate | null;
  onRateUpdated: () => void;
}

export const ExchangeRateModule: React.FC<ExchangeRateModuleProps> = ({
  currentRate,
  onRateUpdated,
}) => {
  const [ratesHistory, setRatesHistory] = useState<ExchangeRate[]>([]);
  const [newRate, setNewRate] = useState(currentRate?.rate ? String(currentRate.rate) : '76.50');
  const [source, setSource] = useState(currentRate?.source || 'Banco Central de Venezuela (BCV)');
  const [rateDate, setRateDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingBcv, setIsSyncingBcv] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Interactive Calculator State
  const [calcUsd, setCalcUsd] = useState('100');
  const [calcVes, setCalcVes] = useState('');

  const activeRate = currentRate?.rate || 76.5;

  const handleSyncBcv = async () => {
    setIsSyncingBcv(true);
    setErrorMsg('');
    try {
      const res = await apiFetch('/api/exchange-rate/sync-bcv', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || `Tasa oficial BCV sincronizada: ${data.rate} Bs./$`);
        setNewRate(String(data.rate));
        setSource(data.source || 'Banco Central de Venezuela (BCV Oficial)');
        setRateDate(data.date || new Date().toISOString().split('T')[0]);
        setTimeout(() => setSuccessMsg(''), 6000);
        onRateUpdated();
        loadHistory();
      } else {
        setErrorMsg(data.message || 'No se pudo sincronizar la tasa con el BCV.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión al sincronizar con el BCV');
    } finally {
      setIsSyncingBcv(false);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await apiFetch('/api/exchange-rates');
      if (res.ok) {
        setRatesHistory(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (currentRate?.rate) {
      setNewRate(String(currentRate.rate));
      setSource(currentRate.source || 'Banco Central de Venezuela (BCV)');
    }
  }, [currentRate]);

  useEffect(() => {
    const usdVal = Number(calcUsd) || 0;
    setCalcVes((usdVal * activeRate).toFixed(2));
  }, [calcUsd, activeRate]);

  const handleCalcVesChange = (val: string) => {
    setCalcVes(val);
    const vesVal = Number(val) || 0;
    setCalcUsd((vesVal / activeRate).toFixed(2));
  };

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateNum = Number(newRate);
    if (isNaN(rateNum) || rateNum <= 0) {
      setErrorMsg('Debe ingresar un valor numérico mayor a cero para la tasa.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await apiFetch('/api/exchange-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate: rateNum,
          source,
          date: rateDate,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al guardar la tasa de cambio');
      }

      setSuccessMsg('¡Tasa de cambio del día actualizada exitosamente! Todos los precios del sistema en Bolívares han sido actualizados.');
      setTimeout(() => setSuccessMsg(''), 6000);
      onRateUpdated();
      loadHistory();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error en el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Soft Dark Mode */}
      <div className="bg-white dark:bg-[#161b22] p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Módulo de Registro de Tasa del Día (BCV / Oficial)
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 dark:border dark:border-emerald-800/60 font-bold font-mono">
              VES / USD
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure la tasa oficial del Banco Central de Venezuela que rige todos los precios en Bolívares y conversiones del sistema.
          </p>
        </div>

        {/* Current Active Rate Card & Auto-sync */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleSyncBcv}
            disabled={isSyncingBcv}
            className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
            title="Consultar y actualizar automáticamente la tasa oficial publicada por el Banco Central de Venezuela hoy"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingBcv ? 'animate-spin' : ''}`} />
            <span>{isSyncingBcv ? 'Consultando BCV...' : 'Sincronizar BCV Hoy'}</span>
          </button>

          <div className="p-4 bg-emerald-50 dark:bg-[#16231e] rounded-xl border border-emerald-200 dark:border-emerald-900/60 text-right">
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 block">Tasa Activa en el Sistema:</span>
            <span className="text-2xl font-extrabold text-emerald-950 dark:text-emerald-300 font-mono tabular-nums block">
              {activeRate.toFixed(2)} Bs./$
            </span>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400/80 font-medium">
              Fuente: {currentRate?.source || 'Banco Central de Venezuela (BCV Oficial)'}
            </span>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 font-semibold">
          {errorMsg}
        </div>
      )}

      {/* Main Grid: Form + Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulario de Registro de Tasa (7 Cols) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900">Actualizar Tasa de Cambio del Día</h3>
          </div>

          <form onSubmit={handleSaveRate} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Nueva Tasa Oficial (Bs. por 1 USD) *
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
                <label className="font-semibold text-slate-700 block mb-1">
                  Fecha de Aplicación *
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={rateDate}
                    onChange={(e) => setRateDate(e.target.value)}
                    className="w-full py-2.5 px-3 border border-slate-200 rounded-lg text-xs font-medium focus:outline-hidden"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Fuente o Referencia Oficial:
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full py-2 px-3 border border-slate-200 rounded-lg bg-slate-50 focus:outline-hidden font-medium"
              >
                <option value="Banco Central de Venezuela (BCV)">
                  Banco Central de Venezuela (BCV - Oficial)
                </option>
                <option value="Tasa Ponderada Bancaria">
                  Tasa Ponderada Mesa de Dinero Bancaria
                </option>
                <option value="Tasa Especial Distribuidora ROECA">
                  Tasa Especial Distribuidora ROECA
                </option>
                <option value="Tasa Paralelo de Referencia">
                  Tasa de Referencia de Mercado
                </option>
              </select>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <span className="font-bold text-slate-800 block">Alcance de la Tasa:</span>
              <p>
                Al guardar esta tasa, se aplicará automáticamente en:
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                <li>Precios de venta de todos los víveres en el supermercado en Bolívares.</li>
                <li>Facturación POS (cálculos en tiempo real de Efectivo, Pago Móvil y Punto de Venta).</li>
                <li>Cuentas por cobrar a clientes y cuentas por pagar a proveedores.</li>
                <li>Reportes consolidados de flujo de caja e inventario.</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isLoading ? 'Guardando Tasa...' : 'Guardar y Aplicar Tasa a Todo el Sistema'}</span>
            </button>
          </form>
        </div>

        {/* Conversor / Calculadora Instantánea (5 Cols) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4">
              <Calculator className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">Conversor Instantáneo</h3>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Calcule equivalencias rápidas a la tasa actual de{' '}
              <span className="font-bold font-mono text-slate-800">{activeRate.toFixed(2)} Bs./$</span>.
            </p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Monto en Dólares ($ USD):</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={calcUsd}
                    onChange={(e) => setCalcUsd(e.target.value)}
                    className="w-full py-2 px-3 border border-slate-200 rounded-lg text-base font-bold font-mono focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 font-mono">
                    USD ($)
                  </span>
                </div>
              </div>

              <div className="flex justify-center text-slate-400">
                <ArrowRightLeft className="w-4 h-4 rotate-90 sm:rotate-0" />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Monto en Bolívares (Bs. VES):</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={calcVes}
                    onChange={(e) => handleCalcVesChange(e.target.value)}
                    className="w-full py-2 px-3 border border-slate-200 rounded-lg text-base font-bold font-mono text-emerald-800 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-emerald-600 font-mono">
                    Bs.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-3 bg-slate-50 border border-slate-200 rounded-lg text-center font-mono">
            <span className="text-[11px] text-slate-500 block">Equivalencia exacta:</span>
            <span className="text-sm font-bold text-slate-900 block mt-0.5">
              ${Number(calcUsd || 0).toFixed(2)} USD = Bs. {Number(calcVes || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Historial de Tasas Registradas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold text-slate-900">Historial de Tasas Registradas en ROECA</h3>
          </div>
          <span className="text-[11px] text-slate-400">{ratesHistory.length} registros guardados</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Fecha</th>
                <th className="py-2.5 px-4 text-right">Tasa Oficial (Bs./$)</th>
                <th className="py-2.5 px-4">Fuente / Organismo</th>
                <th className="py-2.5 px-4 text-right">Registrado en Base de Datos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ratesHistory.map((r, idx) => (
                <tr key={r.id || idx} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">{r.date}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-800">
                    {r.rate.toFixed(2)} Bs./$
                  </td>
                  <td className="py-2.5 px-4 text-slate-700">{r.source}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-slate-400 text-[11px]">
                    {r.updatedAt ? r.updatedAt.split('T')[0] : 'Actual'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
