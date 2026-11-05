// @vitest-environment node
/**
 * O marcador da alternativa (`a)`, `b)`, ... `z)`) nunca quebra em duas linhas, em
 * qualquer fonte e em qualquer tamanho do Formato (achado I1 do lote 4b).
 *
 * Causa lida na revisão: "o `b)` da OpenDyslexic não cabe na coluna fixa". Medida: o
 * `b)` sozinho cabe (1,256em contra 1,333em da coluna); o que estoura é o `b)` MAIS o
 * espaço FANTASMA (`markerGhost`) que o marcador carrega quando a alternativa abre com
 * fórmula (monoespaçado, dá ao marcador a mesma linha de base do item). O textkit conta
 * o espaço final na linha e, sem espaço, quebra a palavra com hífen: `b-` / `)`. Na
 * OpenDyslexic, a mais larga, aparecia já no corpo padrão; `m)` (13ª alternativa) quebra
 * sozinho a partir de 22pt. Roda o layout REAL com as fontes REAIS.
 */
import { describe, it, expect, vi } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { FONT_FAMILY_TOKENS } from "@/lib/adaptation/canonical/fontFamily";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { AdaptationPdf } from "./AdaptationPdf";

vi.setConfig({ testTimeout: 60_000 });

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const COUNT = 30; // a) ... z) e aa) ... ad)

function documentWith(open: "text" | "math"): CanonicalDocument {
  return {
    schemaVersion: 1,
    blocks: [
      {
        id: id(1),
        type: "question",
        stem: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "Q" }] }],
        answer: {
          kind: "multipleChoice",
          alternatives: Array.from({ length: COUNT }, (_, i) => ({
            id: id(10 + i),
            content: open === "math" ? [{ type: "inlineMath", latex: "1/2" }] : [{ type: "text", text: "1/2" }],
            correct: false,
          })),
        },
      },
    ],
  } as CanonicalDocument;
}

type Node = {
  lines?: { runs?: { glyphs?: { codePoints?: number[] }[] }[]; rect?: { x: number } }[];
  children?: Node[];
  box?: { left?: number; width?: number };
};
const textNodes = (n: Node): Node[] => [...(n.lines ? [n] : []), ...(n.children ?? []).flatMap(textNodes)];
const textOf = (n: Node) =>
  n.lines!.map((l) => l.runs!.flatMap((r) => r.glyphs!.map((g) => String.fromCodePoint(...(g.codePoints ?? [63])))).join("")).join("|");

async function layout(document: CanonicalDocument, fontFamily: string, fontSize: number): Promise<Node> {
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document, pageStyle: { fontFamily, fontSize } as never }));
  const run = layoutDocument as unknown as (...args: unknown[]) => Promise<unknown>;
  return (await run(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
}

/** Os marcadores que saíram em mais de uma linha (`b-|)`). */
const brokenMarkers = (root: Node) =>
  textNodes(root)
    .filter((n) => n.lines!.length > 1)
    .map(textOf)
    .filter((t) => /^[a-z]{1,2}-?\|\)\s*$/.test(t));

describe("marcador da alternativa não quebra (I1)", () => {
  const sizes = [10, 12, 14, 18, 24, 32];

  for (const token of FONT_FAMILY_TOKENS) {
    for (const open of ["text", "math"] as const) {
      it(`${token} / alternativa abre com ${open === "math" ? "fórmula" : "texto"}: 30 marcadores x ${sizes.length} tamanhos`, async () => {
        for (const size of sizes) {
          const broken = brokenMarkers(await layout(documentWith(open), token, size));
          expect(broken, `${token} ${size}pt`).toEqual([]);
        }
      });
    }
  }

  it("a coluna do conteúdo continua onde estava: o texto das alternativas alinha na mesma coordenada", async () => {
    const x = async (open: "text" | "math", token: string) => {
      const root = await layout(documentWith(open), token, 12);
      return [...new Set(textNodes(root).filter((n) => /^1\/2/.test(textOf(n))).map((n) => Math.round((n.box?.left ?? 0) * 100) / 100))];
    };
    for (const token of ["sans", "opendyslexic"]) {
      expect((await x("text", token)).length, token).toBe(1);
      expect((await x("math", token)).length, token).toBe(1);
      expect((await x("math", token))[0], token).toBe((await x("text", token))[0]);
    }
  });
});
