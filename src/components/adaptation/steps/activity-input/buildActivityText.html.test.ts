import { describe, it, expect } from "vitest";
import { buildActivityText } from "./buildActivityText";
import type { SelectedQuestion } from "@/lib/adaptation/wizard/wizardState";

const q = (over: Partial<SelectedQuestion>): SelectedQuestion =>
  ({ id: "1", text: "", subject: "Matemática", topic: null, options: null, image_url: null, difficulty: "medium", ...over }) as SelectedQuestion;

/** C-32: questions saved by the Editor Manual are HTML; the AI and the teacher's field need text. */
describe("buildActivityText with HTML questions (C-32)", () => {
  it("turns tags into text and scripts into ^ / _", () => {
    const text = buildActivityText([q({ text: "<p>Resolva <strong>x<sup>2</sup> - 4 = 0</strong></p><p>Mostre os passos.</p>" })]);
    expect(text).toBe("1) Resolva x^2 - 4 = 0\nMostre os passos.");
  });

  it("converts the alternatives as well", () => {
    const text = buildActivityText([
      q({ text: "<p>Quanto vale 10<sup>3</sup>?</p>", options: ["<p>10<sup>3</sup></p>", "100", "<p>a&nbsp;&lt; b</p>"] }),
    ]);
    expect(text).toBe("1) Quanto vale 10^3?\n   A) 10^3\n   B) 100\n   C) a < b");
  });

  it("leaves old plain-text questions exactly as they were", () => {
    expect(buildActivityText([q({ text: "2 < 3 e 5 > 4", options: ["x", "y"] })])).toBe("1) 2 < 3 e 5 > 4\n   A) x\n   B) y");
  });
});
