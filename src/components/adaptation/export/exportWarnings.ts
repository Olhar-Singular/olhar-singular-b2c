/**
 * O que cada formato de exportação NÃO carrega fiel.
 *
 * Mora fora de `exportDocx`/`exportPdf` porque a mesma varredura do documento
 * serve aos dois: a perda de fórmula é do Word E do PDF (o `mathToPdfText` v1
 * imprime o LaTeX cru em monoespaçada). O defeito que isto fecha não é a
 * limitação, é o silêncio: a prévia do passo Exportar mostra a fórmula
 * tipografada pelo KaTeX e o arquivo entrega `a^2 + b^2 = c^2`.
 */

import type { Block, CanonicalDocument, RichText } from "@/lib/adaptation/canonical/schema";

/** Walk every block, including question stems (which nest). */
export function everyBlock(blocks: Block[]): Block[] {
  return blocks.flatMap((block) =>
    block.type === "question" ? [block, ...everyBlock(block.stem)] : [block],
  );
}

/** Every RichText hanging off a question's answer, kind by kind. */
function answerRichTexts(answer: Extract<Block, { type: "question" }>["answer"]): RichText[] {
  switch (answer.kind) {
    case "open":
      return [];
    case "fillBlank":
      // `gaps[].answer` is a plain string, never RichText.
      return [];
    case "multipleChoice":
      return answer.alternatives.map((alternative) => alternative.content);
    case "trueFalse":
      return answer.items.map((item) => item.content);
    case "checkbox":
      return answer.items.map((item) => item.content);
    case "ordering":
      return answer.items.map((item) => item.content);
    case "matching":
      return answer.pairs.flatMap((pair) => [pair.left, pair.right]);
    case "table":
      return answer.rows.flat();
  }
}

/**
 * Every RichText field of a single block.
 *
 * `blockMath.latex` and `scaffolding.items` are plain strings, not RichText, so
 * they carry no inline nodes — blockMath is detected separately, by type.
 */
function richTextsOf(block: Block): RichText[] {
  switch (block.type) {
    case "heading":
      return [block.content];
    case "paragraph":
      return [block.content];
    case "image":
      return block.caption ? [block.caption] : [];
    case "blockMath":
      return [];
    case "scaffolding":
      return [];
    case "divider":
      return [];
    case "question":
      return [
        ...(block.enunciado ? [block.enunciado] : []),
        ...(block.instruction ? [block.instruction] : []),
        ...answerRichTexts(block.answer),
      ];
  }
}

/**
 * Há fórmula em qualquer lugar do documento?
 *
 * Inline math cabe em TODO campo RichText — uma alternativa, um enunciado, um
 * par de associação, uma célula de tabela. Olhar só parágrafo/título deixava o
 * LaTeX chegar ao arquivo sem nenhum aviso.
 */
export function documentHasMath(document: CanonicalDocument): boolean {
  const blocks = everyBlock(document.blocks);
  // As duas varreduras acontecem antes do `||`: curto-circuitar no blockMath
  // deixaria o caminho do inline sem exercício.
  const hasBlockMath = blocks.some((block) => block.type === "blockMath");
  const hasInlineMath = blocks
    .flatMap(richTextsOf)
    .some((rich) => rich.some((inline) => inline.type === "inlineMath"));
  return hasBlockMath || hasInlineMath;
}

/**
 * O que o PDF não carrega fiel.
 *
 * Mostrado ANTES do download, do mesmo jeito que o Word já fazia. Enquanto o
 * PDF não tipografa math (rasterizar KaTeX é o caminho previsto no TODO de
 * `mathToPdfText`), o professor precisa saber disso antes de imprimir.
 */
export function pdfExportWarnings(document: CanonicalDocument): string[] {
  if (!documentHasMath(document)) return [];
  return ["As fórmulas saem como texto LaTeX, sem formatação matemática."];
}
