import { describe, it, expect } from "vitest";
import { newId, isId } from "./ids";

describe("newId", () => {
  it("returns a uuid-format string", () => {
    const id = newId();
    expect(typeof id).toBe("string");
    expect(isId(id)).toBe(true);
  });

  it("returns unique values on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });
});

describe("isId", () => {
  it("returns true for a valid uuid", () => {
    expect(isId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isId("")).toBe(false);
  });

  it("returns false for 'abc'", () => {
    expect(isId("abc")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isId(null as unknown as string)).toBe(false);
    expect(isId(undefined as unknown as string)).toBe(false);
    expect(isId(123 as unknown as string)).toBe(false);
  });
});
