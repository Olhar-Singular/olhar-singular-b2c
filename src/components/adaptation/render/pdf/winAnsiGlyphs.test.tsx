/**
 * Guarda de encoding (achado 0444): o PDF não pode IMPRIMIR um caractere que a
 * fonte do arquivo não tem.
 *
 * As fontes padrão do `@react-pdf` são as built-in Type 1 do PDF, com encoding
 * WinAnsi (CP1252) e sem embutir nada. Pedir um glifo de fora dessa tabela não
 * levanta erro: o byte que sobra na codificação vira OUTRO caractere. Era o que
 * acontecia com o `↔` da associação, que chegava ao aluno como `”`.
 *
 * O teste roda o layout real do react-pdf e lê o texto que vai ser pintado, em
 * vez de inspecionar o JSX: é a única forma de pegar um glifo emitido por
 * qualquer um dos mapeadores.
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import { PdfAnswer } from "./PdfAnswer";
import { ANSWER_LINE_COLOR } from "../pageTokens";
import type { CanonicalDocument, QuestionAnswer } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];

/**
 * Os 27 caracteres que a CP1252 acomoda na faixa 0x80-0x9F (onde a Latin-1 tem
 * controles). Fora deles, a tabela é ASCII imprimível + Latin-1 alta.
 */
const WINANSI_HIGH = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function isWinAnsi(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true;
  return WINANSI_HIGH.has(codePoint);
}

type Glyph = { codePoints?: number[] };
type Run = { glyphs?: Glyph[] };
type Line = { runs?: Run[] };
type Node = { lines?: Line[]; children?: Node[] };

/** Todo texto que o layout vai pintar, glifo por glifo. */
function paintedText(node: Node): string {
  const own = (node.lines ?? [])
    .flatMap((line) => line.runs ?? [])
    .flatMap((run) => run.glyphs ?? [])
    .map((glyph) => String.fromCodePoint(...(glyph.codePoints ?? [])))
    .join("");
  return own + (node.children ?? []).map(paintedText).join("");
}

async function layout(answer: QuestionAnswer): Promise<Node> {
  const doc: CanonicalDocument = {
    schemaVersion: 1,
    blocks: [
      {
        id: id(1),
        type: "question",
        stem: [{ id: id(2), type: "paragraph", content: rt("Relacione as colunas") }],
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

describe("PdfAnswer — nenhum glifo fora da CP1252 chega ao papel", () => {
  it("imprime a associação sem emitir um caractere que a fonte built-in não tem", async () => {
    const text = paintedText(
      await layout({
        kind: "matching",
        pairs: [
          { id: id(3), left: rt("Peixe"), right: rt("Rio") },
          { id: id(4), left: rt("Camelo"), right: rt("Deserto") },
        ],
      }),
    );

    expect(text).toContain("Peixe");
    // O `↔` da camada de texto invisível (achado 0194) é a única exceção: ele
    // não é tinta, viaja em Liberation Sans (que tem o glifo) e existe só para
    // `pdftotext` e o leitor de tela acharem o elo entre os dois termos. Quem
    // IMPRIME o elo continua sendo o desenho, testado logo abaixo.
    const painted = text.replaceAll("\u2194", "");
    const foreign = [...painted].filter((ch) => !isWinAnsi(ch.codePointAt(0) ?? 0));
    expect(foreign).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// O desenho que substitui o glifo: um traço com uma ponta em cada extremidade,
// que é o que a folha mostra. Sem as duas pontas o elo viraria um traço simples
// e deixaria de dizer que a associação vale nos dois sentidos.
// ---------------------------------------------------------------------------

type PaintCall = { method: string; args: number[] };
type Painter = Record<string, (...args: number[]) => unknown>;
type PaintFn = (painter: Painter, width: number, height: number) => unknown;

function recordingPainter(calls: PaintCall[]): Painter {
  const painter: Painter = {};
  for (const method of ["lineWidth", "strokeColor", "moveTo", "lineTo", "stroke"]) {
    painter[method] = (...args: number[]) => {
      calls.push({ method, args });
      return painter;
    };
  }
  return painter;
}

/** O `paint` do primeiro `Canvas` da árvore. */
function findPaint(node: unknown): PaintFn | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findPaint(child);
      if (found) return found;
    }
    return undefined;
  }
  const props = (node as ReactElement).props as { paint?: PaintFn; children?: unknown } | undefined;
  if (!props) return undefined;
  if (typeof props.paint === "function") return props.paint;
  return findPaint(props.children);
}

describe("elo desenhado da associação", () => {
  const WIDTH = 10.8;
  const HEIGHT = 16.8;

  function calls(): PaintCall[] {
    const recorded: PaintCall[] = [];
    const paint = findPaint(
      PdfAnswer({
        answer: { kind: "matching", pairs: [{ id: id(3), left: rt("Peixe"), right: rt("Rio") }] },
      }),
    );
    expect(typeof paint).toBe("function");
    paint?.(recordingPainter(recorded), WIDTH, HEIGHT);
    return recorded;
  }

  it("atravessa a caixa inteira, no meio da linha do item", () => {
    const points = calls().filter((call) => call.method === "lineTo");
    expect(points[0].args).toEqual([WIDTH, HEIGHT / 2]);
    expect(Math.max(...points.map((point) => point.args[0]))).toBe(WIDTH);
    expect(Math.min(...points.map((point) => point.args[0]))).toBe(0);
  });

  it("desenha uma ponta em cada extremidade (três traços)", () => {
    expect(calls().filter((call) => call.method === "stroke")).toHaveLength(3);
  });

  it("usa a mesma cor dos outros traços do documento", () => {
    const color = calls().find((call) => call.method === "strokeColor");
    expect(color?.args[0]).toBe(ANSWER_LINE_COLOR);
  });
});
