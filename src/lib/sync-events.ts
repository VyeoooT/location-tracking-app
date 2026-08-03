export type SyncStatus = 'syncing' | 'done' | 'failed';

type SyncListener = (status: SyncStatus, count?: number) => void;

const listeners = new Set<SyncListener>();

export function emitSyncStatus(status: SyncStatus, count?: number): void {
  listeners.forEach((fn) => fn(status, count));
}

export function onSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
