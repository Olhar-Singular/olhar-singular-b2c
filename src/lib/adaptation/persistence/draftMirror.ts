/**
 * Crash mirror for autosave drafts.
 *
 * Before the debounced network save lands, the in-progress AdaptationResult is
 * mirrored locally keyed by draft id, so a crash / reload before the save
 * completes can be recovered. IndexedDB is preferred; when it is unavailable
 * (private mode, jsdom, older browsers) we fall back to localStorage.
 *
 * The public API is intentionally async + storage-agnostic so callers never
 * branch on the backend.
 */

import {
  AdaptationResultSchema,
  type AdaptationResult,
} from "@/lib/adaptation/canonical/schema";

const DB_NAME = "adaptation-drafts";
const STORE = "drafts";
const LS_PREFIX = "adaptation-draft:";

export type MirrorEntry = {
  draftId: string;
  result: AdaptationResult;
  savedAt: number;
};

// ---------------------------------------------------------------------------
// IndexedDB backend (preferred)
// ---------------------------------------------------------------------------

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "draftId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(entry: MirrorEntry): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(entry);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbGet(draftId: string): Promise<MirrorEntry | null> {
  return openDb().then(
    (db) =>
      new Promise<MirrorEntry | null>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(draftId);
        req.onsuccess = () => {
          db.close();
          resolve((req.result as MirrorEntry | undefined) ?? null);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbDelete(draftId: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(draftId);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

// ---------------------------------------------------------------------------
// localStorage fallback
// ---------------------------------------------------------------------------

function lsPut(entry: MirrorEntry): void {
  localStorage.setItem(LS_PREFIX + entry.draftId, JSON.stringify(entry));
}

function lsGet(draftId: string): MirrorEntry | null {
  const raw = localStorage.getItem(LS_PREFIX + draftId);
  if (!raw) return null;
  return JSON.parse(raw) as MirrorEntry;
}

function lsDelete(draftId: string): void {
  localStorage.removeItem(LS_PREFIX + draftId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Mirror the draft locally. Never throws — a failed mirror must not break autosave. */
export async function writeMirror(draftId: string, result: AdaptationResult): Promise<void> {
  const entry: MirrorEntry = { draftId, result, savedAt: Date.now() };
  try {
    if (hasIndexedDb()) {
      await idbPut(entry);
      return;
    }
    lsPut(entry);
  } catch {
    // Best-effort: try the fallback once, then give up silently.
    try {
      lsPut(entry);
    } catch {
      /* mirror is best-effort */
    }
  }
}

/** Read a mirrored draft, validating the blob. Returns null when absent/corrupt. */
export async function readMirror(draftId: string): Promise<MirrorEntry | null> {
  try {
    const entry = hasIndexedDb() ? await idbGet(draftId) : lsGet(draftId);
    if (!entry) return null;
    const parsed = AdaptationResultSchema.safeParse(entry.result);
    if (!parsed.success) return null;
    return { ...entry, result: parsed.data };
  } catch {
    return null;
  }
}

/** Remove a mirrored draft once it is safely persisted server-side. */
export async function clearMirror(draftId: string): Promise<void> {
  try {
    if (hasIndexedDb()) {
      await idbDelete(draftId);
      return;
    }
    lsDelete(draftId);
  } catch {
    /* best-effort */
  }
}
