import { describe, it, expect } from "vitest";
import {
  serializeResult,
  isDirty,
  nextStatusAfterSave,
  AUTOSAVE_DEBOUNCE_MS,
} from "./autosaveDecision";
import { validResult } from "./__fixtures__/result";

describe("autosaveDecision", () => {
  it("exposes a sane debounce window", () => {
    expect(AUTOSAVE_DEBOUNCE_MS).toBeGreaterThan(0);
  });

  describe("serializeResult", () => {
    it("produces a stable string for the same input", () => {
      expect(serializeResult(validResult)).toBe(serializeResult(validResult));
    });
  });

  describe("isDirty", () => {
    it("is dirty when nothing has been saved yet", () => {
      expect(isDirty(validResult, null)).toBe(true);
    });

    it("is clean when the snapshot matches the last save", () => {
      expect(isDirty(validResult, serializeResult(validResult))).toBe(false);
    });

    it("is dirty when the content changed", () => {
      const changed = {
        ...validResult,
        pedagogical_justification: "changed",
      };
      expect(isDirty(changed, serializeResult(validResult))).toBe(true);
    });
  });

  describe("nextStatusAfterSave", () => {
    it("maps success to saved", () => {
      expect(nextStatusAfterSave("success")).toBe("saved");
    });
    it("maps conflict to conflict", () => {
      expect(nextStatusAfterSave("conflict")).toBe("conflict");
    });
    it("maps error to error", () => {
      expect(nextStatusAfterSave("error")).toBe("error");
    });
  });
});
