/**
 * Offline request queue.
 *
 * Failed API calls (network errors) are persisted to AsyncStorage so they can
 * be retried when connectivity is restored.
 *
 * Storage key: "offline_queue"
 * Entry shape: { id, endpoint, method, body, created_at }
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "offline_queue";

interface QueueEntry {
  id: string;
  endpoint: string;
  method: string;
  body: object;
  created_at: string;
}

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function _loadQueue(): Promise<QueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueEntry[]) : [];
  } catch {
    return [];
  }
}

async function _saveQueue(queue: QueueEntry[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Add a failed request to the queue for later retry. */
export async function enqueue(endpoint: string, method: string, body: object): Promise<void> {
  const queue = await _loadQueue();
  queue.push({ id: uuid(), endpoint, method, body, created_at: new Date().toISOString() });
  await _saveQueue(queue);
}

/** Return the number of pending offline items. */
export async function getPendingCount(): Promise<number> {
  const queue = await _loadQueue();
  return queue.length;
}

/**
 * Retry all queued requests against the live API.
 * Successfully replayed entries are removed; failed ones remain for the next flush.
 */
export async function flush(): Promise<{ succeeded: number; failed: number }> {
  const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";
  const token = await AsyncStorage.getItem("access_token");

  const queue = await _loadQueue();
  if (queue.length === 0) return { succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;
  const remaining: QueueEntry[] = [];

  for (const entry of queue) {
    try {
      const res = await fetch(`${BASE_URL}${entry.endpoint}`, {
        method: entry.method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(entry.body),
      });

      if (res.ok) {
        succeeded++;
      } else {
        // Non-network error (e.g. 422 validation) — discard to avoid infinite retry
        if (res.status >= 400 && res.status < 500) {
          console.warn(`[OfflineQueue] Discarding entry ${entry.id} — HTTP ${res.status}`);
          succeeded++; // count as "handled"
        } else {
          failed++;
          remaining.push(entry);
        }
      }
    } catch {
      // Still no network
      failed++;
      remaining.push(entry);
    }
  }

  await _saveQueue(remaining);
  return { succeeded, failed };
}
