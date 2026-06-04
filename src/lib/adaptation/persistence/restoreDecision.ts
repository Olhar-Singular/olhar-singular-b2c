/**
 * Pure decision for the crash-mirror restore prompt.
 *
 * The autosave hook writes a local crash mirror before every network save and
 * clears it once the save lands. So a surviving mirror means a save did NOT
 * complete — the local edit is newer than (or unrepresented in) the server row.
 *
 * `shouldOfferRestore` decides whether to ask the user to recover it:
 *   - no mirror              → nothing to offer
 *   - create flow (no server row yet, serverUpdatedAt === null)
 *                            → any surviving mirror is unsaved → offer
 *   - edit flow              → offer only when the mirror is NEWER than the row
 *                              the server loaded (mirror.savedAt > row updated_at)
 *
 * Kept side-effect-free so the comparison is unit-tested in isolation; the
 * wizard wires the result to an AlertDialog.
 */

import type { MirrorEntry } from "@/lib/adaptation/persistence/draftMirror";

export function shouldOfferRestore(
  mirror: MirrorEntry | null,
  serverUpdatedAt: string | null,
): boolean {
  if (!mirror) return false;
  // Create flow: there is no server row state to compare against, so any
  // surviving mirror is by definition an unsaved edit worth recovering.
  if (serverUpdatedAt === null) return true;
  const serverMs = Date.parse(serverUpdatedAt);
  // An unparseable server timestamp is treated as "no trustworthy server state"
  // → fall back to offering the surviving (unsaved) mirror.
  if (Number.isNaN(serverMs)) return true;
  return mirror.savedAt > serverMs;
}
