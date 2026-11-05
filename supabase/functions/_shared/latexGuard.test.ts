import { describe, it, expect } from "vitest";
import { repairJsonLatex, findLatexIssues, latexIssueErrors, latexIssuesToReview } from "./latexGuard.ts";
import type { AdaptationResult } from "../../../src/lib/adaptation/canonical/schema.ts";

const FF = "\u000C";

describe("repairJsonLatex (C-12)", () => {
  it("repairs only `latex` strings, at any depth, and reports each repair", () => {
    const json = {
      blocks: [
        { type: "blockMath", latex: `${FF}rac{1}{2}` },
        { type: "paragraph", content: [{ type: "inlineMath", latex: "25% de 80" }, { type: "text", text: `${FF}rac fica` }] },
      ],
    };
    const { json: fixed, repairs } = repairJsonLatex(json) as { json: typeof json; repairs: string[] };
    expect(fixed.blocks[0].latex).toBe("\\frac{1}{2}");
    expect((fixed.blocks[1] as { content: Array<{ latex?: string; text?: string }> }).content[0].latex).toBe("25\\% de 80");
    // Plain text is not LaTeX: untouched.
    expect((fixed.blocks[1] as { content: Array<{ text?: string }> }).content[1].text).toBe(`${FF}rac fica`);
    expect(repairs).toEqual(["\\frac", "%"]);
  });

  it("returns the same object when nothing needed repair, and survives non-objects", () => {
    const json = { a: [1, null, "x", { latex: "x^2" }] };
    const out = repairJsonLatex(json);
    expect(out.json).toBe(json);
    expect(out.repairs).toEqual([]);
    expect(repairJsonLatex(null).json).toBeNull();
    expect(repairJsonLatex("x").json).toBe("x");
  });
});

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const doc = (blocks: unknown[]) =>
  ({ document: { schemaVersion: 1, blocks }, strategies_applied: [], pedagogical_justification: "x", implementation_tips: [] }) as unknown as AdaptationResult;
const q = (n: number, latex: string, extra: Record<string, unknown> = {}) => ({
  id: id(n), type: "question",
  stem: [{ id: id(n + 50), type: "paragraph", content: [{ type: "text", text: "Calcule " }, { type: "inlineMath", latex }] }],
  answer: { kind: "open" }, ...extra,
});

describe("findLatexIssues (C-10)", () => {
  it("is empty when every formula parses", () => {
    expect(findLatexIssues(doc([q(1, "\\frac{1}{2}"), { id: id(9), type: "blockMath", latex: "x^2" }]))).toEqual([]);
  });

  it("names the question (by its position among the questions) and the formula", () => {
    const issues = findLatexIssues(doc([
      { id: id(8), type: "paragraph", content: [{ type: "text", text: "intro" }] },
      q(1, "\\frac{1}{2}"),
      q(2, "\\frac{1{"),
    ]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ question: 2, latex: "\\frac{1{" });
    expect(issues[0].reason).toMatch(/\}/);
  });

  it("looks inside stems, alternatives, true/false, pairs, table cells, instruction and a block outside any question", () => {
    const bad = (n: string) => [{ type: "inlineMath", latex: `\\bad${n}{` }];
    const issues = findLatexIssues(doc([
      { id: id(1), type: "blockMath", latex: "\\oops{" },
      { ...q(2, "x"), instruction: bad("i"), enunciado: bad("e"), answer: { kind: "multipleChoice", alternatives: [{ id: id(3), content: bad("a"), correct: true }] } },
      { ...q(4, "x"), answer: { kind: "trueFalse", items: [{ id: id(5), content: bad("t"), value: true }] } },
      { ...q(6, "x"), answer: { kind: "matching", pairs: [{ id: id(7), left: bad("l"), right: bad("r") }] } },
      { ...q(8, "x"), answer: { kind: "table", rows: [[bad("c")]] } },
    ]));
    expect(issues.map((i) => [i.question, i.latex])).toEqual([
      [null, "\\oops{"],
      [1, "\\bada{"], [1, "\\badi{"], [1, "\\bade{"],
      [2, "\\badt{"],
      [3, "\\badl{"], [3, "\\badr{"],
      [4, "\\badc{"],
    ]);
  });

  it("ignores blocks without latex and never throws on a odd shape", () => {
    expect(findLatexIssues(doc([null, { type: "question" }, { type: "question", stem: "x", answer: null }]))).toEqual([]);
  });

  it("does not echo the formula twice in the reason", () => {
    const [issue] = findLatexIssues(doc([q(1, "9 - 4 = ___")]));
    expect(issue.reason).toBe("Expected group after '_' at position 9");
  });

  it("flags a control character that survived", () => {
    const issues = findLatexIssues(doc([q(1, `a${FF}b`)]));
    expect(issues[0].reason).toMatch(/caractere de controle/);
  });
});

describe("findLatexIssues follows the sheet's mode (N-M-002)", () => {
  const equation = "\\begin{equation} x = 1 \\end{equation}";

  it("accepts \\begin{equation} in a blockMath, refuses it in an inlineMath", () => {
    expect(findLatexIssues(doc([{ id: id(9), type: "blockMath", latex: equation }]))).toEqual([]);
    expect(findLatexIssues(doc([q(1, equation)]))).toHaveLength(1);
  });

  it("flags \\href and \\includegraphics in a block too: the sheet prints them in red", () => {
    const issues = findLatexIssues(doc([
      { id: id(9), type: "blockMath", latex: "\\includegraphics{a.png}" },
      q(1, "\\href{https://x.com}{ver}"),
    ]));
    expect(issues.map((i) => i.reason)).toEqual([expect.stringMatching(/includegraphics/), expect.stringMatching(/href/)]);
  });
});

describe("messages", () => {
  const issues = [
    { question: 2, latex: "\\frac{1{", reason: "Expected '}'" },
    { question: null, latex: "\\oops{", reason: "Undefined" },
  ];

  it("latexIssueErrors names the formula for the reask", () => {
    const errors = latexIssueErrors(issues);
    expect(errors[0]).toContain("questão 2");
    expect(errors[0]).toContain("\\frac{1{");
    expect(errors[0]).toContain("Expected '}'");
    expect(errors[1]).toContain("fora das questões");
  });

  it("caps very long formulas in the message", () => {
    const long = "x".repeat(300);
    expect(latexIssueErrors([{ question: 1, latex: long, reason: "r" }])[0].length).toBeLessThan(260);
  });

  it("latexIssuesToReview makes one informational issue per formula, with the question number", () => {
    expect(latexIssuesToReview(issues, 5)).toEqual([
      { question: 2, kind: "invalid_latex", items: ["\\frac{1{"], of: 5 },
      { question: null, kind: "invalid_latex", items: ["\\oops{"] },
    ]);
  });
});
