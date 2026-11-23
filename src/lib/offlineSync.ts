import { waitForPendingWrites } from 'firebase/firestore';
import { db } from './firebase.ts';

export type SyncStatus = 'synced' | 'offline' | 'syncing';

export interface OfflineSyncState {
  isOnline: boolean;
  pendingWrites: number;
  status: SyncStatus;
  lastSyncedAt: string | null;
}

const listeners = new Set<(state: OfflineSyncState) => void>();

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let pendingWrites = 0;
let isSyncing = false;
let lastSyncedAt: string | null =
  typeof localStorage !== 'undefined' ? localStorage.getItem('roeca_last_synced_at') : null;

const getState = (): OfflineSyncState => ({
  isOnline,
  pendingWrites,
  status: !isOnline ? 'offline' : isSyncing || pendingWrites > 0 ? 'syncing' : 'synced',
  lastSyncedAt,
});

const emit = () => {
  const snapshot = getState();
  listeners.forEach((fn) => fn(snapshot));
};

export function markSyncedNow() {
  lastSyncedAt = new Date().toISOString();
  try {
    localStorage.setItem('roeca_last_synced_at', lastSyncedAt);
  } catch {
    // Ignore storage quota issues
  }
  emit();
}

export function trackPendingWrite(writePromise: Promise<unknown>) {
  pendingWrites += 1;
  emit();

  writePromise
    .then(() => {
      pendingWrites = Math.max(0, pendingWrites - 1);
      if (pendingWrites === 0 && isOnline) {
        markSyncedNow();
      } else {
        emit();
      }
    })
    .catch((err) => {
      pendingWrites = Math.max(0, pendingWrites - 1);
      console.warn('[ROECA Sync] Write finished with warning:', err);
      emit();
    });
}

export async function triggerManualSync(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    isOnline = false;
    emit();
    return false;
  }

  isOnline = true;
  isSyncing = true;
  emit();

  try {
    await waitForPendingWrites(db);
    pendingWrites = 0;
    markSyncedNow();
    return true;
  } catch (err) {
    console.warn('[ROECA Sync] Pending writes sync warning:', err);
    return false;
  } finally {
    isSyncing = false;
    emit();
  }
}

export function getOfflineSyncState(): OfflineSyncState {
  return getState();
}

export function subscribeOfflineSync(listener: (state: OfflineSyncState) => void): () => void {
  listeners.add(listener);
  listener(getState());
  return () => {
    listeners.delete(listener);
  };
}

// Auto-register browser online/offline listeners once
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    emit();
    void triggerManualSync();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    emit();
  });
}
