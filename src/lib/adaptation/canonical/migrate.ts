/**
 * schemaVersion migration guard.
 * Routes blobs to the correct parser based on schemaVersion.
 * Today only v1 exists; future versions add cases to the switch.
 */

import { SCHEMA_VERSION } from "./schema.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MigrateSuccess = { ok: true; value: unknown };
export type MigrateFailure = { ok: false };
export type MigrateResult = MigrateSuccess | MigrateFailure;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Inspect `blob.schemaVersion` and return the validated (and potentially
 * migrated) payload, or `{ ok: false }` if the version is missing or unknown.
 *
 * Never throws — all errors are returned as `{ ok: false }`.
 */
export function migrateByVersion(blob: unknown): MigrateResult {
  try {
    if (blob === null || typeof blob !== "object") {
      return { ok: false };
    }

    const version = (blob as Record<string, unknown>).schemaVersion;

    switch (version) {
      case SCHEMA_VERSION: // v1 — current; no transformation needed
        return { ok: true, value: blob };

      default:
        return { ok: false };
    }
  } catch {
    return { ok: false };
  }
}
