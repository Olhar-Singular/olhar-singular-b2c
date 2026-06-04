import { describe, it, expect } from "vitest";
import { safeParseDocument, validateDocument } from "./validate";
import { SCHEMA_VERSION } from "./schema";
import { newId } from "./ids";

const id = () => newId();
const textContent = [{ type: "text" as const, text: "hello" }];

const validDocument = {
  schemaVersion: SCHEMA_VERSION,
  blocks: [{ id: id(), type: "paragraph", content: textContent }],
};

describe("safeParseDocument", () => {
  it("returns ok:true for a valid document", () => {
    const result = safeParseDocument(validDocument);
    expect(result.ok).toBe(true);
  });

  it("returns ok:false with errors array for missing schemaVersion", () => {
    const result = safeParseDocument({ blocks: [{ id: id(), type: "paragraph", content: textContent }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toBeInstanceOf(Array);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("returns ok:false with readable path in error for wrong schemaVersion", () => {
    const result = safeParseDocument({ schemaVersion: 99, blocks: [{ id: id(), type: "paragraph", content: textContent }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("schemaVersion"))).toBe(true);
    }
  });

  it("returns ok:false with node path for invalid block id", () => {
    const result = safeParseDocument({
      schemaVersion: SCHEMA_VERSION,
      blocks: [{ id: "bad-id", type: "paragraph", content: textContent }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Should mention the path through blocks
      expect(result.errors.some((e) => e.includes("blocks"))).toBe(true);
    }
  });

  it("returns ok:false for empty blocks array", () => {
    const result = safeParseDocument({ schemaVersion: SCHEMA_VERSION, blocks: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("errors are formatted as '<path>: <message>' strings", () => {
    const result = safeParseDocument({ schemaVersion: 99, blocks: [{ id: id(), type: "paragraph", content: textContent }] });
    if (!result.ok) {
      for (const err of result.errors) {
        expect(err).toMatch(/:/);
      }
    }
  });
});

describe("validateDocument", () => {
  it("returns the typed document for a valid input", () => {
    const doc = validateDocument(validDocument);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.blocks).toHaveLength(1);
  });

  it("throws for an invalid document", () => {
    expect(() => validateDocument({ schemaVersion: 99, blocks: [] })).toThrow();
  });

  it("throws with a descriptive message", () => {
    let errorMsg = "";
    try {
      validateDocument({ schemaVersion: 0, blocks: [] });
    } catch (e) {
      errorMsg = (e as Error).message;
    }
    expect(errorMsg.length).toBeGreaterThan(0);
  });
});
