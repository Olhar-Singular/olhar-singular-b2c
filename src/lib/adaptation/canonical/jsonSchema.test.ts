import { describe, it, expect } from "vitest";
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
