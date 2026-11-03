/**
 * Achado 0522: the table frame was a literal `#999999` (2,85:1 on white) while
 * every other rule of the document (header rule, divider, answer line) reads
 * `RULE_COLOR`. Runs react-pdf's real layout and reads the border color of
 * every edge actually drawn inside the table.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import { RULE_COLOR } from "../pageTokens";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];

type Node = { style?: Record<string, unknown>; children?: Node[] };

const EDGES = ["Top", "Right", "Bottom", "Left"] as const;

/** Colors of every edge with a non-zero width, across the whole layout. */
function drawnBorderColors(node: Node, out: string[] = []): string[] {
  const s = node.style ?? {};
  for (const e of EDGES) {
    if (Number(s[`border${e}Width`] ?? 0) > 0) out.push(String(s[`border${e}Color`]));
  }
  for (const child of node.children ?? []) drawnBorderColors(child, out);
  return out;
}

describe("PdfAnswer — table frame ink", () => {
  it("draws every table edge with RULE_COLOR", async () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: id(1),
          type: "question",
          stem: [{ id: id(2), type: "paragraph", content: rt("Enunciado") }],
          answer: {
            kind: "table",
            rows: [
              [rt("Animal"), rt("Som")],
              [rt("gato"), rt("mia")],
            ],
          },
        },
      ],
    };
    const inst = pdf();
    inst.updateContainer(AdaptationPdf({ document: doc }));
    const root = (await layoutDocument(
      (inst as unknown as { container: { document: unknown } }).container.document,
      createPdfFontStore() as never,
    )) as Node;
    const colors = drawnBorderColors(root);
    // container top+left, plus right+bottom on each of the 4 cells
    expect(colors.length).toBeGreaterThanOrEqual(10);
    for (const c of colors) expect(c.toLowerCase()).toBe(RULE_COLOR.toLowerCase());
  });
});
