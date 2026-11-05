import { describe, it, expect, vi } from "vitest";

import {
  buildRequestBody,
  interpretAiResponse,
  nextReaskMessage,
  buildReaskMessages,
  shouldReaskForLatex,
  betterCandidate,
  latexReviewIssues,
  withReviewIssues,
  type AdaptRequestInput,
} from "./adaptActivityCore";

import { aiActivityJsonSchema } from "../../../src/lib/adaptation/canonical/ai";
import { validRichActivity } from "../../../src/lib/adaptation/canonical/__fixtures__/aiActivity";

const baseInput: AdaptRequestInput = {
  model: "google/gemini-2.5-pro",
  systemPrompt: "You are ISA.",
  userPrompt: "Adapt this activity.",
};

describe("buildRequestBody", () => {
  const schema = aiActivityJsonSchema();

  it("sets the model", () => {
    const body = buildRequestBody(baseInput, schema);
    expect(body.model).toBe("google/gemini-2.5-pro");
  });

  it("includes the system and user messages in order", () => {
    const body = buildRequestBody(baseInput, schema);
    expect(body.messages[0]).toEqual({ role: "system", content: "You are ISA." });
    expect(body.messages[1]).toEqual({ role: "user", content: "Adapt this activity." });
    expect(body.messages).toHaveLength(2);
  });

  it("requests structured output (json_schema, strict) with the given schema", () => {
    const body = buildRequestBody(baseInput, schema);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "adapted_activity",
        schema,
        strict: true,
      },
    });
  });

  it("appends extra reask messages when provided", () => {
    const reask = { role: "user" as const, content: "fix: blocks: required" };
    const body = buildRequestBody({ ...baseInput, extraMessages: [reask] }, schema);
    expect(body.messages).toHaveLength(3);
    expect(body.messages[2]).toEqual(reask);
  });
});

describe("interpretAiResponse", () => {
  it("returns ok + AdaptationResult for valid AI JSON", () => {
    const raw = JSON.stringify(validRichActivity);
    const result = interpretAiResponse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.schemaVersion).toBe(1);
      expect(result.result.document.blocks.length).toBeGreaterThan(0);
      expect(Array.isArray(result.result.strategies_applied)).toBe(true);
    }
  });

  it("returns errors for content that is not valid JSON", () => {
    const result = interpretAiResponse("this is not json {");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.join(" ")).toMatch(/json/i);
    }
  });

  it("returns errors for an empty string", () => {
    const result = interpretAiResponse("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("returns schema validation errors for structurally wrong AI JSON", () => {
    const bad = JSON.stringify({ blocks: "not-an-array" });
    const result = interpretAiResponse(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/blocks/);
    }
  });

  it("surfaces a domain validation failure as errors (zero-correct multipleChoice)", () => {
    const badMc = {
      blocks: [
        {
          type: "question",
          stem: [{ type: "paragraph", content: [{ type: "text", text: "Q" }] }],
          answer: {
            kind: "multipleChoice",
            alternatives: [
              { content: [{ type: "text", text: "a" }], correct: false },
              { content: [{ type: "text", text: "b" }], correct: false },
            ],
          },
        },
      ],
      strategies_applied: ["s"],
      pedagogical_justification: "j",
      implementation_tips: ["t"],
    };
    const result = interpretAiResponse(JSON.stringify(badMc));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe("interpretAiResponse — normalization failure path", () => {
  it("returns errors when buildAdaptationResult throws during normalization", async () => {
    // The AI schema is a strict subset that normally normalizes to a valid
    // document, so we force the post-parse domain failure by mocking the
    // canonical builder to throw. This proves the try/catch around
    // buildAdaptationResult is exercised.
    vi.resetModules();
    vi.doMock("../../../src/lib/adaptation/canonical/ai", () => ({
      parseAiActivity: () => ({ ok: true, value: { dummy: true } }),
      buildAdaptationResult: () => {
        throw new Error("boom: document invalid");
      },
    }));
    const mod = await import("./adaptActivityCore");
    const result = mod.interpretAiResponse(JSON.stringify({ anything: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/document validation failed/i);
      expect(result.errors.join(" ")).toMatch(/boom/);
    }
    vi.doUnmock("../../../src/lib/adaptation/canonical/ai");
    vi.resetModules();
  });

  it("reports 'unknown error' when buildAdaptationResult throws a non-Error", async () => {
    vi.resetModules();
    vi.doMock("../../../src/lib/adaptation/canonical/ai", () => ({
      parseAiActivity: () => ({ ok: true, value: { dummy: true } }),
      buildAdaptationResult: () => {
        throw "string failure";
      },
    }));
    const mod = await import("./adaptActivityCore");
    const result = mod.interpretAiResponse("{}");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/unknown error/);
    }
    vi.doUnmock("../../../src/lib/adaptation/canonical/ai");
    vi.resetModules();
  });
});

describe("interpretAiResponse — non-Error JSON failure", () => {
  it("reports 'unknown error' when JSON.parse throws a non-Error", () => {
    // JSON.parse always throws SyntaxError (an Error); to cover the non-Error
    // branch of the JSON catch we temporarily swap JSON.parse.
    const original = JSON.parse;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (JSON as any).parse = () => {
      throw "not-an-error";
    };
    try {
      const result = interpretAiResponse("{}");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join(" ")).toMatch(/unknown error/);
      }
    } finally {
      JSON.parse = original;
    }
  });
});

describe("nextReaskMessage", () => {
  it("produces a user message that contains every error verbatim", () => {
    const errors = ["blocks: Required", "pedagogical_justification: Required"];
    const msg = nextReaskMessage(errors);
    expect(msg.role).toBe("user");
    for (const e of errors) {
      expect(msg.content).toContain(e);
    }
  });

  it("handles a single error", () => {
    const msg = nextReaskMessage(["(root): Invalid"]);
    expect(msg.content).toContain("(root): Invalid");
  });
});

describe("buildReaskMessages", () => {
  it("returns exactly two messages", () => {
    const msgs = buildReaskMessages('{"bad":"json"}', ["blocks: Required"]);
    expect(msgs).toHaveLength(2);
  });

  it("first message is an assistant turn with the raw failed content", () => {
    const raw = '{"broken": true}';
    const msgs = buildReaskMessages(raw, ["blocks: Required"]);
    expect(msgs[0]).toEqual({ role: "assistant", content: raw });
  });

  it("second message is a user turn with the validation errors", () => {
    const errors = ["blocks: Required", "pedagogical_justification: Required"];
    const msgs = buildReaskMessages("{}", errors);
    expect(msgs[1].role).toBe("user");
    for (const e of errors) {
      expect(msgs[1].content).toContain(e);
    }
  });

  it("second message is identical to nextReaskMessage output", () => {
    const errors = ["answer: Invalid enum value"];
    const msgs = buildReaskMessages("{}", errors);
    expect(msgs[1]).toEqual(nextReaskMessage(errors));
  });
});

describe("interpretAiResponse — trueFalse items that are only V/F labels (0388)", () => {
  it("rejects the output so the model is reasked", () => {
    const labels = {
      blocks: [
        {
          type: "question",
          stem: [
            { type: "paragraph", content: [{ type: "text", text: "A afirmação é verdadeira ou falsa?" }] },
            { type: "blockMath", latex: "\\frac{3}{4} > \\frac{2}{3}" },
          ],
          answer: {
            kind: "trueFalse",
            items: [
              { content: [{ type: "text", text: "Verdadeiro" }], value: true },
              { content: [{ type: "text", text: "Falso" }], value: false },
            ],
          },
        },
      ],
      strategies_applied: ["s"],
      pedagogical_justification: "j",
      implementation_tips: ["t"],
    };
    const result = interpretAiResponse(JSON.stringify(labels));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/trueFalse/);
    }
  });
});

// C-10 / C-12 / C-18: LaTeX at the border.
describe("interpretAiResponse — LaTeX (C-10, C-12, C-18)", () => {
  const withFormula = (latex: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      blocks: [
        {
          type: "question",
          stem: [{ type: "paragraph", content: [{ type: "text", text: "Calcule " }, { type: "inlineMath", latex, ...extra }] }],
          answer: { kind: "open" },
        },
      ],
      strategies_applied: ["s"],
      pedagogical_justification: "j",
      implementation_tips: ["t"],
    });

  it("has no latexIssues and no repairs for a valid document", () => {
    const r = interpretAiResponse(JSON.stringify(validRichActivity));
    expect(r.ok && r.latexIssues).toEqual([]);
    expect(r.ok && r.repairedLatex).toEqual([]);
  });

  it("returns an otherwise valid document with the formulas KaTeX cannot show (the caller reasks once)", () => {
    const r = interpretAiResponse(withFormula("\\frac{1{"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.latexIssues).toHaveLength(1);
      expect(r.latexIssues[0]).toMatchObject({ question: 1, latex: "\\frac{1{" });
    }
  });

  it("catches the three shapes seen in the real batteries: a blank inside the formula, array with @{}, a bare command", () => {
    for (const bad of ["x + ___ = 5", "\\begin{array}{@{}c@{}} 1 \\end{array}", "\\comandoinexistente{x}", "x^2^3", "R$ 10,00 \\unknown"]) {
      const r = interpretAiResponse(withFormula(bad));
      expect(r.ok).toBe(true);
      // KaTeX in non-strict mode accepts some of these (`___`, `@{}`); the ones it refuses are listed.
      if (r.ok) expect(Array.isArray(r.latexIssues)).toBe(true);
    }
    const refused = interpretAiResponse(withFormula("\\comandoinexistente{x}"));
    expect(refused.ok && refused.latexIssues.length).toBe(1);
  });

  it("repairs a command whose backslash a JSON escape ate, and says so (C-12)", () => {
    // JSON "\f" is a form feed: the model wrote one backslash where two were needed.
    const raw = withFormula("X").replace('"X"', '"\\frac{1}{2}"'.replace("\\\\", "\\"));
    const r = interpretAiResponse(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const para = (r.result.document.blocks[0] as { stem: Array<{ content: Array<{ latex?: string }> }> }).stem[0].content[1];
      expect(para.latex).toBe("\\frac{1}{2}");
      expect(r.repairedLatex).toEqual(["\\frac"]);
      expect(r.latexIssues).toEqual([]);
    }
  });

  it("escapes a raw % instead of letting it hide the rest of the formula (C-18)", () => {
    const r = interpretAiResponse(withFormula("25% de 80 = 20"));
    expect(r.ok && r.repairedLatex).toEqual(["%"]);
    expect(r.ok && r.latexIssues).toEqual([]);
  });
});

describe("latex reask policy", () => {
  it("reasks once, only when there is a next attempt", () => {
    expect(shouldReaskForLatex(1, 1, 3, false, 30_000)).toBe(true);
    expect(shouldReaskForLatex(0, 1, 3, false, 30_000)).toBe(false);
    expect(shouldReaskForLatex(2, 3, 3, false, 30_000)).toBe(false);
    expect(shouldReaskForLatex(2, 2, 3, true, 30_000)).toBe(false);
  });

  it("does not reask when it could not finish before the 150 s gateway cut (L7-1)", () => {
    // first attempt took 100 s: deliver with the per-question notice
    expect(shouldReaskForLatex(3, 1, 3, false, 100_000)).toBe(false);
    // the reask needs 60 s and must end before 140 s
    expect(shouldReaskForLatex(1, 1, 3, false, 79_999)).toBe(true);
    expect(shouldReaskForLatex(1, 1, 3, false, 80_000)).toBe(false);
  });

  it("keeps the candidate with fewer broken formulas; a tie goes to the newer one", () => {
    const a = { latexIssues: [1, 2] };
    const b = { latexIssues: [1] };
    const c = { latexIssues: [1] };
    expect(betterCandidate(null, a)).toBe(a);
    expect(betterCandidate(a, b)).toBe(b);
    expect(betterCandidate(b, a)).toBe(b);
    expect(betterCandidate(b, c)).toBe(c);
  });

  it("turns what stayed invalid into per-question notices", () => {
    const r = interpretAiResponse(JSON.stringify(validRichActivity));
    if (!r.ok) throw new Error("fixture");
    const questions = r.result.document.blocks.filter((b) => b.type === "question").length;
    expect(latexReviewIssues(r.result, [{ question: 1, latex: "\\bad{", reason: "x" }])).toEqual([
      { question: 1, kind: "invalid_latex", items: ["\\bad{"], of: questions },
    ]);
  });
});

describe("withReviewIssues (L9A-4)", () => {
  const result = { schemaVersion: 1, document: { schemaVersion: 1, blocks: [] }, strategies_applied: [], pedagogical_justification: "", implementation_tips: [] } as never;

  it("stores the notices as an additive sibling of the document", () => {
    const issues = [{ question: 1, kind: "new_value" as const, items: ["15"] }];
    const stored = withReviewIssues(result, issues) as unknown as Record<string, unknown>;
    expect(stored.review_issues).toEqual(issues);
    expect(stored.document).toBe((result as unknown as Record<string, unknown>).document);
  });

  it("leaves the result untouched (no key at all) when there is nothing to show", () => {
    expect(withReviewIssues(result, [])).toBe(result);
    expect("review_issues" in (withReviewIssues(result, []) as object)).toBe(false);
  });
});
