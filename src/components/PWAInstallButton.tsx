import React, { useState } from 'react';
import {
  Download,
  Link2,
  Copy,
  Check,
  WifiOff,
  Smartphone,
  Laptop,
  X,
  RefreshCw,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  compact?: boolean;
  externalOpen?: boolean;
  onExternalClose?: () => void;
}

const SHARED_APP_URL = 'https://ais-pre-fccokdzf3co4jiox5flf3t-247738846285.us-east1.run.app';

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  externalOpen,
  onExternalClose,
}) => {
  const { canDirectPrompt, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [internalOpen, setInternalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isModalOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const closeModal = () => {
    if (onExternalClose) onExternalClose();
    setInternalOpen(false);
  };

  const isDevHost =
    typeof window !== 'undefined' &&
    (window.location.hostname.includes('ais-dev-') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  const accessLink =
    typeof window !== 'undefined' && !isDevHost ? window.location.origin : SHARED_APP_URL;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(accessLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = accessLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleInstallNow = async () => {
    if (canDirectPrompt) {
      await promptInstall();
    } else {
      setInternalOpen(true);
    }
  };

  return (
    <>
      {externalOpen === undefined && (
        <button
          type="button"
          onClick={() => setInternalOpen(true)}
          className={`flex items-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
            compact
              ? 'px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/50 border-sky-200 dark:border-sky-800/70 text-sky-800 dark:text-sky-300'
              : 'px-3 py-2 bg-sky-600 hover:bg-sky-700 border-sky-600 text-white shadow-xs'
          }`}
          title="Obtener enlace de acceso remoto e instalar app para trabajar sin internet"
        >
          {canDirectPrompt ? <Download className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
          <span className="hidden xl:inline">{isInstalled ? 'Enlace de Acceso' : 'Enlace / App Offline'}</span>
        </button>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-600/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Enlace de Acceso y Modo Sin Internet</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Entre desde cualquier equipo y siga facturando aunque se caiga el internet
                </p>
              </div>
            </div>

            {/* Shareable Link Box */}
            <div className="mt-4 p-3.5 rounded-xl bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c]">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5">
                Enlace Permanente del Sistema (Acceso desde cualquier lugar)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={accessLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 py-2 px-3 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              {isDevHost && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2 leading-relaxed">
                  <strong>Importante:</strong> Para que el enlace externo funcione fuera del editor (y no muestre error 404), primero debe activar la publicación usando el botón <strong>Share / Compartir</strong> o <strong>Deploy / Publicar en Cloud Run</strong> en la esquina superior derecha de AI Studio.
                </p>
              )}
            </div>

            {/* Offline & Sync Capabilities */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Facturación Sin Internet</span>
                </div>
                <p className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80 leading-relaxed">
                  Si se cae la conexión, puede seguir emitiendo facturas, registrando abonos y consultando el inventario en la base local del equipo.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/60">
                <div className="flex items-center gap-1.5 font-bold text-sky-800 dark:text-sky-300 mb-1">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sincronización Automática</span>
                </div>
                <p className="text-[11px] text-sky-900/80 dark:text-sky-200/80 leading-relaxed">
                  Al regresar el internet, todas las ventas, pagos y movimientos pendientes se suben automáticamente a la nube sin perder ningún dato.
                </p>
              </div>
            </div>

            {/* Install as Desktop/Mobile App */}
            <div className="mt-4 p-3.5 rounded-xl bg-slate-50 dark:bg-[#1a212b] border border-slate-200 dark:border-[#2d3748] text-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isIOS ? <Smartphone className="w-4 h-4 text-emerald-600" /> : <Laptop className="w-4 h-4 text-emerald-600" />}
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {isInstalled ? 'Aplicación Instalada en este Equipo' : 'Instalar en Escritorio / Teléfono'}
                  </span>
                </div>
                {!isInstalled && canDirectPrompt && (
                  <button
                    type="button"
                    onClick={handleInstallNow}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Instalar App</span>
                  </button>
                )}
              </div>

              {isIOS ? (
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  En Safari (iPhone/iPad): toque el botón <strong>Compartir</strong> y seleccione{' '}
                  <strong>«Agregar a pantalla de inicio»</strong> para abrir ROECA ERP como aplicación offline.
                </p>
              ) : !isInstalled && !canDirectPrompt ? (
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Abra el enlace anterior directamente en Chrome o Edge y haga clic en el ícono de{' '}
                  <strong>Instalar (⊕)</strong> en la barra de direcciones para tener un acceso directo offline en su escritorio o celular.
                </p>
              ) : (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1.5">
                  El modo offline está activo en este navegador y listo para operar ante cortes de internet.
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
