/**
 * O que cada formato de exportação NÃO carrega fiel.
 *
 * Mora fora de `exportDocx`/`exportPdf` porque a mesma varredura do documento
 * serve aos dois: a perda de fórmula é do Word E do PDF (o LaTeX cru, em
 * monoespaçada, mesmo quando o nó tem texto alternativo: achado 0803). O defeito que isto fecha não é a limitação, é o silêncio: a
 * prévia do passo Exportar mostra a fórmula tipografada pelo KaTeX e o arquivo
 * entrega outra coisa.
 */

import {
  fontFamilyToPdf,
  pdfFamilyLacksItalic,
} from "@/lib/adaptation/canonical/fontFamily";
import type {
  Block,
  CanonicalDocument,
  PageStyle,
  RichText,
} from "@/lib/adaptation/canonical/schema";
import { documentToPlainText } from "@/lib/adaptation/canonical/plainText";
import type { HeaderSettings } from "@/components/adaptation/export/panelSettings";
import { UNREAD_MARKER_PATTERN } from "@/lib/domain/unreadMarker";
import { isPdfPrintable } from "@/components/adaptation/render/pdf/fontStack";

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
/**
 * A perda da fórmula: o LaTeX cru no lugar da fórmula tipografada. Vale para o
 * PDF, o Word e o "Copiar", com ou sem `alt` no nó: as três saídas projetam o
 * `latex` e nunca o texto alternativo (achado 0803).
 */
export const MATH_LOSS_WARNING =
  "As fórmulas saem como texto LaTeX, sem formatação matemática.";

/** Todo nó de fórmula do documento, inline ou de bloco. */
function mathNodes(document: CanonicalDocument): { latex: string }[] {
  const blocks = everyBlock(document.blocks);
  const blockNodes = blocks
    .filter((block) => block.type === "blockMath")
    .map((block) => ({ latex: block.latex }));
  const inlineNodes = blocks
    .flatMap(richTextsOf)
    .flatMap((rich) => rich.filter((inline) => inline.type === "inlineMath"))
    .map((inline) => ({ latex: inline.latex }));
  return [...blockNodes, ...inlineNodes];
}

/** O aviso fixo da prévia do Exportar (C-35): o que o arquivo faz com a fórmula que a prévia mostra bonita. */
export interface MathPreviewNotice {
  /** Frase fixa, sem jargão, sobre a diferença entre a prévia e o arquivo. */
  text: string;
  /** A primeira fórmula do próprio documento, como ela sai escrita no arquivo. */
  example: string;
  hasAlt: boolean;
  /** Só quando alguma fórmula tem descrição (alt): ela NÃO sai no arquivo, só o código. */
  altText: string | null;
}

const EXAMPLE_MAX_CHARS = 40;

/** The formula as the file prints it, short enough for a sentence and never cut inside a command. */
function exampleOf(latex: string): string {
  if (latex.length <= EXAMPLE_MAX_CHARS) return latex;
  return `${latex.slice(0, EXAMPLE_MAX_CHARS).replace(/\\[a-zA-Z]*$/, "")}…`;
}

/** The formulas of one RichText, in reading order. */
const inlineMathOf = (rich: RichText | undefined): { latex: string; alt?: string }[] =>
  (rich ?? []).flatMap((inline) => (inline.type === "inlineMath" ? [{ latex: inline.latex, alt: inline.alt }] : []));

/**
 * Every formula in the order the teacher SEES them on the sheet (N-U-007): for a question, the
 * enunciado above or below the stem (`enunciadoPosition`), the stem's own blocks, then the
 * instruction and the answer. (`everyBlock` is a flat list for counting; it puts the question's own
 * fields before its nested stem, which is not the order of the page.)
 */
function mathInOrder(blocks: Block[]): { latex: string; alt?: string }[] {
  return blocks.flatMap((block): { latex: string; alt?: string }[] => {
    if (block.type === "blockMath") return [{ latex: block.latex, alt: block.alt }];
    if (block.type !== "question") return richTextsOf(block).flatMap(inlineMathOf);
    const enunciado = inlineMathOf(block.enunciado);
    const stem = mathInOrder(block.stem);
    return [
      ...(block.enunciadoPosition === "above" ? [...enunciado, ...stem] : [...stem, ...enunciado]),
      ...inlineMathOf(block.instruction),
      ...answerRichTexts(block.answer).flatMap(inlineMathOf),
    ];
  });
}

/**
 * O aviso que a prévia do Exportar mostra ANTES de qualquer clique (C-35). A prévia desenha a
 * fórmula formatada (KaTeX) e o PDF, o Word e o "Copiar" imprimem o código dela: sem este aviso
 * a conferência visual contradiz o arquivo. Mostra a primeira fórmula do próprio documento como
 * exemplo. O texto alternativo (alt) nunca sai no arquivo, e o aviso diz isso quando existe.
 * `null` quando o documento não tem fórmula.
 */
export function mathPreviewNotice(document: CanonicalDocument): MathPreviewNotice | null {
  const math = mathInOrder(document.blocks);
  if (math.length === 0) return null;
  const hasAlt = math.some((m) => !!m.alt?.trim());
  return {
    text:
      "A prévia abaixo mostra as fórmulas formatadas, mas no PDF, no Word e ao copiar elas saem como texto LaTeX, o código da fórmula, sem formatação matemática.",
    example: exampleOf(math[0].latex),
    hasAlt,
    altText: hasAlt ? "A descrição que você escreveu para a fórmula não sai no arquivo: sai só o código." : null,
  };
}

/**
 * O que as saídas textuais perdem da fórmula. Um ponto só para PDF, Word e
 * "Copiar": as três imprimem o LaTeX, e o `alt` nunca substitui a equação
 * (achado 0803, que desfez a divergência entre 0401 e 0125).
 */
export function mathLossWarnings(document: CanonicalDocument): string[] {
  return documentHasMath(document) ? [MATH_LOSS_WARNING] : [];
}

/**
 * A outra metade da perda da fórmula, que o diálogo calava (achado 0415).
 *
 * A fórmula é o único conteúdo do documento que não passa pelo mapa de
 * `fontFamily.ts`: o PDF carimba `Courier` (`mathPdfStyle`) e o Word
 * `Courier New` (`MATH_FONT`), por constante, num corpo próprio
 * (`mathPdfFontSizePt`). Quem escolheu OpenDyslexic no popover "Formato"
 * recebia a prova com o texto na fonte pedida e a matemática em monoespaçada,
 * sem nada avisando. Enquanto a projeção continuar sendo LaTeX cru (a
 * rasterização é o TODO de `mathToPdfText`), o mínimo é o aviso dizer a
 * verdade inteira.
 *
 * Vale só para os dois ARQUIVOS: o "Copiar" entrega texto puro e não tem
 * tipografia a perder.
 */
/**
 * A marker the reading left ("[fórmula não lida]") and nobody completed prints on the exam
 * as it is. PDF, Word and Copiar all say so before the download (F5, lote 5b).
 */
export function unreadMarkerWarnings(document: CanonicalDocument): string[] {
  const found = documentToPlainText(document).match(new RegExp(UNREAD_MARKER_PATTERN.source, "giu")) ?? [];
  if (found.length === 0) return [];
  const many = found.length > 1;
  return [
    `${found.length} ${many ? "trechos" : "trecho"} ${many ? "ainda dizem" : "ainda diz"} "não lido" ` +
      `(${[...new Set(found)].join(", ")}) e ${many ? "vão impressos" : "vai impresso"} na prova do jeito que ${many ? "estão" : "está"}. ` +
      "Complete ou apague antes de exportar.",
  ];
}

export const MATH_TYPOGRAPHY_WARNING =
  "A fórmula também não usa a fonte do documento: sai em monoespaçada e num " +
  "corpo próprio, mesmo que você tenha escolhido outra fonte no Formato.";

export function documentHasMath(document: CanonicalDocument): boolean {
  return mathNodes(document).length > 0;
}

/**
 * Os caracteres do documento que NENHUMA fonte do PDF desenha, sem repetição e
 * na ordem em que aparecem (C-01).
 *
 * Toda família tem a fonte de símbolos como segunda opção (`fontStack.ts`), que
 * cobre a matemática escolar, o grego e a Latin Estendida; o que sobra aqui é o
 * que o arquivo não tem como desenhar (dingbat `✏`, emoji, cirílico, CJK) e que
 * sairia em branco ou trocado por outro símbolo.
 *
 * A varredura usa a MESMA projeção textual do botão "Copiar": ela já percorre
 * todo campo que vira texto no papel (enunciado, instrução, alternativa, par de
 * associação, célula, cabeçalho), então nenhum campo novo do schema pode
 * escapar daqui sem escapar de lá junto. As quebras de linha que a projeção
 * insere não são conteúdo e saem da conta.
 */
/** Controle e formatação (largura zero, marca bidi, hífen opcional) e marca combinante. */
const INVISIBLE = /^[\p{Cc}\p{Cf}\p{M}]$/u;

export function pdfUnsupportedCharacters(
  document: CanonicalDocument,
  header?: HeaderSettings,
): string[] {
  // O cabeçalho do Exportar (título, escola, professor) também vai para o papel (M1). Em
  // NFC, porque o PDF compõe o acento decomposto antes do layout (`nfc.ts`).
  const text = documentToPlainText(document, { header }).normalize("NFC").replace(/\s/g, "");
  return [
    ...new Set(
      [...text].filter(
        (character) =>
          // Invisível não é alarme (B1): controle, largura zero, marca bidi, hífen opcional
          // (\p{Cc}, \p{Cf}) e marca combinante que sobrou depois do NFC (\p{M}).
          !INVISIBLE.test(character) && !isPdfPrintable(character.codePointAt(0) as number),
      ),
    ),
  ];
}

/**
 * Item de resposta sem conteúdo (achado 1105).
 *
 * Os "+ Afirmação / + Opção / + Par / + Item" do card criam o item com
 * `content: []`, e todas as saídas mapeiam todo item: o vazio vira `( ) V ( ) F`
 * sem afirmação, caixa sem rótulo, par sem coluna B, `____` sem item. O defeito
 * a fechar aqui é o silêncio: o professor fica sabendo antes de o arquivo sair.
 * Só os tipos de resposta em LISTA entram (V/F, caixas, associação, ordenação);
 * alternativa e célula de tabela têm o próprio tratamento. Texto só de espaço
 * conta como vazio; fórmula sozinha não.
 */
function isEmptyRichText(rich: RichText): boolean {
  return rich.every((inline) => inline.type === "text" && inline.text.trim() === "");
}

function answerHasEmptyItem(answer: Extract<Block, { type: "question" }>["answer"]): boolean {
  switch (answer.kind) {
    case "trueFalse":
    case "checkbox":
    case "ordering":
      return answer.items.some((item) => isEmptyRichText(item.content));
    case "matching":
      return answer.pairs.some((pair) => isEmptyRichText(pair.left) || isEmptyRichText(pair.right));
    default:
      return false;
  }
}

/** A questão, ou qualquer questão aninhada no enunciado dela, tem item vazio? */
function questionHasEmptyItem(question: Extract<Block, { type: "question" }>): boolean {
  return everyBlock([question]).some(
    (block) => block.type === "question" && answerHasEmptyItem(block.answer),
  );
}

/** "1, B2 e 3": só chamada com dois rótulos ou mais. */
function joinLabels(labels: string[]): string {
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

/**
 * Rotula pela questão de topo, com o MESMO número que a folha imprime
 * (`customNumber` ou o ordinal entre as questões do documento).
 */
export function emptyItemWarnings(document: CanonicalDocument): string[] {
  let questionCount = 0;
  const labels: string[] = [];
  for (const block of document.blocks) {
    if (block.type !== "question") continue;
    questionCount += 1;
    if (questionHasEmptyItem(block)) labels.push(block.customNumber ?? String(questionCount));
  }
  if (labels.length === 0) return [];
  return labels.length === 1
    ? [`A questão ${labels[0]} tem um item vazio: ele sai como um marcador sem texto na folha.`]
    : [
        `As questões ${joinLabels(labels)} têm itens vazios: eles saem como marcadores sem ` +
          "texto na folha.",
      ];
}

/**
 * O que o PDF não carrega fiel.
 *
 * Mostrado ANTES do download, do mesmo jeito que o Word já fazia. Enquanto o
 * PDF não tipografa math (rasterizar KaTeX é o caminho previsto no TODO de
 * `mathToPdfText`), o professor precisa saber disso antes de imprimir.
 */
export function pdfExportWarnings(
  document: CanonicalDocument,
  pageStyle?: PageStyle,
  header?: HeaderSettings,
): string[] {
  const warnings: string[] = [...unreadMarkerWarnings(document), ...emptyItemWarnings(document)];

  // O `alt` é o campo de acessibilidade da imagem na folha, mas o
  // `@react-pdf/renderer` não gera PDF marcado (sem `/StructTreeRoot`, sem
  // `/Alt`), então nada dele chega ao arquivo. O defeito a fechar não é a
  // limitação da biblioteca, é o silêncio sobre ela — o Word já avisa da perda
  // equivalente em `docxExportWarnings`.
  if (everyBlock(document.blocks).some((block) => block.type === "image")) {
    warnings.push(
      "O texto alternativo das imagens não vai para o PDF: o arquivo não é marcado, " +
        "então um leitor de tela não anuncia a figura.",
    );
  }

  if (documentHasMath(document)) {
    warnings.push(...mathLossWarnings(document), MATH_TYPOGRAPHY_WARNING);
  }

  // A folha mostra o itálico porque o navegador sintetiza a inclinação; o PDF
  // não tem essa saída, então a ênfase sai reta e indistinguível do corpo.
  const family = pageStyle?.fontFamily;
  if (family && pdfFamilyLacksItalic(family)) {
    warnings.push(
      `A fonte ${fontFamilyToPdf(family)} não tem versão itálica: no PDF os trechos em ` +
        "itálico (inclusive as instruções das questões) saem retos.",
    );
  }

  // O caractere que a folha mostra tem que ser o caractere que o arquivo
  // imprime. Vale para TODA família: a fonte de símbolos entra em todas as
  // pilhas (C-01), então o que sobra aqui não depende da escolha do Formato.
  const unsupported = pdfUnsupportedCharacters(document, header);
  if (unsupported.length > 0) {
    warnings.push(
      `Nenhuma fonte do PDF tem estes caracteres: ${unsupported.join(" ")}. ` +
        "No arquivo eles saem em branco ou trocados por outro símbolo. Troque-os por texto.",
    );
  }

  return warnings;
}

/**
 * O que o "Copiar" não carrega fiel (0411, 0377).
 *
 * `documentToPlainText` emite o LaTeX cru SEMPRE, como o PDF e o Word (achado
 * 0803) — mas o botão da cópia
 * era o único do grupo que entregava essa perda
 * calado, com um toast de sucesso, enquanto os dois vizinhos abriam um diálogo.
 * Quem copia é justamente quem vai colar num e-mail ou no Docs e imprimir sem
 * revisar. A frase é a do LaTeX cru porque é isso que a cópia entrega, com ou
 * sem descrição no nó.
 *
 * A cópia é `text/plain`, então tudo o que a prévia desenha e o texto não
 * carrega entra na lista (0377), no mesmo critério do Word: a imagem vira a
 * marcação `[Imagem]`, a tabela vira linhas com `|` e a formatação de trecho
 * (negrito, itálico, cor, tamanho) some. Calar essas três certificava o resto
 * como fiel. O `alt` e a fonte continuam fora: o texto alternativo VAI na
 * marcação e não há tipografia num texto puro.
 */
export const COPY_IMAGE_WARNING =
  "As imagens não vão no texto copiado: cada uma vira uma marcação [Imagem] no lugar.";

export const COPY_TABLE_WARNING =
  "As tabelas saem como linhas de texto, com as células separadas por | e sem " +
  "destacar o cabeçalho.";

export const COPY_FORMATTING_WARNING =
  "A formatação do texto não vai: negrito, itálico, sublinhado, cor e tamanho " +
  "saem como texto comum.";

function hasInlineFormatting(rich: RichText): boolean {
  return rich.some(
    (inline) =>
      inline.type === "text" &&
      ((inline.marks?.length ?? 0) > 0 ||
        inline.color !== undefined ||
        inline.fontSize !== undefined),
  );
}

export function copyExportWarnings(document: CanonicalDocument): string[] {
  const blocks = everyBlock(document.blocks);
  const warnings = [...unreadMarkerWarnings(document), ...mathLossWarnings(document)];
  if (blocks.some((block) => block.type === "image")) {
    warnings.push(COPY_IMAGE_WARNING);
  }
  if (blocks.some((block) => block.type === "question" && block.answer.kind === "table")) {
    warnings.push(COPY_TABLE_WARNING);
  }
  if (blocks.flatMap(richTextsOf).some(hasInlineFormatting)) {
    warnings.push(COPY_FORMATTING_WARNING);
  }
  return warnings;
}
