import AsyncStorage from "@react-native-async-storage/async-storage";
import { Invoice, Lead, Product, Quotation, VendorProfile } from "./storage";
import {
  deleteRemoteInvoice,
  deleteRemoteLead,
  deleteRemoteProduct,
  deleteRemoteQuotation,
  upsertRemoteInvoice,
  upsertRemoteLead,
  upsertRemoteProduct,
  upsertRemoteQuotation,
  upsertRemoteVendorProfile,
} from "./supabaseData";

function queueKey(userId: string): string {
  return `sync_queue:${userId}`;
}

export type SyncOperation =
  | { type: "upsert"; entity: "product"; payload: Product }
  | { type: "delete"; entity: "product"; payload: { id: string } }
  | { type: "upsert"; entity: "lead"; payload: Lead }
  | { type: "delete"; entity: "lead"; payload: { id: string } }
  | { type: "upsert"; entity: "quotation"; payload: Quotation }
  | { type: "delete"; entity: "quotation"; payload: { id: string } }
  | { type: "upsert"; entity: "invoice"; payload: Invoice }
  | { type: "delete"; entity: "invoice"; payload: { id: string } }
  | { type: "upsert"; entity: "vendorProfile"; payload: VendorProfile };

export interface QueuedOperation {
  id: string;
  operation: SyncOperation;
  queuedAt: string;
}

function generateQueueId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// Per-user serialization mutex: ensures all queue mutations are serialized
// so concurrent enqueue/flush calls cannot produce lost-update races.
const mutexes = new Map<string, Promise<void>>();

function withMutex<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = mutexes.get(userId) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  mutexes.set(userId, next);

  const run = prev.then(fn).finally(resolve) as Promise<T>;
  return run;
}

async function readQueue(userId: string): Promise<QueuedOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(queueKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(userId: string, queue: QueuedOperation[]): Promise<void> {
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
}

export async function getQueue(userId: string): Promise<QueuedOperation[]> {
  return withMutex(userId, () => readQueue(userId));
}

export async function getQueueLength(userId: string): Promise<number> {
  const queue = await getQueue(userId);
  return queue.length;
}

/**
 * Atomically append one operation to the queue.
 * Serialized via per-user mutex to prevent concurrent lost-update races.
 */
export async function enqueue(userId: string, operation: SyncOperation): Promise<void> {
  return withMutex(userId, async () => {
    const queue = await readQueue(userId);
    queue.push({
      id: generateQueueId(),
      operation,
      queuedAt: new Date().toISOString(),
    });
    await writeQueue(userId, queue);
  });
}

export async function clearQueue(userId: string): Promise<void> {
  return withMutex(userId, async () => {
    await AsyncStorage.removeItem(queueKey(userId));
  });
}

/**
 * Flush the sync queue in strict FIFO order.
 * Stops at the first remote failure to preserve ordering semantics —
 * a later op must not succeed before a failed earlier one it may depend on.
 * Returns true if fully drained, false if stopped at a failure.
 * All queue mutations are serialized via per-user mutex.
 */
export async function flushQueue(
  userId: string,
  onProgress?: (remaining: number) => void
): Promise<boolean> {
  const queue = await getQueue(userId);
  if (queue.length === 0) return true;

  for (const item of queue) {
    try {
      await executeOperation(item.operation);
      await withMutex(userId, async () => {
        const current = await readQueue(userId);
        const updated = current.filter((q) => q.id !== item.id);
        await writeQueue(userId, updated);
        if (onProgress) {
          onProgress(updated.length);
        }
      });
    } catch {
      return false;
    }
  }
  return true;
}

async function executeOperation(operation: SyncOperation): Promise<void> {
  switch (operation.entity) {
    case "vendorProfile":
      await upsertRemoteVendorProfile(operation.payload as VendorProfile);
      break;
    case "product":
      if (operation.type === "upsert") {
        await upsertRemoteProduct(operation.payload as Product);
      } else {
        await deleteRemoteProduct((operation.payload as { id: string }).id);
      }
      break;
    case "lead":
      if (operation.type === "upsert") {
        await upsertRemoteLead(operation.payload as Lead);
      } else {
        await deleteRemoteLead((operation.payload as { id: string }).id);
      }
      break;
    case "quotation":
      if (operation.type === "upsert") {
        await upsertRemoteQuotation(operation.payload as Quotation);
      } else {
        await deleteRemoteQuotation((operation.payload as { id: string }).id);
      }
      break;
    case "invoice":
      if (operation.type === "upsert") {
        await upsertRemoteInvoice(operation.payload as Invoice);
      } else {
        await deleteRemoteInvoice((operation.payload as { id: string }).id);
      }
      break;
  }
}
