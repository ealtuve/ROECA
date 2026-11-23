import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import {
  OfflineSyncState,
  subscribeOfflineSync,
  triggerManualSync,
} from '../lib/offlineSync.ts';

interface OfflineIndicatorProps {
  variant?: 'badge' | 'banner';
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ variant = 'badge' }) => {
  const [syncState, setSyncState] = useState<OfflineSyncState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    pendingWrites: 0,
    status: 'synced',
    lastSyncedAt: null,
  });

  useEffect(() => {
    return subscribeOfflineSync(setSyncState);
  }, []);

  if (variant === 'banner') {
    if (syncState.isOnline && syncState.status === 'synced') return null;

    return (
      <div
        role="status"
        aria-live="polite"
        className={`px-4 py-2 text-xs font-semibold flex items-center justify-between gap-3 border-b ${
          !syncState.isOnline
            ? 'bg-amber-500 text-slate-950 border-amber-600'
            : 'bg-sky-600 text-white border-sky-700'
        }`}
      >
        <div className="flex items-center gap-2">
          {!syncState.isOnline ? (
            <WifiOff className="w-4 h-4 shrink-0" />
          ) : (
            <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
          )}
          <span>
            {!syncState.isOnline
              ? `Modo Sin Conexión activo: puede seguir facturando y trabajando. ${
                  syncState.pendingWrites > 0
                    ? `${syncState.pendingWrites} cambio(s) en cola para sincronizar al volver el internet.`
                    : 'Todos los cambios se guardan localmente y se sincronizarán automáticamente.'
                }`
              : 'Conexión restablecida: sincronizando operaciones pendientes con la base de datos en la nube...'}
          </span>
        </div>

        {syncState.isOnline && (
          <button
            type="button"
            onClick={() => void triggerManualSync()}
            className="px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded text-[11px] font-bold cursor-pointer shrink-0"
          >
            Sincronizar ahora
          </button>
        )}
      </div>
    );
  }

  // Compact header badge
  if (!syncState.isOnline) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-300 text-xs font-bold"
        title="Trabajando sin internet: los datos se guardan en el dispositivo y se sincronizan al reconectar"
      >
        <WifiOff className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Offline</span>
        {syncState.pendingWrites > 0 && (
          <span className="px-1.5 py-0.2 bg-amber-600 text-white rounded text-[10px] font-mono">
            {syncState.pendingWrites}
          </span>
        )}
      </div>
    );
  }

  if (syncState.status === 'syncing') {
    return (
      <button
        type="button"
        onClick={() => void triggerManualSync()}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 text-xs font-semibold cursor-pointer"
        title="Sincronizando cambios pendientes con la nube"
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span className="hidden md:inline">Sincronizando...</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void triggerManualSync()}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors cursor-pointer"
      title={
        syncState.lastSyncedAt
          ? `Base de datos sincronizada (${new Date(syncState.lastSyncedAt).toLocaleTimeString('es-VE')})`
          : 'Conectado y respaldado en la nube'
      }
    >
      <Wifi className="w-3.5 h-3.5" />
      <span className="hidden xl:inline">En línea</span>
    </button>
  );
};
