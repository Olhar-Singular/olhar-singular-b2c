import { describe, it, expect } from "vitest";
import { shouldOfferRestore } from "./restoreDecision";
import { validResult } from "./__fixtures__/result";
import type { MirrorEntry } from "./draftMirror";

function mirror(savedAt: number): MirrorEntry {
  return { draftId: "d1", result: validResult, savedAt };
}

const diverged = { ...validResult, pedagogical_justification: "edição que não subiu" };

describe("shouldOfferRestore", () => {
  it("returns false when there is no mirror", () => {
    expect(shouldOfferRestore(null, "2026-01-01T00:00:00Z")).toBe(false);
    expect(shouldOfferRestore(null, null)).toBe(false);
  });

  it("offers any surviving mirror in the create flow (no server state)", () => {
    expect(shouldOfferRestore(mirror(1), null)).toBe(true);
  });

  it("offers when the mirror is newer than the server row (edit flow)", () => {
    const serverUpdatedAt = "2026-01-01T00:00:00Z";
    const newer = Date.parse(serverUpdatedAt) + 5000;
    expect(shouldOfferRestore(mirror(newer), serverUpdatedAt)).toBe(true);
  });

  it("does not offer when the mirror is older than the server row", () => {
    const serverUpdatedAt = "2026-01-01T00:00:00Z";
    const older = Date.parse(serverUpdatedAt) - 5000;
    expect(shouldOfferRestore(mirror(older), serverUpdatedAt)).toBe(false);
  });

  it("does not offer when the mirror equals the server row timestamp", () => {
    const serverUpdatedAt = "2026-01-01T00:00:00Z";
    expect(shouldOfferRestore(mirror(Date.parse(serverUpdatedAt)), serverUpdatedAt)).toBe(false);
  });

  it("offers when the server timestamp is unparseable", () => {
    expect(shouldOfferRestore(mirror(1), "not-a-date")).toBe(true);
  });

  // --- B11: content beats timestamps ----------------------------------------

  it("offers a DIVERGING mirror even when the server row looks newer", () => {
    // The losing sequence this closes: an autosave fails (mirror keeps the only
    // copy) → "Salvar" marks the row ready anyway → the server stamps a fresh
    // updated_at, now NEWER than the mirror → next open judges the mirror stale
    // and deletes it. Timestamps say "already saved"; the content says the row
    // never received the edit. The content is the one telling the truth.
    const serverUpdatedAt = "2026-01-01T00:00:00Z";
    const stale = { ...mirror(Date.parse(serverUpdatedAt) - 5000), result: diverged };
    expect(shouldOfferRestore(stale, serverUpdatedAt, validResult)).toBe(true);
  });

  it("does not offer a mirror that matches the loaded row (nothing to recover)", () => {
    const serverUpdatedAt = "2026-01-01T00:00:00Z";
    const newer = mirror(Date.parse(serverUpdatedAt) + 5000);
    expect(shouldOfferRestore(newer, serverUpdatedAt, validResult)).toBe(false);
  });

  it("falls back to timestamps when the server result is unknown", () => {
    const serverUpdatedAt = "2026-01-01T00:00:00Z";
    const newer = Date.parse(serverUpdatedAt) + 5000;
    expect(shouldOfferRestore(mirror(newer), serverUpdatedAt, null)).toBe(true);
  });
});
