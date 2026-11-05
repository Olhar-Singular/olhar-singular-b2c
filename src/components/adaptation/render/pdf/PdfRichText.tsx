/**
 * PdfRichText — PDF analogue of RichTextView. Projects a canonical `RichText`
 * array to react-pdf <Text> runs: text runs apply mark styles (bold/italic/
 * underline/strike) and an allowlisted color; inlineMath runs render as their
 * LaTeX source in a monospace style (v1 — see mathToPdfText) ou, quando o nó
 * traz `alt`, como texto do próprio parágrafo (achado 0191).
 */

import { Fragment, type ReactNode } from "react";
import { Text } from "@react-pdf/renderer";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { mathPdfSegments, mathPdfInlineStyle } from "./mathToPdfText";
import type { MathSegment } from "../mathAtom";
import { MATH_NBSP } from "../mathAtom";
import { NO_HYPHEN_MARK, UNBREAKABLE_WORD_THRESHOLD } from "./registerFonts";
import { marksToPdfStyle } from "./richTextPdf";
import { BASE_FONT_PT, BASE_LINE_HEIGHT } from "../pageTokens";

/**
 * Ponto de quebra entre dois pedaços de uma fórmula (N-M-001, N-U-001): um espaço de corpo
 * ínfimo. O quebrador de linha o trata como cola (quebra ali, sem hífen e sem perder caractere)
 * e, como a cola é minúscula, ela não encolhe: a linha mede exatamente o que o olho vê. Onde o
 * LaTeX tinha espaço, o vão vem de um NBSP antes dela; onde não tinha, não há vão nenhum.
 */
const SOFT_JOINT_STYLE = { fontSize: 0.1, lineHeight: BASE_LINE_HEIGHT } as const;

/**
 * O vizinho encosta na fórmula, sem espaço (N-U-008): é texto cujo caractere junto à fórmula não é
 * um espaço simples, ou é outra fórmula. Cada run é uma palavra à parte para o textkit, e ele põe
 * um ponto de hifenização entre duas palavras coladas: a linha que quebra ali imprime "-"
 * (`a(x+y)-`). Com uma junta macia na emenda a palavra anterior passa a ser seguida de espaço.
 */
function touches(neighbour: RichText[number] | undefined, side: "start" | "end"): boolean {
  if (!neighbour) return false;
  if (neighbour.type === "inlineMath") return side === "start";
  return neighbour.text[side === "end" ? neighbour.text.length - 1 : 0] !== " ";
}

const joint = <Text style={SOFT_JOINT_STYLE}> </Text>;

/**
 * Caracteres que não desenham nada e que o textkit descarta ou não acha na fonte: hífen
 * condicional, espaço/junção de largura zero, junção de palavra e marca de ordem de bytes.
 */
const INVISIBLE = /[\u00ad\u200b-\u200d\u2060\ufeff]/g;

/**
 * O conteúdo inteiro não imprime nada: só fórmula vazia, texto vazio ou caracteres invisíveis
 * (N-M-003). Conteúdo sem nenhum run (`[]`) fica de fora: nem ele chega ao textkit.
 */
function printsNothing(content: RichText): boolean {
  return (
    content.length > 0 &&
    content.every((run) =>
      run.type === "inlineMath"
        ? run.latex.trim() === ""
        : run.text.replace(INVISIBLE, "") === "",
    )
  );
}

/**
 * Põe a marca de "não hifenize" DEPOIS do primeiro caractere do pedaço, não antes (N-U-006).
 *
 * O U+00AD não tem glifo em fonte nenhuma: o textkit lhe dá a fonte do caractere ANTERIOR. No
 * começo do pedaço isso é o texto que antecede a fórmula (outra família), então a marca caía no
 * run do TEXTO, o pedaço chegava ao `hyphenateWord` sem ela e, com mais de 30 caracteres e sem
 * espaço (`3\frac{1}{2}-1\frac{3}{4}=1\frac{3}{4}`), era picado com hífen no meio. Depois do
 * primeiro caractere a marca herda a fonte da fórmula e viaja na mesma palavra. Texto vazio
 * não leva marca: uma marca sozinha é um run sem glifo (N-M-003).
 */
function markNoHyphen(text: string): string {
  if (text === "") return "";
  const first = String.fromCodePoint(text.codePointAt(0) as number);
  return first + NO_HYPHEN_MARK + text.slice(first.length);
}

/**
 * Os pedaços de uma fórmula (`mathPdfSegments`), unidos onde o LaTeX tinha espaço ou num ponto
 * seguro: a quebra de linha cai numa junta, sem hífen e sem perder caractere (N-M-001).
 */
function formulaPieces(segments: MathSegment[]): ReactNode[] {
  return segments.map((segment, k, all) => (
    <Fragment key={k}>
      {segment.joint !== "none" && <Text style={SOFT_JOINT_STYLE}> </Text>}
      {/* O vão do LaTeX vai NO FIM do pedaço anterior, na mesma string: um NBSP em
              string própria vira sílaba solta no textkit, e a sílaba que o antecede
              ganha um ponto de hifenização, com "-" impresso no fim da linha (N-U-006). */}
      {markNoHyphen(segment.text) +
        (all[k + 1]?.joint === "space" ? MATH_NBSP : "")}
    </Fragment>
  ));
}

/**
 * Texto corrido que pode trazer LaTeX CRU (o apoio): a palavra comprida e sem espaço
 * (`x+x+x+…`) é partida em pontos seguros, como a fórmula, e não picada de 8 em 8 com hífen
 * (o `hyphenateWord` só poupa o que leva a marca). O resto do texto passa como está.
 */
export function PdfPlainText({
  text,
  fontSize = BASE_FONT_PT,
  columnPt,
}: {
  text: string;
  fontSize?: number;
  columnPt?: number;
}) {
  return (
    <>
      {text
        .split(/(\s+)/)
        .map((token, i) =>
          token.length > UNBREAKABLE_WORD_THRESHOLD && !/\s/.test(token) ? (
            <Fragment key={i}>
              {formulaPieces(mathPdfSegments(token, fontSize, columnPt))}
            </Fragment>
          ) : (
            token
          ),
        )}
    </>
  );
}

export function PdfRichText({
  content,
  fontSize = BASE_FONT_PT,
  columnPt,
}: {
  content: RichText;
  /**
   * Corpo (pt) do <Text> que HOSPEDA estes runs: enunciado, instrução, legenda
   * ou o corpo do documento. A fórmula é dimensionada a partir dele, como na
   * tela, onde o `em` do KaTeX mede o mesmo pai — sem isso ela saía carimbada
   * no tamanho de 12 pt em qualquer documento (achado 0402).
   */
  fontSize?: number;
  /**
   * Largura REAL da coluna que hospeda estes runs, em pt (`columnWidth.ts`). A fórmula que não cabe
   * nela é partida em pedaços que cabem (N-M-001). Ausente = a coluna da folha.
   */
  columnPt?: number;
}) {
  // Um <Text> cujos runs não têm glifo nenhum deixa o textkit sem fonte para o parágrafo
  // (`unitsPerEm` de null, nenhum PDF). Um espaço, que toda fonte tem, mantém o campo vivo
  // e vazio na folha.
  if (printsNothing(content)) return <> </>;
  return (
    <>
      {content.map((run, i) => {
        if (run.type === "inlineMath") {
          return (
            <Text key={i} style={mathPdfInlineStyle(fontSize)}>
              {touches(content[i - 1], "end") && joint}
              {formulaPieces(mathPdfSegments(run.latex, fontSize, columnPt))}
              {touches(content[i + 1], "start") && joint}
            </Text>
          );
        }
        return (
          <Text
            key={i}
            style={marksToPdfStyle(run.marks, run.color, run.fontSize)}
          >
            {run.text}
          </Text>
        );
      })}
    </>
  );
}

export default PdfRichText;
