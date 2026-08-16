/**
 * PdfQuestion — PDF analogue of QuestionView. The question number is AUTOMATIC:
 * it is computed from the question's position among the document's question
 * blocks and passed in via `number` (the PDF block walker mirrors the screen
 * renderer's counter). If `block.customNumber` is set it takes precedence.
 * The number is rendered inline (flex row) with the stem content so the PDF
 * layout mirrors the printed question format. Renders the recursive stem blocks
 * (via the shared PdfBlock dispatcher), an optional instruction, and the typed
 * answer via PdfAnswer. The authored answer `kind` and correct-answer flags are
 * authoritative — no heuristic re-derivation.
 */

import { View, Text } from "@react-pdf/renderer";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToPdf } from "./nodeStyleToPdf";
import { PdfRichText } from "./PdfRichText";
import { PdfAnswer } from "./PdfAnswer";
import { PdfBlock } from "./PdfBlock";
import { questionNumbers } from "../questionNumbering";
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

  const enunciadoView = hasEnunciado ? (
    <View style={{ marginBottom: 4 }}>
      <Text style={{ fontSize: elementSizes.stem }}>
        <PdfRichText content={block.enunciado!} />
      </Text>
    </View>
  ) : null;

  return (
    <View style={{ flexDirection: "column", marginBottom: 8, ...nodeStyleToPdf(block.style) }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Text style={{ fontWeight: "bold", marginRight: 6 }}>{displayNumber}.</Text>
        <View style={{ flex: 1 }}>
          {position === "above" && enunciadoView}
          {block.stem.map((child, i) => (
            <PdfBlock key={child.id} block={child} number={stemNumbers[i]} elementSizes={elementSizes} />
          ))}
          {position === "below" && enunciadoView}
        </View>
      </View>

      {block.instruction && (
        <View style={{ marginBottom: 4 }}>
          <Text style={{ fontStyle: "italic", color: "#555555", fontSize: elementSizes.instruction }}>
            <PdfRichText content={block.instruction} />
          </Text>
        </View>
      )}

      <PdfAnswer answer={block.answer} elementSizes={elementSizes} />
    </View>
  );
}

export default PdfQuestion;
