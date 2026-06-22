import { describe, it, expect } from "vitest";
import { inlineToPM, richTextToPM } from "./fromCanonical";
import { pmToInline, pmToRichText } from "./toCanonical";
import type { Inline, RichText } from "@/lib/adaptation/canonical/schema";

/**
 * Direct round-trip tests for the inline mappers reused by `RichTextField`.
 *
 * Invariant: `pmToRichText(richTextToPM(rt))` deep-equals `rt` for every valid
 * RichText — formatting (marks), color, and inline math survive losslessly.
 */

describe("inline mappers round-trip (RichText -> PM inline -> RichText)", () => {
  const cases: { name: string; value: RichText }[] = [
    { name: "empty", value: [] },
    { name: "plain text", value: [{ type: "text", text: "hello" }] },
    {
      name: "bold + italic marks (normalized order)",
      value: [{ type: "text", text: "x", marks: ["bold", "italic"] }],
    },
    {
      name: "all four marks",
      value: [{ type: "text", text: "x", marks: ["bold", "italic", "underline", "strike"] }],
    },
    {
      name: "color",
      value: [{ type: "text", text: "red", color: "#DC2626" }],
    },
    {
      name: "marks + color together",
      value: [{ type: "text", text: "bc", marks: ["bold"], color: "#2563EB" }],
    },
    {
      name: "fontSize alone (12pt ↔ 16px exact)",
      value: [{ type: "text", text: "big", fontSize: 12 }],
    },
    {
      name: "fontSize alone (non-divisible-by-3: 14pt → px → 14pt via toFixed cleanup)",
      value: [{ type: "text", text: "larger", fontSize: 14 }],
    },
    {
      name: "color + fontSize together (single textStyle mark)",
      value: [{ type: "text", text: "styled", color: "#DC2626", fontSize: 12 }],
    },
    {
      name: "marks + color + fontSize all together",
      value: [{ type: "text", text: "all", marks: ["bold", "italic"], color: "#16A34A", fontSize: 15 }],
    },
    {
      name: "inline math without alt",
      value: [{ type: "inlineMath", latex: "x^2" }],
    },
    {
      name: "inline math with alt",
      value: [{ type: "inlineMath", latex: "\\frac{1}{2}", alt: "um meio" }],
    },
    {
      name: "mixed runs (text + math + styled text)",
      value: [
        { type: "text", text: "f(x) = " },
        { type: "inlineMath", latex: "x^2" },
        { type: "text", text: " final", marks: ["bold"], color: "#16A34A" },
      ],
    },
  ];

  for (const { name, value } of cases) {
    it(`is lossless for ${name}`, () => {
      const back = pmToRichText(richTextToPM(value));
      expect(back).toEqual(value);
    });
  }

  it("normalizes mark ordering on the way back (strike,bold -> bold,strike)", () => {
    // PM may carry marks in any order; pmToInline normalizes to MARK_ORDER.
    const pm = [{ type: "text", text: "x", marks: [{ type: "strike" }, { type: "bold" }] }];
    expect(pmToInline(pm[0])).toEqual({ type: "text", text: "x", marks: ["bold", "strike"] });
  });

  it("inlineToPM emits no marks array for an unstyled run", () => {
    const pm = inlineToPM({ type: "text", text: "plain" } as Inline);
    expect(pm).toEqual({ type: "text", text: "plain" });
  });

  it("pmToInline silently ignores a malformed fontSize (non-numeric string)", () => {
    // Tests the defensive `!isNaN(px)` branch guard in toCanonical.ts.
    const pm = { type: "text", text: "x", marks: [{ type: "textStyle", attrs: { fontSize: "invalid" } }] };
    expect(pmToInline(pm)).toEqual({ type: "text", text: "x" });
  });
});
