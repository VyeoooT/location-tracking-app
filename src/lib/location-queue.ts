import { supabase } from './supabase';
import {
  dequeueLocations,
  enqueueLocations,
  QueuedLocation,
} from './async-storage';
import { emitSyncStatus } from './sync-events';

const RETRY_DELAYS_MS = [1000, 2000, 4000];
const ATTEMPT_TIMEOUT_MS = 10_000;

function withAbortTimeout(): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

export async function insertWithRetry(
  rows: QueuedLocation[],
): Promise<boolean> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }

    const { signal, cancel } = withAbortTimeout();
    try {
      const { error } = await supabase
        .from('locations')
        .insert(rows)
        .abortSignal(signal);
      if (!error) return true;

      console.warn(
        `[Retry] Attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1} failed:`,
        error.message,
      );
    } finally {
      cancel();
    }
  }
  return false;
}

export async function saveToQueue(rows: QueuedLocation[]): Promise<void> {
  await enqueueLocations(rows);
  console.log(
    `[Queue] Saved ${rows.length} location(s) to local queue for later retry`,
  );
}

/** Flush queued locations. Returns number flushed, or 0 on failure/empty. */
export async function flushQueue(): Promise<number> {
  const queued = await dequeueLocations();
  if (queued.length === 0) return 0;

  emitSyncStatus('syncing', queued.length);

  const success = await insertWithRetry(queued);
  if (success) {
    console.log(
      `[Flush] Successfully flushed ${queued.length} queued location(s)`,
    );
    emitSyncStatus('done', queued.length);
    return queued.length;
  }

  await saveToQueue(queued);
  console.warn(
    `[Flush] Failed to flush ${queued.length} queued location(s), re-queued`,
  );
  emitSyncStatus('failed');
  return 0;
}

export async function flushQueueQuick(): Promise<boolean> {
  const queued = await dequeueLocations();
  if (queued.length === 0) return true;

  emitSyncStatus('syncing', queued.length);

  const { signal, cancel } = withAbortTimeout();
  try {
    const { error } = await supabase
      .from('locations')
      .insert(queued)
      .abortSignal(signal);
    if (!error) {
      console.log(`[Flush] Quick flush of ${queued.length} queued location(s)`);
      emitSyncStatus('done', queued.length);
      return true;
    }
    await saveToQueue(queued);
    console.warn(
      `[Flush] Quick flush failed (${queued.length} location(s) re-queued)`,
    );
    emitSyncStatus('failed');
    return false;
  } finally {
    cancel();
  }
}
