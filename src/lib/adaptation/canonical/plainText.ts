/**
 * Pure projection of a CanonicalDocument to plain text, used by the "Copiar"
 * action on the export step. Mirrors the visual reading order of the renderer
 * (stem, instruction, then answers) without any markup.
 *
 * THE ANSWER KEY IS HIDDEN, exactly as in every other output surface
 * (AnswerView on screen, PdfAnswer in the PDF, exportDocx in Word): blank
 * markers for trueFalse/checkbox, `ordering` left in AUTHORED order (sorting it
 * by `position` would BE the key), and `fillBlank` rendering nothing (its blanks
 * live inline in the stem). "Copiar" sits next to the two export buttons and is
 * used to paste the sheet into Word or an e-mail — leaking the gabarito here
 * hands it to the students in one click.
 */

import type { Block, CanonicalDocument, QuestionAnswer, RichText } from "./schema.ts";
import { indexToLetter } from "@/components/adaptation/render/letters";
import { formatHeaderDateBR } from "@/components/adaptation/export/panelSettings";
import type { HeaderSettings } from "@/components/adaptation/export/panelSettings";
import { perQuestionBreakFlags } from "@/components/adaptation/render/perQuestionBreaks";
import { PAGE_BREAK_LABEL } from "@/components/adaptation/render/PageBreakMark";

// Math is projected as its LaTeX SOURCE, never as `alt`. `alt` is the
// accessibility label of the canonical schema (read by screen readers), not a
// textual projection: emitting it here made "Copiar" the only surface that
// dropped the equation ("teorema de pitagoras" instead of `a^2 + b^2 = c^2`),
// diverging from the PDF (mathToPdfText, raw LaTeX) and from the screen (KaTeX).
function richTextToText(rt: RichText): string {
  return rt.map((node) => (node.type === "text" ? node.text : node.latex)).join("");
}

function answerToLines(answer: QuestionAnswer): string[] {
  switch (answer.kind) {
    case "open":
      return [];
    case "multipleChoice":
      return answer.alternatives.map(
        (alt, i) => `${indexToLetter(i)}) ${richTextToText(alt.content)}`,
      );
    case "trueFalse":
      // Blank markers for the student to fill — never the authored value.
      return answer.items.map((item) => `(  ) V  (  ) F ${richTextToText(item.content)}`);
    case "checkbox":
      // Every box empty, whatever `checked` says.
      return answer.items.map((item) => `[ ] ${richTextToText(item.content)}`);
    case "matching":
      // The pairing is the STRUCTURE of the exercise, not the key (same call the
      // PDF and Word mappers make), so both sides are kept.
      return answer.pairs.map(
        (pair) => `${richTextToText(pair.left)} <-> ${richTextToText(pair.right)}`,
      );
    case "ordering":
      // AUTHORED order, not sorted by `position`: sorting would print the key.
      // A blank slot mirrors the "____" marker of the screen and PDF renderers.
      return answer.items.map((item) => `____ ${richTextToText(item.content)}`);
    case "fillBlank":
      // The blanks live inline in the stem; `gaps` is only the answer key.
      return [];
    case "table":
      return answer.rows.map((row) => row.map(richTextToText).join(" | "));
  }
}

/**
 * Project a block to plain-text lines. Questions are auto-numbered: `number` is
 * the question's 1-based ordinal in document order, computed by the caller (the
 * block itself stores no ordinal), and `block.customNumber` overrides it when
 * the teacher typed one. Non-question blocks ignore `number`.
 */
function blockToLines(block: Block, number: number): string[] {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return [richTextToText(block.content)];
    case "blockMath":
      // LaTeX source, not `alt` — see richTextToText.
      return [block.latex];
    case "image":
      return block.caption ? [richTextToText(block.caption)] : [];
    case "scaffolding":
      // NUMBERED, like the screen (`<ol list-decimal>` in ScaffoldingView) and
      // the PDF (`{i + 1}.` in PdfScaffolding): the order of the steps IS the
      // pedagogical content of the block, so a bullet would drop information in
      // the very surface the teacher pastes into an editor to adapt by hand.
      return block.items.map((item, i) => `${i + 1}. ${item}`);
    case "divider":
      return ["---"];
    case "question": {
      // Same label the screen (QuestionView), the PDF (PdfQuestion) and Word
      // (exportDocx) print: the authored `customNumber` wins over the ordinal,
      // and the separator is "." so the copied text keeps questions ("1.")
      // visually apart from alternatives ("a)").
      const prefix = `${block.customNumber ?? number}. `;
      let questionCount = 0;
      const stem = block.stem.flatMap((child) =>
        blockToLines(child, child.type === "question" ? ++questionCount : 0),
      );
      if (stem.length > 0) stem[0] = prefix + stem[0];
      const instruction = block.instruction ? [richTextToText(block.instruction)] : [];
      return [...stem, ...instruction, ...answerToLines(block.answer)];
    }
  }
}

/**
 * Cabeçalho projetado como uma linha rotulada por campo preenchido (campos
 * vazios são omitidos), na mesma ordem e com os mesmos rótulos do Word
 * (`headerParagraphs`) e dos campos do painel. A data passa por
 * `formatHeaderDateBR`, como na prévia (`DocumentHeaderView`) e no PDF
 * (`PdfHeader`): copiar "2026-08-18" enquanto a folha mostra "18/08/2026"
 * seria mais uma divergência entre superfícies.
 */
function headerToLines(header: HeaderSettings): string[] {
  return (
    [
      ["Título", header.title],
      ["Escola", header.school],
      ["Professor(a)", header.teacher],
      ["Data", header.date === undefined ? undefined : formatHeaderDateBR(header.date)],
    ] as const
  )
    .filter(([, value]) => value !== undefined && value.trim() !== "")
    .map(([label, value]) => `${label}: ${(value as string).trim()}`);
}

/**
 * Opções de saída do "Copiar", espelhando o que a prévia desenha e o PDF
 * imprime. As duas nascem do ExportPanel: o `header` é controlado pelo wizard e
 * o `pageBreakPerQuestion` é o switch do painel.
 */
export type PlainTextOptions = {
  header?: HeaderSettings;
  pageBreakPerQuestion?: boolean;
};

/**
 * Project a CanonicalDocument to plain text (blocks separated by blank lines).
 *
 * O cabeçalho preenchido no Exportar entra no topo do texto: sem ele, "Copiar"
 * era a única das três saídas (PDF, Word, Copiar) que descartava o que o
 * professor tinha acabado de digitar, sem aviso (achado 0127). A quebra por
 * questão vira um marcador textual pelo mesmo motivo — o switch mudava o PDF e
 * a prévia e não deixava rastro no texto copiado.
 */
export function documentToPlainText(
  document: CanonicalDocument,
  { header = {}, pageBreakPerQuestion = false }: PlainTextOptions = {},
): string {
  // Mesma derivação da prévia e do PDF: nunca quebra antes da primeira questão.
  const breaks = perQuestionBreakFlags(document.blocks);
  let questionCount = 0;
  const blocks = document.blocks.map((block, i) => {
    const lines = blockToLines(block, block.type === "question" ? ++questionCount : 0).join("\n");
    return pageBreakPerQuestion && breaks[i] ? `--- ${PAGE_BREAK_LABEL} ---\n\n${lines}` : lines;
  });
  // O cabeçalho é UM bloco (uma linha por campo), separado do corpo pela mesma
  // linha em branco que separa os demais blocos.
  const headerLines = headerToLines(header);
  const headerBlock = headerLines.length > 0 ? [headerLines.join("\n")] : [];
  return [...headerBlock, ...blocks].join("\n\n");
}
