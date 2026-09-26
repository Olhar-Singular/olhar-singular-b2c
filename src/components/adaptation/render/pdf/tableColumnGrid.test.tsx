/**
 * Geometry regression guard (achado 0601): a table answer has ONE column grid.
 *
 * The bug: the table cell style had `flexGrow: 1` with the default
 * `flexBasis: auto`, so Yoga sized every cell from its own CONTENT. Each row is
 * an independent flex container, so a row with a long cell pushed its
 * neighbours sideways and the vertical borders zig-zagged from row to row.
 *
 * parity.test.ts cannot catch this: it only asserts a non-empty mapper per
 * kind. Here we run react-pdf's real layout engine and read the painted x of
 * the first word of each cell, row by row.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import type { CanonicalDocument, QuestionAnswer } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];

type Line = { box?: { x?: number; y?: number } };
type Node = { box?: { left?: number; top?: number }; lines?: Line[]; children?: Node[] };

type Painted = { x: number; y: number };

/** Absolute (x, y) of every painted text line in the computed layout. */
function paintedOrigins(node: Node, dx = 0, dy = 0): Painted[] {
  const left = dx + (node.box?.left ?? 0);
  const top = dy + (node.box?.top ?? 0);
  const out = (node.lines ?? []).map((line) => ({
    x: left + (line.box?.x ?? 0),
    y: top + (line.box?.y ?? 0),
  }));
  for (const child of node.children ?? []) out.push(...paintedOrigins(child, left, top));
  return out;
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
    createPdfFontStore() as never,
  )) as Node;
}

/** Painted x of each cell, grouped into rows by the y of its first line. */
function columnStartsByRow(root: Node): number[][] {
  const rows = new Map<number, number[]>();
  for (const { x, y } of paintedOrigins(root)) {
    const key = Math.round(y);
    const xs = rows.get(key) ?? [];
    // Only the first line of a cell starts a column.
    if (!xs.some((v) => Math.abs(v - x) < 0.5)) xs.push(x);
    rows.set(key, xs);
  }
  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, xs]) => xs.sort((a, b) => a - b));
}

const TABLE: QuestionAnswer = {
  kind: "table",
  rows: [
    [rt("Substancia"), rt("Estado"), rt("Fusao")],
    [rt("Agua"), rt("Liquido"), rt("0")],
    [rt("Ferro"), rt("Solido"), rt("1538")],
    [rt("Alcool etilico usado em laboratorio escolar"), rt("Liquido"), rt("-114")],
  ],
};

describe("PdfAnswer — a table shares one column grid across rows", () => {
  it("starts column i at the same x in every row", async () => {
    const byRow = columnStartsByRow(await layout(TABLE)).filter((xs) => xs.length === 3);
    expect(byRow.length).toBeGreaterThanOrEqual(3);

    const [first, ...rest] = byRow;
    for (const xs of rest) {
      for (let i = 0; i < first.length; i += 1) {
        expect(Math.abs(xs[i] - first[i])).toBeLessThanOrEqual(0.5);
      }
    }
  });
});
