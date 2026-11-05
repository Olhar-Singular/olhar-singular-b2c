/**
 * PdfQuestion — PDF analogue of QuestionView. The question number is AUTOMATIC:
 * it is computed from the question's position among the document's question
 * blocks and passed in via `number` (the PDF block walker mirrors the screen
 * renderer's counter). If `block.customNumber` is set it takes precedence.
 * The number is rendered inline with the stem content so the PDF layout mirrors
 * the printed question format. Renders the recursive stem blocks (via the
 * shared PdfBlock dispatcher), an optional instruction, and the typed answer
 * via PdfAnswer. The authored answer `kind` and correct-answer flags are
 * authoritative — no heuristic re-derivation.
 *
 * ONDE O NÚMERO MORA (achado 0428): quando o conteúdo que abre a questão é
 * TEXTO, o número é um run do próprio <Text> desse texto — mesma caixa de
 * texto, logo mesma linha de base, sem depender de altura de linha nenhuma.
 * Como coluna irmã num `flex-direction: row` com `alignItems: "flex-start"` ele
 * só ficava alinhado por coincidência: bastava uma fórmula inline (Courier, bem
 * maior que o corpo) engordar a primeira linha do enunciado para o "1." subir
 * 4,38pt acima do texto que numera, em toda questão de uma prova de matemática.
 * A coluna irmã continua quando a questão abre com bloco NÃO textual (imagem,
 * fórmula em bloco, andaime) — é o caso que motivou o `flex-start`, porque a
 * linha de base de uma imagem é a borda de baixo dela e o número sairia ao pé
 * da figura (mesma razão declarada em QuestionView.tsx).
 */

import type { ReactNode } from "react";
import { View, Text } from "@react-pdf/renderer";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToPdf, pageBreakBefore } from "./nodeStyleToPdf";
import { shareColumnPt } from "./columnWidth";
import { PdfRichText } from "./PdfRichText";
import { PdfAnswer, tableLeadPresencePt } from "./PdfAnswer";
import { PdfBlock } from "./PdfBlock";
import { PdfParagraph } from "./PdfLeafBlocks";
import { KEEP_QUESTION_PT, keepTogether } from "./keepTogether";
import { questionNumbers } from "../questionNumbering";
import {
  BASE_FONT_PT,
  INK_MUTED,
  PAGE_HEIGHT_PT,
  PAGE_MARGIN_PT,
  pdfTextSize,
  questionNumberColumnPt,
} from "../pageTokens";
import { resolveElementFontSizes, resolvePageStyle, type ElementFontSizesPt } from "../pageStyle";

type QuestionBlock = Extract<Block, { type: "question" }>;

/**
 * Instruction/enunciado sizes come from `resolveElementFontSizes`, NOT from a
 * constant. They used to be a hardcoded 10.5pt, so raising the document font
 * size in the "Formato" popover grew the enunciado on the sheet and left the
 * printed instruction small — breaking the very accessibility adjustment the
 * control exists for. The default resolution reproduces the old 10.5pt at the
 * 12pt base, so untouched documents print identically.
 */
const DEFAULT_ELEMENT_SIZES = resolveElementFontSizes(resolvePageStyle());

/**
 * Vao INTERNO da questao, em pt (achado 0171). Os blocos do stem caiam no
 * `blockGap` padrao do `PdfBlock` (12pt), que e a junta entre blocos de TOPO do
 * documento: dois paragrafos do mesmo enunciado saiam com o dobro do respiro da
 * previa. 6pt = 8px, o mesmo que as duas telas usam entre irmaos do stem
 * (`space-y-2` no QuestionView, `p + p` do `.question-stem` na folha).
 * Vale tambem depois do enunciado e da instrucao (achado 0270): o papel usava
 * 4pt ali e as telas 8px, e a previa, que pagina sobre essa geometria, empurrava
 * blocos para folhas onde o arquivo nao os punha.
 */
const QUESTION_INNER_GAP_PT = 6;

/**
 * Presença à frente do marco do grupo abertura + APOIO (achado 0530): a área
 * útil da folha. O react-pdf a limita ao fim do último irmão do grupo (a
 * caixa), então ela pede "o grupo inteiro" sempre que o grupo cabe numa folha.
 * Grupo maior que a folha: pede só a folha, e no topo dela isso já está
 * cumprido, então não há descida para uma folha em branco. O `- 1` absorve o
 * arredondamento do token: o A4 do react-pdf tem 841,89pt, não 842, e a
 * presença de uma folha cheia ficava 0,11pt acima do que a folha oferece.
 */
const KEEP_WITH_SCAFFOLDING_PT = PAGE_HEIGHT_PT - 2 * PAGE_MARGIN_PT - 1;

/** As respostas que são uma lista de itens curtos, que não devem se separar entre folhas. */
const ITEM_ANSWERS = new Set(["multipleChoice", "trueFalse", "checkbox", "ordering", "matching"]);

export function PdfQuestion({
  block,
  number,
  blockGap = 12,
  elementSizes = DEFAULT_ELEMENT_SIZES,
  baseFontSize = BASE_FONT_PT,
}: {
  block: QuestionBlock;
  number: number;
  /**
   * Vão do DOCUMENTO abaixo da questão (achado 0130). Era 8pt à mão, então o
   * controle "espaçamento entre blocos" não abria nada no papel entre uma
   * questão e a seguinte — justo numa prova, onde quase todo bloco é questão.
   * Não confundir com `QUESTION_INNER_GAP_PT`, que é a junta entre os blocos
   * do stem, dentro da questão.
   */
  blockGap?: number;
  /** Corpo do documento (pt), de onde a coluna do número é derivada. */
  baseFontSize?: number;
}) {
  const stemNumbers = questionNumbers(block.stem);
  const position = block.enunciadoPosition ?? "below";
  const hasEnunciado = block.enunciado != null && block.enunciado.length > 0;
  const displayNumber = block.customNumber ?? number.toString();

  const enunciadoView = (prefix?: ReactNode) =>
    hasEnunciado ? (
      <View style={{ marginBottom: QUESTION_INNER_GAP_PT }}>
        <Text style={{ ...pdfTextSize(elementSizes.stem) }}>
          {prefix}
          <PdfRichText content={block.enunciado!} fontSize={elementSizes.stem} columnPt={stemColumn} />
        </Text>
      </View>
    ) : null;

  const leadingStem = block.stem[0];
  /**
   * O número só entra na linha do texto se a questão REALMENTE abre com texto:
   * o enunciado acima do stem, ou um parágrafo como primeiro bloco do stem (e
   * que não peça quebra de página antes, senão o rótulo iria para a página
   * anterior junto com a coluna).
   */
  const enunciadoLeads = position === "above" && hasEnunciado;
  const paragraphLeads =
    !enunciadoLeads && leadingStem?.type === "paragraph" && !pageBreakBefore(leadingStem.style);

  /**
   * A COLUNA do stem (achado 0175). O run do número entra na linha do texto
   * (0428) e o recuo pendurado devolve a coluna que as telas desenham com
   * `flex` + `shrink-0`: o bloco inteiro recua `paddingLeft`, e a PRIMEIRA
   * linha volta à margem com um `textIndent` negativo do mesmo tamanho: o
   * número imprime na margem e todo o resto do enunciado (linhas de
   * continuação e blocos seguintes) fica na coluna. O `textIndent` mora no run
   * do número, não no <Text> que o contém, porque o `@react-pdf` lê o recuo do
   * PRIMEIRO run do parágrafo e não herda essa propriedade.
   *
   * A coluna é medida no corpo de quem hospeda o rótulo: o enunciado tem
   * tamanho próprio (`elementSizes.stem`), o parágrafo do stem herda o corpo do
   * documento.
   */
  const numberColumn = questionNumberColumnPt(
    displayNumber,
    enunciadoLeads ? elementSizes.stem : baseFontSize,
  );

  // The stem sits in a column narrower than the sheet by the number's column: a formula wider
  // than that overflows the box (N-M-001).
  const stemColumn = shareColumnPt(undefined, { minus: numberColumn });

  /** O rótulo, como run de texto: entra na linha, não ao lado dela. */
  const numberRun = (
    <Text style={{ fontWeight: "bold", textIndent: -numberColumn }}>{`${displayNumber}. `}</Text>
  );

  const stemBlocks = block.stem.map((child, i) => (
    <PdfBlock
      key={child.id}
      block={child}
      number={stemNumbers[i]}
      blockGap={QUESTION_INNER_GAP_PT}
      elementSizes={elementSizes}
      baseFontSize={baseFontSize}
      columnPt={stemColumn}
    />
  ));

  const leadView = enunciadoLeads ? (
    enunciadoView(numberRun)
  ) : (
    <PdfParagraph block={leadingStem} blockGap={QUESTION_INNER_GAP_PT} numberPrefix={numberRun} baseFontSize={baseFontSize} columnPt={stemColumn} />
  );
  const afterLead = paragraphLeads ? 1 : 0;
  const nextAfterLead = block.stem[afterLead];

  /**
   * APOIO logo depois do texto de abertura (achado 0530). A caixa é
   * indivisível (0177) e o react-pdf quebra ANTES dela quando não cabe,
   * deixando número + enunciado sozinhos no pé da folha. No grupo abertura +
   * caixa, um marco de altura zero exige à frente a presença do grupo inteiro
   * (`KEEP_WITH_SCAFFOLDING_PT`) e, quando ela falta, o grupo desce junto. O
   * react-pdf só quebra antes de um nó com irmão anterior, daí o segundo
   * marco abrindo o grupo. Nada vira `wrap={false}`: abertura longa continua
   * fatiável e nada é cortado.
   *
   * A FIGURA logo depois da abertura (achado 1135) tem a mesma forma: o
   * <Image> do react-pdf é indivisível e "Observe a figura e responda:" ficava
   * sozinho no pé da folha. Mesmo grupo, mesmo marco.
   */
  const leadKeepsIndivisible =
    (nextAfterLead?.type === "scaffolding" || nextAfterLead?.type === "image") &&
    !pageBreakBefore(nextAfterLead.style);

  const leadGroup = leadKeepsIndivisible ? (
    <View>
      <View style={{ height: 0 }} />
      <View style={{ height: 0 }} minPresenceAhead={KEEP_WITH_SCAFFOLDING_PT} />
      {leadView}
      {stemBlocks[afterLead]}
    </View>
  ) : (
    leadView
  );

  const body =
    enunciadoLeads || paragraphLeads ? (
      <View style={{ paddingLeft: numberColumn }}>
        {leadGroup}
        {stemBlocks.slice(afterLead + (leadKeepsIndivisible ? 1 : 0))}
        {position === "below" && enunciadoView()}
      </View>
    ) : (
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Text style={{ fontWeight: "bold", marginRight: 6 }}>{displayNumber}.</Text>
        <View style={{ flex: 1 }}>
          {position === "above" && enunciadoView()}
          {stemBlocks}
          {position === "below" && enunciadoView()}
        </View>
      </View>
    );

  /** `gapBelow`: a junta até a resposta, que a questão-tabela tira daqui (0515). */
  const instructionView = (gapBelow: number) =>
    block.instruction && (
      <View style={{ marginBottom: gapBelow }}>
        <Text style={{ fontStyle: "italic", color: INK_MUTED, ...pdfTextSize(elementSizes.instruction) }}>
          <PdfRichText content={block.instruction} fontSize={elementSizes.instruction} columnPt={stemColumn} />
        </Text>
      </View>
    );

  const answerView = <PdfAnswer answer={block.answer} elementSizes={elementSizes} baseFontSize={baseFontSize} />;

  /**
   * Questão-tabela (achado 0515): o guard do 0193 mora DENTRO da resposta e,
   * ao empurrar a tabela para a folha seguinte, deixava número, enunciado e
   * instrução sozinhos no pé da folha. Aqui o grupo enunciado + instrução
   * exige, abaixo dele, o papel do cabeçalho + uma linha, e desce inteiro
   * quando ele falta.
   *
   * O grupo e a resposta saem como IRMÃOS no fluxo de quem contém a questão
   * (fragmento, não uma `View` única): o react-pdf só quebra antes de um nó
   * que tem irmão anterior, então dentro da `View` da questão o grupo, primeiro
   * filho, nunca desceria. Fora dela, no topo da folha, o próprio react-pdf
   * recusa a quebra (não gera folha em branco).
   *
   * A junta abaixo da instrução vira recuo de cima da resposta: o react-pdf
   * soma a margem de baixo de um nó à presença que ele exige, e a margem que
   * transbordava o pé da folha empurrava SÓ a instrução para a folha seguinte,
   * deixando o enunciado sozinho. A tabela longa continua fatiável linha a
   * linha (0702): nada aqui é `wrap={false}`.
   */
  if (block.answer.kind === "table") {
    const nodeStyle = nodeStyleToPdf(block.style);
    const gapAbove = block.instruction ? QUESTION_INNER_GAP_PT : 0;
    return (
      <>
        <View
          minPresenceAhead={tableLeadPresencePt(baseFontSize) + gapAbove}
          style={{ flexDirection: "column", ...nodeStyle, marginBottom: 0 }}
        >
          {body}
          {instructionView(0)}
        </View>
        <View style={{ flexDirection: "column", marginBottom: blockGap, ...nodeStyle, paddingTop: gapAbove }}>
          {answerView}
        </View>
      </>
    );
  }

  /**
   * Questão de alternativas curta viaja inteira (N-U-004): `a) b) c)` no pé da folha
   * com `d)` no topo da seguinte. Aberta, de linhas e de tabela fluem como antes.
   */
  const rootStyle = { flexDirection: "column", marginBottom: blockGap, ...nodeStyleToPdf(block.style) } as const;
  if (ITEM_ANSWERS.has(block.answer.kind)) {
    return (
      <View style={rootStyle}>
        {keepTogether(KEEP_QUESTION_PT)}
        {body}
        {instructionView(QUESTION_INNER_GAP_PT)}
        {answerView}
      </View>
    );
  }

  return (
    <View style={rootStyle}>
      {body}
      {instructionView(QUESTION_INNER_GAP_PT)}
      {answerView}
    </View>
  );
}

export default PdfQuestion;
