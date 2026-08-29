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

import { View, Text } from "@react-pdf/renderer";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToPdf, pageBreakBefore } from "./nodeStyleToPdf";
import { PdfRichText } from "./PdfRichText";
import { PdfAnswer } from "./PdfAnswer";
import { PdfBlock } from "./PdfBlock";
import { PdfParagraph } from "./PdfLeafBlocks";
import { questionNumbers } from "../questionNumbering";
import { pdfTextSize } from "../pageTokens";
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

export function PdfQuestion({
  block,
  number,
  elementSizes = DEFAULT_ELEMENT_SIZES,
}: {
  block: QuestionBlock;
  number: number;
  elementSizes?: ElementFontSizesPt;
}) {
  const stemNumbers = questionNumbers(block.stem);
  const position = block.enunciadoPosition ?? "below";
  const hasEnunciado = block.enunciado != null && block.enunciado.length > 0;
  const displayNumber = block.customNumber ?? number.toString();

  /** O rótulo, como run de texto: entra na linha, não ao lado dela. */
  const numberRun = <Text style={{ fontWeight: "bold" }}>{`${displayNumber}. `}</Text>;

  const enunciadoView = (prefix?: typeof numberRun) =>
    hasEnunciado ? (
      <View style={{ marginBottom: 4 }}>
        <Text style={{ ...pdfTextSize(elementSizes.stem) }}>
          {prefix}
          <PdfRichText content={block.enunciado!} />
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

  const stemBlocks = block.stem.map((child, i) => (
    <PdfBlock key={child.id} block={child} number={stemNumbers[i]} elementSizes={elementSizes} />
  ));

  const body =
    enunciadoLeads || paragraphLeads ? (
      <View>
        {enunciadoLeads ? enunciadoView(numberRun) : null}
        {paragraphLeads ? <PdfParagraph block={leadingStem} numberPrefix={numberRun} /> : null}
        {paragraphLeads ? stemBlocks.slice(1) : stemBlocks}
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

  return (
    <View style={{ flexDirection: "column", marginBottom: 8, ...nodeStyleToPdf(block.style) }}>
      {body}

      {block.instruction && (
        <View style={{ marginBottom: 4 }}>
          <Text style={{ fontStyle: "italic", color: "#555555", ...pdfTextSize(elementSizes.instruction) }}>
            <PdfRichText content={block.instruction} />
          </Text>
        </View>
      )}

      <PdfAnswer answer={block.answer} elementSizes={elementSizes} />
    </View>
  );
}

export default PdfQuestion;
