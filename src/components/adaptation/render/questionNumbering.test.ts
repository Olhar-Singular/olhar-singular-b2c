import { describe, it, expect } from "vitest";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { questionNumbers } from "./questionNumbering";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const para = (n: number): Block => ({
  id: id(n),
  type: "paragraph",
  content: [{ type: "text", text: "p" }],
});

const question = (n: number): Block => ({
  id: id(n),
  type: "question",
  stem: [para(n + 1)],
  answer: { kind: "open" },
});

describe("questionNumbers", () => {
  it("returns an empty array for no blocks", () => {
    expect(questionNumbers([])).toEqual([]);
  });

  it("numbers question blocks 1, 2, 3 by document order", () => {
    const blocks = [question(1), question(3), question(5)];
    expect(questionNumbers(blocks)).toEqual([1, 2, 3]);
  });

  it("assigns undefined to non-question blocks and skips them in the count", () => {
    const blocks = [para(1), question(2), para(4), question(5)];
    expect(questionNumbers(blocks)).toEqual([undefined, 1, undefined, 2]);
  });
});
