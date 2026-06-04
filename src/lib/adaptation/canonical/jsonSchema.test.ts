import { describe, it, expect, vi, afterEach } from "vitest";
import { documentResultJsonSchema } from "./jsonSchema";

describe("documentResultJsonSchema", () => {
  it("returns a plain object without throwing", () => {
    expect(() => documentResultJsonSchema()).not.toThrow();
    const schema = documentResultJsonSchema();
    expect(typeof schema).toBe("object");
    expect(schema).not.toBeNull();
  });

  it("root type is 'object'", () => {
    const schema = documentResultJsonSchema();
    expect((schema as Record<string, unknown>).type).toBe("object");
  });

  it("additionalProperties is false at the root", () => {
    const schema = documentResultJsonSchema();
    expect((schema as Record<string, unknown>).additionalProperties).toBe(false);
  });

  it("contains expected top-level properties", () => {
    const schema = documentResultJsonSchema();
    const props = (schema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props).toBeDefined();
    expect(props.schemaVersion).toBeDefined();
    expect(props.document).toBeDefined();
    expect(props.strategies_applied).toBeDefined();
    expect(props.pedagogical_justification).toBeDefined();
    expect(props.implementation_tips).toBeDefined();
  });

  it("returns a new object each call (pure function)", () => {
    const s1 = documentResultJsonSchema();
    const s2 = documentResultJsonSchema();
    expect(s1).not.toBe(s2); // different references
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2)); // same content
  });
});

describe("documentResultJsonSchema — recursion regression", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT emit console.warn (no recursive-reference warning)", () => {
    const warnSpy = vi.spyOn(console, "warn");
    documentResultJsonSchema();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does NOT contain degraded empty items ({}) in the serialized schema", () => {
    const serialized = JSON.stringify(documentResultJsonSchema());
    expect(serialized).not.toContain('"items":{}');
  });

  it("root type is still 'object' after $refStrategy change", () => {
    const schema = documentResultJsonSchema() as Record<string, unknown>;
    expect(schema.type).toBe("object");
  });

  it("additionalProperties is still false at root after $refStrategy change", () => {
    const schema = documentResultJsonSchema() as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
  });
});
