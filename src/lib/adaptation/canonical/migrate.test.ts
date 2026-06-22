import { describe, it, expect } from "vitest";
import { migrateByVersion } from "./migrate";
import { SCHEMA_VERSION } from "./schema";
import { newId } from "./ids";

const id = () => newId();
const validV1Blob = {
  schemaVersion: SCHEMA_VERSION, // 1
  blocks: [{ id: id(), type: "paragraph", content: [{ type: "text", text: "hello" }] }],
};

describe("migrateByVersion", () => {
  it("returns ok:true for a schemaVersion:1 blob", () => {
    const result = migrateByVersion(validV1Blob);
    expect(result.ok).toBe(true);
  });

  it("returns the same blob value for schemaVersion:1", () => {
    const result = migrateByVersion(validV1Blob);
    if (result.ok) {
      expect(result.value).toEqual(validV1Blob);
    }
  });

  it("returns ok:false for missing schemaVersion", () => {
    const result = migrateByVersion({ blocks: [] });
    expect(result.ok).toBe(false);
  });

  it("returns ok:false for unknown schemaVersion (e.g. 99)", () => {
    const result = migrateByVersion({ schemaVersion: 99, blocks: [] });
    expect(result.ok).toBe(false);
  });

  it("returns ok:false for schemaVersion:0", () => {
    const result = migrateByVersion({ schemaVersion: 0, blocks: [] });
    expect(result.ok).toBe(false);
  });

  it("does not throw for any input", () => {
    expect(() => migrateByVersion(null)).not.toThrow();
    expect(() => migrateByVersion(undefined)).not.toThrow();
    expect(() => migrateByVersion("string")).not.toThrow();
    expect(() => migrateByVersion(42)).not.toThrow();
    expect(() => migrateByVersion({})).not.toThrow();
  });

  it("returns ok:false for null", () => {
    expect(migrateByVersion(null).ok).toBe(false);
  });

  it("returns ok:false for non-object", () => {
    expect(migrateByVersion("string").ok).toBe(false);
  });

  it("returns ok:false when property access throws (e.g. Proxy)", () => {
    // Cover the catch branch — migrateByVersion must never rethrow
    const evil = new Proxy(
      {},
      {
        get() {
          throw new Error("property access denied");
        },
      }
    );
    expect(migrateByVersion(evil).ok).toBe(false);
  });
});
