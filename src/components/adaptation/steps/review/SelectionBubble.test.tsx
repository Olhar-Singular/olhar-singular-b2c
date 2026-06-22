/**
 * Covers the two re-export lines in the barrel file; behavior is tested in
 * canonical-editor/SelectionBubble.test.tsx (where the component lives).
 */
import { describe, it, expect } from "vitest";
import { SelectionBubble } from "./SelectionBubble";

describe("SelectionBubble re-export (steps/review barrel)", () => {
  it("re-exports SelectionBubble from canonical-editor", () => {
    expect(typeof SelectionBubble).toBe("function");
  });
});
