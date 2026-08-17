import { describe, it, expect } from "vitest";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { perQuestionBreakFlags } from "./perQuestionBreaks";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const question = (n: number): Block => ({
  id: id(n),
  type: "question",
  stem: [{ id: id(n + 100), type: "paragraph", content: [{ type: "text", text: "Q" }] }],
  answer: { kind: "open" },
});

const paragraph = (n: number): Block => ({
  id: id(n),
  type: "paragraph",
  content: [{ type: "text", text: "p" }],
});

describe("perQuestionBreakFlags", () => {
  it("returns no flags for an empty document", () => {
    expect(perQuestionBreakFlags([])).toEqual([]);
  });

  it("never flags the first question — a break before page 1 is a no-op in print", () => {
    expect(perQuestionBreakFlags([question(1)])).toEqual([false]);
  });

  it("flags every question from the second on", () => {
    expect(perQuestionBreakFlags([question(1), question(2), question(3)])).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("never flags non-question blocks, even between questions", () => {
    expect(
      perQuestionBreakFlags([paragraph(1), question(2), paragraph(3), question(4)]),
    ).toEqual([false, false, false, true]);
  });
});
