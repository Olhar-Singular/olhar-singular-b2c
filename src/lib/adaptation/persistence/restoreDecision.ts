/**
 * Pure decision for the crash-mirror restore prompt.
 *
 * The autosave hook writes a local crash mirror before every network save and
 * clears it once the save lands. So a surviving mirror means a save did NOT
 * complete — the local edit is newer than (or unrepresented in) the server row.
 *
 * `shouldOfferRestore` decides whether to ask the user to recover it:
 *   - no mirror              → nothing to offer
 *   - server result known    → compare CONTENT: offer iff the mirror differs
 *                              from the row that was actually loaded
 *   - create flow (no server row yet, serverUpdatedAt === null)
 *                            → any surviving mirror is unsaved → offer
 *   - edit flow, no content  → offer only when the mirror is NEWER than the row
 *                              the server loaded (mirror.savedAt > row updated_at)
 *
 * WHY CONTENT WINS OVER TIMESTAMPS: the timestamp rule alone had a sequence
 * that destroyed work. An autosave fails (the mirror is now the only copy of
 * the edit) → the user presses "Salvar" → the row is flipped to ready and the
 * server stamps a NEW updated_at, later than the mirror → reopening judges the
 * mirror stale and deletes it. The clocks said "already saved"; the document
 * said the edit had never arrived. So whenever we know what the server actually
 * holds, divergence — not recency — decides.
 *
 * Kept side-effect-free so the comparison is unit-tested in isolation; the
 * wizard wires the result to an AlertDialog.
 */

import type { AdaptationResult } from "@/lib/adaptation/canonical/schema";
import type { MirrorEntry } from "@/lib/adaptation/persistence/draftMirror";

export function shouldOfferRestore(
  mirror: MirrorEntry | null,
  serverUpdatedAt: string | null,
  serverResult?: AdaptationResult | null,
): boolean {
  if (!mirror) return false;
  if (serverResult) {
    return JSON.stringify(mirror.result) !== JSON.stringify(serverResult);
  }
  // Create flow: there is no server row state to compare against, so any
  // surviving mirror is by definition an unsaved edit worth recovering.
  if (serverUpdatedAt === null) return true;
  const serverMs = Date.parse(serverUpdatedAt);
  // An unparseable server timestamp is treated as "no trustworthy server state"
  // → fall back to offering the surviving (unsaved) mirror.
  if (Number.isNaN(serverMs)) return true;
  return mirror.savedAt > serverMs;
}
