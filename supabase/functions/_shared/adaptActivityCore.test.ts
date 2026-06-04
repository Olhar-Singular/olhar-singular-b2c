import { describe, it, expect, vi } from "vitest";

import {
  buildRequestBody,
  interpretAiResponse,
  nextReaskMessage,
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
