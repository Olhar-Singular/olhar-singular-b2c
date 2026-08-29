/**
 * Geometry regression guard (achado 0162): the text of an answer item must be
 * drawn INSIDE the printable area.
 *
 * The bug: `FLEX` in PdfAnswer had no `flexBasis`, so Yoga derived the column's
 * base by measuring the text against the FULL parent width (515.28pt) and only
 * then shrank the box to make room for the marker. The shrink moves the box,
 * but the lines were already broken at the wider measure, so every continuation
 * line was painted past the right margin — and with the 60pt true/false marker,
 * past the edge of the paper itself.
 *
 * parity.test.ts cannot catch this: it only asserts a non-empty mapper per
 * kind. Here we run react-pdf's real layout engine and measure the painted
 * lines (`xAdvance`), not the CSS box.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import FontStore from "@react-pdf/font";
import { AdaptationPdf } from "./AdaptationPdf";
import type { CanonicalDocument, QuestionAnswer } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];
// Long enough to wrap several times inside the answer column.
const LONG = "palavra ".repeat(60).trim();

// A4 (595.28pt) minus the 40pt page margins → right edge of the printable area.
const RIGHT_MARGIN = 555.28;
// `xAdvance` includes the trailing space that ends a wrapped line — it advances
// the pen but paints nothing, so one space (3.34pt at the 12pt base) is slack,
// not overflow. The bug overflowed by 14pt (a)/b) marker) to 256pt (matching),
// so this stays discriminating.
const TRAILING_SPACE_PT = 3.5;

type Line = { box?: { x?: number }; xAdvance?: number };
type Node = { type?: string; box?: { left?: number }; lines?: Line[]; children?: Node[] };

/** Absolute right edge of every painted text line in the computed layout. */
function paintedRightEdges(node: Node, offset = 0): number[] {
  const left = offset + (node.box?.left ?? 0);
  const edges = (node.lines ?? []).map((line) => left + (line.box?.x ?? 0) + (line.xAdvance ?? 0));
  for (const child of node.children ?? []) edges.push(...paintedRightEdges(child, left));
  return edges;
}

async function layout(answer: QuestionAnswer): Promise<Node> {
  const doc: CanonicalDocument = {
    schemaVersion: 1,
    blocks: [
      {
        id: id(1),
        type: "question",
        stem: [{ id: id(2), type: "paragraph", content: rt("Enunciado") }],
        answer,
      },
    ],
  };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  return (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    new (FontStore as unknown as { new (): unknown })() as never,
  )) as Node;
}

describe("PdfAnswer — answer text is painted inside the printable column", () => {
  const cases: Array<[string, QuestionAnswer]> = [
    ["multipleChoice", { kind: "multipleChoice", alternatives: [{ id: id(3), content: rt(LONG), correct: true }] }],
    ["trueFalse", { kind: "trueFalse", items: [{ id: id(3), content: rt(LONG), value: true }] }],
    ["checkbox", { kind: "checkbox", items: [{ id: id(3), content: rt(LONG), checked: false }] }],
    ["ordering", { kind: "ordering", items: [{ id: id(3), content: rt(LONG), position: 1 }] }],
    ["matching", { kind: "matching", pairs: [{ id: id(3), left: rt(LONG), right: rt(LONG) }] }],
  ];

  for (const [name, answer] of cases) {
    it(`keeps every painted line of a ${name} item within the right margin`, async () => {
      const edges = paintedRightEdges(await layout(answer));
      expect(edges.length).toBeGreaterThan(0);
      expect(Math.max(...edges)).toBeLessThanOrEqual(RIGHT_MARGIN + TRAILING_SPACE_PT);
    });
  }
});
