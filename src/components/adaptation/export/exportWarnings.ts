/**
 * O que cada formato de exportação NÃO carrega fiel.
 *
 * Mora fora de `exportDocx`/`exportPdf` porque a mesma varredura do documento
 * serve aos dois: a perda de fórmula é do Word E do PDF (com descrição, o
 * arquivo imprime a descrição por extenso; sem ela, o LaTeX cru, sempre em
 * monoespaçada). O defeito que isto fecha não é a limitação, é o silêncio: a
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
import { readableMathText } from "../render/mathAtom";

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
 * A perda da fórmula SEM descrição: o LaTeX cru no lugar da fórmula
 * tipografada. Vale para o PDF, o Word e o "Copiar" — este último sempre, já
 * que `documentToPlainText` projeta o LaTeX mesmo quando o nó tem `alt`.
 */
export const MATH_LOSS_WARNING =
  "As fórmulas saem como texto LaTeX, sem formatação matemática.";

/**
 * A perda da fórmula COM descrição (achado 0190).
 *
 * Desde o achado 0401 os dois ARQUIVOS imprimem o `alt` do nó quando ele
 * existe — e ele quase sempre existe, porque a IA preenche o campo. O diálogo,
 * porém, seguia prometendo LaTeX cru: quem lia baixava achando que receberia
 * `a^2 + b^2 = c^2` para corrigir à mão e recebia uma frase em português, que é
 * uma decisão pedagógica bem diferente e justamente a perda que o aviso existe
 * para declarar.
 */
export const MATH_ALT_LOSS_WARNING =
  "As fórmulas que têm descrição saem como essa descrição por extenso, em português, " +
  "no lugar da fórmula tipografada.";

/** Todo nó de fórmula do documento, inline ou de bloco, com o `alt` que carrega. */
function mathNodes(document: CanonicalDocument): { latex: string; alt?: string }[] {
  const blocks = everyBlock(document.blocks);
  const blockNodes = blocks
    .filter((block) => block.type === "blockMath")
    .map((block) => ({ latex: block.latex, alt: block.alt }));
  const inlineNodes = blocks
    .flatMap(richTextsOf)
    .flatMap((rich) => rich.filter((inline) => inline.type === "inlineMath"))
    .map((inline) => ({ latex: inline.latex, alt: inline.alt }));
  return [...blockNodes, ...inlineNodes];
}

/**
 * O que os ARQUIVOS perdem da fórmula, decidido pela MESMA função que decide a
 * projeção (`readableMathText`).
 *
 * Texto e projeção saem do mesmo ponto de propósito: foi a divergência entre os
 * dois que produziu o 0190, quando só a projeção mudou. Documento misto declara
 * as duas perdas, porque as duas acontecem no mesmo arquivo.
 */
export function mathLossWarnings(document: CanonicalDocument): string[] {
  const nodes = mathNodes(document);
  const warnings: string[] = [];
  if (nodes.some((node) => readableMathText(node) !== null)) {
    warnings.push(MATH_ALT_LOSS_WARNING);
  }
  if (nodes.some((node) => readableMathText(node) === null)) {
    warnings.push(MATH_LOSS_WARNING);
  }
  return warnings;
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
export const MATH_TYPOGRAPHY_WARNING =
  "A fórmula também não usa a fonte do documento: sai em monoespaçada e num " +
  "corpo próprio, mesmo que você tenha escolhido outra fonte no Formato.";

export function documentHasMath(document: CanonicalDocument): boolean {
  return mathNodes(document).length > 0;
}

/**
 * As fontes PADRÃO do PDF são as built-in Type 1, que só carregam a CP1252
 * (0444).
 *
 * Nenhuma delas é embutida no arquivo e nenhuma tem tabela Unicode: pedir um
 * caractere de fora da CP1252 não levanta erro, o byte que sobra na codificação
 * vira OUTRO caractere. O professor via a seta na folha, via a seta na prévia e
 * o aluno recebia aspas. Só as três fontes de acessibilidade (arquivos TTF
 * registrados em `render/pdf/registerFonts.ts`) escapam disso.
 */
const PDF_BUILTIN_FAMILIES = new Set(["Helvetica", "Times-Roman", "Courier"]);

/**
 * Os 27 caracteres que a CP1252 acomoda na faixa 0x80-0x9F, onde a Latin-1 tem
 * controles: aspas curvas, travessões, reticências, bullet, marca registrada.
 * Fora deles a tabela é ASCII imprimível mais a Latin-1 alta (acentos).
 */
const WINANSI_HIGH_CODES = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function isWinAnsi(character: string): boolean {
  // `charCodeAt` e não `codePointAt`: fora do BMP ele devolve o SUBSTITUTO
  // alto, que também não está na CP1252 (um emoji continua sendo reprovado) e
  // dispensa o ramo de fallback que nenhum caractere alcança.
  const code = character.charCodeAt(0);
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WINANSI_HIGH_CODES.has(code);
}

/**
 * Os caracteres do documento que a fonte built-in do PDF não representa, sem
 * repetição e na ordem em que aparecem.
 *
 * A varredura usa a MESMA projeção textual do botão "Copiar": ela já percorre
 * todo campo que vira texto no papel (enunciado, instrução, alternativa, par de
 * associação, célula, cabeçalho), então nenhum campo novo do schema pode
 * escapar daqui sem escapar de lá junto. As quebras de linha que a projeção
 * insere não são conteúdo e saem da conta.
 */
export function pdfUnsupportedCharacters(document: CanonicalDocument): string[] {
  const text = documentToPlainText(document).replace(/\s/g, "");
  return [...new Set([...text].filter((character) => !isWinAnsi(character)))];
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
): string[] {
  const warnings: string[] = [];

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
    warnings.push(...mathLossWarnings(document));
    warnings.push(MATH_TYPOGRAPHY_WARNING);
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
  // imprime. Enquanto o PDF não embute uma fonte com cobertura Unicode para
  // TODO documento, o mínimo é nomear, antes do download, o que vai sair
  // trocado (0444).
  if (!family || PDF_BUILTIN_FAMILIES.has(fontFamilyToPdf(family))) {
    const unsupported = pdfUnsupportedCharacters(document);
    if (unsupported.length > 0) {
      warnings.push(
        `A fonte padrão do PDF não tem estes caracteres: ${unsupported.join(" ")}. ` +
          "No arquivo eles saem trocados por outro símbolo. Troque-os por texto " +
          "(acentos e travessão funcionam) ou escolha uma fonte de acessibilidade no Formato.",
      );
    }
  }

  return warnings;
}

/**
 * O que o "Copiar" não carrega fiel (0411).
 *
 * `documentToPlainText` emite o LaTeX cru SEMPRE, inclusive para o nó que tem
 * descrição (ao contrário do PDF e do Word, achado 0190) — mas o botão da cópia
 * era o único do grupo que entregava essa perda
 * calado, com um toast de sucesso, enquanto os dois vizinhos abriam um diálogo.
 * Quem copia é justamente quem vai colar num e-mail ou no Docs e imprimir sem
 * revisar. A frase é a do LaTeX cru porque é isso que a cópia entrega, com ou
 * sem descrição no nó.
 *
 * A cópia é texto puro, então nada aqui fala de imagem ou de fonte: o `alt`
 * nunca foi prometido e não há tipografia a perder.
 */
export function copyExportWarnings(document: CanonicalDocument): string[] {
  if (!documentHasMath(document)) return [];
  return [MATH_LOSS_WARNING];
}
