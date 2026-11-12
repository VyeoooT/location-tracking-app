import { supabase } from './supabase';
import {
  enqueueLocations,
  getQueuedLocations,
  removeQueuedLocations,
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
        // Upsert + ignoreDuplicates để retry/flush là idempotent: nếu một dòng
        // đã lên server (ví dụ app bị kill sau khi insert nhưng trước khi xoá
        // queue) thì bỏ qua thay vì làm fail cả batch.
        .upsert(rows, {
          onConflict: 'trip_id,timestamp',
          ignoreDuplicates: true,
        })
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

/**
 * Serialize flushes so the same queued rows can never be inserted twice by
 * concurrent callers (foreground reconnect + background task) and so a quick
 * flush cannot race a full retry flush.
 */
let flushTail: Promise<unknown> = Promise.resolve();

function serializeFlush<T>(task: () => Promise<T>): Promise<T> {
  const run = flushTail.then(task, task);
  flushTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function flushQueueInternal(): Promise<number> {
  const queued = await getQueuedLocations();
  if (queued.length === 0) return 0;

  emitSyncStatus('syncing', queued.length);

  const success = await insertWithRetry(queued);
  if (!success) {
    // The queue was never emptied, so nothing is lost — it will be retried on
    // the next connectivity/task trigger.
    console.warn(
      `[Flush] Failed to flush ${queued.length} queued location(s), keeping queue`,
    );
    emitSyncStatus('failed');
    return 0;
  }

  await removeQueuedLocations(queued);
  console.log(
    `[Flush] Successfully flushed ${queued.length} queued location(s)`,
  );
  emitSyncStatus('done', queued.length);
  return queued.length;
}

/** Flush queued locations. Returns number flushed, or 0 on failure/empty. */
export function flushQueue(): Promise<number> {
  return serializeFlush(flushQueueInternal);
}

async function flushQueueQuickInternal(): Promise<boolean> {
  const queued = await getQueuedLocations();
  if (queued.length === 0) return true;

  emitSyncStatus('syncing', queued.length);

  const { signal, cancel } = withAbortTimeout();
  try {
    const { error } = await supabase
      .from('locations')
      .upsert(queued, {
        onConflict: 'trip_id,timestamp',
        ignoreDuplicates: true,
      })
      .abortSignal(signal);
    if (!error) {
      await removeQueuedLocations(queued);
      console.log(`[Flush] Quick flush of ${queued.length} queued location(s)`);
      emitSyncStatus('done', queued.length);
      return true;
    }
    console.warn(
      `[Flush] Quick flush failed (${queued.length} location(s) kept for retry)`,
    );
    emitSyncStatus('failed');
    return false;
  } finally {
    cancel();
  }
}

export function flushQueueQuick(): Promise<boolean> {
  return serializeFlush(flushQueueQuickInternal);
}
