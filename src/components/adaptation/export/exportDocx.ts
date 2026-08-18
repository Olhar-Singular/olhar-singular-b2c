/**
 * Word (.docx) export.
 *
 * `docxFileName`        — pure filename derivation.
 * render helpers        — richTextToRuns / blockToDocxParagraphs / headerParagraphs:
 *                         pure canonical→docx mapping, exported for direct unit tests.
 * `docxExportWarnings`  — what will NOT survive the trip to Word (shown BEFORE the
 *                         download, so "Word gerado!" never covers a silent loss).
 * `documentRunStyle`    — pure pageStyle → docx run mapping (font + half-points).
 * `docxContentBlocks`   — pure document + PanelSettings → docx blocks, já com as
 *                         quebras de página (switch do painel e `style.pageBreakBefore`).
 * `downloadDocx`        — side-effecting blob + DOM download (v8 ignore).
 *
 * Presentation mirrors the PDF (`render/pdf/PdfAnswer`, `PdfLeafBlocks`,
 * `PdfQuestion`) — same content, same ORDER, and the gabarito equally hidden:
 * empty markers everywhere, `ordering` left in authored order (sorting it would
 * BE the answer key), `fillBlank` rendering nothing because its gaps live inline
 * in the stem. Every canonical block type and answer kind is covered; the parity
 * test in exportDocx.test.ts fails if a new one is added without a mapper.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
  AlignmentType,
  PageBreak,
} from "docx";
import type {
  CanonicalDocument,
  DocumentHeader,
  Block,
  Inline,
  RichText,
  PageStyle,
} from "@/lib/adaptation/canonical/schema";
import {
  fontFamilyToDocx,
  DOCX_NON_STANDARD_FONTS,
  isFontFamilyToken,
} from "@/lib/adaptation/canonical/fontFamily";
import { indexToLetter } from "../render/letters";
import { documentHasMath, everyBlock } from "./exportWarnings";
import { perQuestionBreakFlags } from "../render/perQuestionBreaks";
import { DEFAULT_PANEL_SETTINGS, type PanelSettings } from "./panelSettings";

/** A docx section child. Tables are blocks too, not paragraphs. */
export type DocxBlock = Paragraph | Table;

/** Monospace face for LaTeX source, mirroring the PDF's MATH_PDF_STYLE. */
const MATH_FONT = "Courier New";
/** Indent (twips) for answer rows — the PDF's 22pt marker column. */
const ANSWER_INDENT = 360;
/** Question instruction/enunciado size in half-points (10.5pt, as in the PDF). */
const SUB_SIZE = 21;

/** Derive a safe .docx filename from the document header title. */
export function docxFileName(header: DocumentHeader): string {
  const title = header.title?.trim();
  if (!title) return "atividade-adaptada.docx";
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "atividade-adaptada"}.docx`;
}

/** Formatting inherited from the surrounding context (table header, instruction). */
type RunStyle = { bold?: boolean; italics?: boolean; size?: number };

export function richTextToRuns(nodes: Inline[], inherited: RunStyle = {}): TextRun[] {
  return nodes.map((node) => {
    if (node.type === "inlineMath") {
      // Word has no KaTeX. Emitting the LaTeX source keeps the content visible
      // (the PDF makes the same pragmatic projection); dropping it was silent
      // data loss in the middle of a sentence.
      return new TextRun({ ...inherited, text: node.latex, font: MATH_FONT });
    }
    return new TextRun({
      ...inherited,
      text: node.text,
      bold: node.marks?.includes("bold") || inherited.bold,
      italics: node.marks?.includes("italic") || inherited.italics,
      underline: node.marks?.includes("underline") ? {} : undefined,
      strike: node.marks?.includes("strike"),
    });
  });
}

/** An answer row: an empty marker plus the item's content. */
function answerRow(marker: string, content: RichText): Paragraph {
  return new Paragraph({
    indent: { left: ANSWER_INDENT },
    children: [new TextRun({ text: `${marker} ` }), ...richTextToRuns(content)],
  });
}

/**
 * The typed answer, mirroring PdfAnswer kind by kind. Exhaustive over the union
 * (no default), so a new kind is a compile error rather than a silent omission.
 */
function answerToDocx(answer: Extract<Block, { type: "question" }>["answer"]): DocxBlock[] {
  switch (answer.kind) {
    case "open": {
      const lines = answer.answerLines ?? 3;
      return Array.from(
        { length: lines },
        () => new Paragraph({ children: [new TextRun({ text: "_".repeat(60) })] }),
      );
    }
    case "multipleChoice":
      return answer.alternatives.map((alternative, i) =>
        // No ✔ on the correct one — the gabarito stays hidden, as in the PDF.
        answerRow(`${indexToLetter(i)})`, alternative.content),
      );
    case "trueFalse":
      return answer.items.map((item) => answerRow("(  ) V  (  ) F", item.content));
    case "checkbox":
      // [ ] for every item, never [x] — `checked` is the answer key.
      return answer.items.map((item) => answerRow("[ ]", item.content));
    case "matching":
      return answer.pairs.map(
        (pair) =>
          new Paragraph({
            indent: { left: ANSWER_INDENT },
            children: [
              ...richTextToRuns(pair.left),
              new TextRun({ text: "  ↔  " }),
              ...richTextToRuns(pair.right),
            ],
          }),
      );
    case "ordering":
      // Authored order, NOT sorted by `position` — sorting would reveal the answer.
      return answer.items.map((item) => answerRow("____", item.content));
    case "fillBlank":
      // The gaps live inline in the stem; there is no separate answer to show
      // (same contract as PdfAnswer, which renders an empty view here).
      return [];
    case "table": {
      const [header, ...body] = answer.rows;
      if (!header) return [];
      const row = (cells: RichText[], bold: boolean) =>
        new TableRow({
          children: cells.map(
            (cell) =>
              new TableCell({
                children: [new Paragraph({ children: richTextToRuns(cell, { bold }) })],
              }),
          ),
        });
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [row(header, true), ...body.map((cells) => row(cells, false))],
        }),
      ];
    }
  }
}

export function blockToDocxParagraphs(block: Block, number: number): DocxBlock[] {
  switch (block.type) {
    case "heading": {
      const level =
        block.level === 1
          ? HeadingLevel.HEADING_1
          : block.level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3;
      return [new Paragraph({ heading: level, children: richTextToRuns(block.content) })];
    }

    case "paragraph":
      return [new Paragraph({ children: richTextToRuns(block.content) })];

    case "blockMath":
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: block.latex, font: MATH_FONT })],
        }),
      ];

    case "image": {
      // The picture itself is not embedded (see docxExportWarnings). Leaving a
      // labelled placeholder means the teacher can see WHERE it belonged
      // instead of finding a hole where a figure used to be.
      const label = block.alt?.trim() ? `[Imagem: ${block.alt.trim()}]` : "[Imagem]";
      const paragraphs: DocxBlock[] = [
        new Paragraph({ children: [new TextRun({ text: label, italics: true })] }),
      ];
      if (block.caption && block.caption.length > 0) {
        paragraphs.push(new Paragraph({ children: richTextToRuns(block.caption) }));
      }
      return paragraphs;
    }

    case "scaffolding":
      // Numbered steps, as PdfScaffolding renders them.
      return block.items.map(
        (item, i) => new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${item}` })] }),
      );

    case "divider":
      return [new Paragraph({ children: [new TextRun({ text: "─".repeat(40) })] })];

    case "question": {
      const label = block.customNumber ?? String(number);
      const position = block.enunciadoPosition ?? "below";
      const hasEnunciado = block.enunciado != null && block.enunciado.length > 0;
      const enunciado = hasEnunciado
        ? [new Paragraph({ children: richTextToRuns(block.enunciado!), spacing: { after: 60 } })]
        : [];

      // The stem is a list of BLOCKS (it can hold images, math, nested
      // questions). Only paragraphs used to survive, so anything else in a stem
      // vanished from the Word file.
      const [first, ...restStem] = block.stem;
      const firstRuns =
        first?.type === "paragraph" ? richTextToRuns(first.content) : [];
      const numbered = new Paragraph({
        children: [new TextRun({ text: `${label}. `, bold: true }), ...firstRuns],
      });
      const stemRest = (first?.type === "paragraph" ? restStem : block.stem).flatMap((child) =>
        blockToDocxParagraphs(child, 1),
      );

      return [
        ...(position === "above" ? enunciado : []),
        numbered,
        ...stemRest,
        ...(position === "below" ? enunciado : []),
        ...(block.instruction
          ? [
              new Paragraph({
                children: richTextToRuns(block.instruction, { italics: true, size: SUB_SIZE }),
              }),
            ]
          : []),
        ...answerToDocx(block.answer),
        new Paragraph({ children: [] }),
      ];
    }
  }
}

export function headerParagraphs(header: DocumentHeader): Paragraph[] {
  const lines: [string, string][] = [
    ["Título", header.title ?? ""],
    ["Escola", header.school ?? ""],
    ["Professor(a)", header.teacher ?? ""],
    ["Data", header.date ?? ""],
  ].filter(([, v]) => v) as [string, string][];

  return lines.map(
    ([label, value]) =>
      new Paragraph({
        children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun({ text: value })],
      }),
  );
}

/**
 * What the .docx will NOT carry faithfully.
 *
 * The panel shows this BEFORE downloading. The bug this closes is not that Word
 * is lossy — some loss is unavoidable — but that the app claimed "Word gerado!"
 * over it, so the teacher only discovered the hole in front of the class.
 */
export function docxExportWarnings(
  document: CanonicalDocument,
  pageStyle?: PageStyle,
): string[] {
  const blocks = everyBlock(document.blocks);
  const warnings: string[] = [];

  if (blocks.some((b) => b.type === "image")) {
    warnings.push(
      "As imagens não são embutidas no Word — cada uma vira uma marcação [Imagem] no lugar.",
    );
  }

  // A varredura de math (inline em qualquer campo RichText, mais blockMath) é
  // a mesma do PDF e mora em `exportWarnings`.
  if (documentHasMath(document)) {
    warnings.push("As fórmulas saem como texto LaTeX, sem formatação matemática.");
  }

  const family = pageStyle?.fontFamily;
  if (family && isFontFamilyToken(family) && DOCX_NON_STANDARD_FONTS.includes(family)) {
    warnings.push(
      `A fonte ${fontFamilyToDocx(family)} precisa estar instalada no computador que abrir o arquivo; ` +
        "sem ela, o Word troca por outra fonte.",
    );
  }

  return warnings;
}

/**
 * The document-wide run style from "Aparência" — the accessibility font and body
 * size, which are the whole point of the feature and used to stop at the panel
 * because downloadDocx never accepted pageStyle.
 *
 * Lives out here, and not inline in `downloadDocx`, because that function is
 * `v8 ignore`d for its DOM side effects — the mapping would ship with no test.
 */
export function documentRunStyle(pageStyle?: PageStyle): { font?: string; size?: number } {
  const run: { font?: string; size?: number } = {};
  if (pageStyle?.fontFamily) run.font = fontFamilyToDocx(pageStyle.fontFamily);
  // docx measures type size in half-points, so 14pt is 28.
  if (pageStyle?.fontSize) run.size = Math.round(pageStyle.fontSize * 2);
  return run;
}

/**
 * Prende uma quebra de página REAL ao início do bloco.
 *
 * A quebra vai como primeiro run do primeiro parágrafo (e não como um parágrafo
 * solto só com a quebra), senão o Word abriria cada página nova com uma linha
 * vazia que o PDF não tem. Quando o bloco começa por uma tabela — que não aceita
 * run —, aí sim entra um parágrafo dedicado.
 */
export function withPageBreak(blocks: DocxBlock[]): DocxBlock[] {
  const [first] = blocks;
  if (first instanceof Paragraph) {
    first.addRunToFront(new PageBreak());
    return blocks;
  }
  return [new Paragraph({ children: [new PageBreak()] }), ...blocks];
}

/**
 * O corpo do .docx: os blocos do documento já com a numeração das questões e as
 * quebras de página.
 *
 * Mora fora de `downloadDocx` (que é `v8 ignore` pelos efeitos de DOM) porque é
 * exatamente aqui que estava o achado 0132: o switch "Quebra de página por
 * questão" chegava à prévia, ao PDF e ao "Copiar" e sumia no Word — o arquivo
 * saía num fluxo contínuo, sem nenhum `<w:br w:type="page"/>`. A derivação é a
 * mesma `perQuestionBreakFlags` que a prévia e o PDF leem, e o
 * `style.pageBreakBefore` do nó canônico (que o PDF já honra) também entra.
 */
export function docxContentBlocks(
  document: CanonicalDocument,
  settings: PanelSettings = DEFAULT_PANEL_SETTINGS,
): DocxBlock[] {
  const breaks = perQuestionBreakFlags(document.blocks);
  let questionIndex = 0;
  return document.blocks.flatMap((block, i) => {
    if (block.type === "question") questionIndex++;
    const paragraphs = blockToDocxParagraphs(block, questionIndex);
    const forceBreak =
      (settings.pageBreakPerQuestion && breaks[i]) || block.style?.pageBreakBefore === true;
    return forceBreak ? withPageBreak(paragraphs) : paragraphs;
  });
}

/* v8 ignore start */
export async function downloadDocx(
  document: CanonicalDocument,
  settings: PanelSettings = DEFAULT_PANEL_SETTINGS,
  pageStyle?: PageStyle,
): Promise<void> {
  const header = settings.header;
  const contentParagraphs = docxContentBlocks(document, settings);

  const doc = new Document({
    styles: { default: { document: { run: documentRunStyle(pageStyle) } } },
    sections: [
      {
        children: [...headerParagraphs(header), new Paragraph({ children: [] }), ...contentParagraphs],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = docxFileName(header);
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
/* v8 ignore stop */
