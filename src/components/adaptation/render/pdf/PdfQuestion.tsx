/**
 * PdfQuestion — PDF analogue of QuestionView. The question number is AUTOMATIC:
 * it is computed from the question's position among the document's question
 * blocks and passed in via `number` (the PDF block walker mirrors the screen
 * renderer's counter). Renders the recursive stem blocks (via the shared
 * PdfBlock dispatcher), an optional instruction, and the typed answer via
 * PdfAnswer. The authored answer `kind` and correct-answer flags are
 * authoritative — no heuristic re-derivation.
 */

import { View, Text } from "@react-pdf/renderer";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToPdf } from "./nodeStyleToPdf";
import { PdfRichText } from "./PdfRichText";
import { PdfAnswer } from "./PdfAnswer";
import { PdfBlock } from "./PdfBlock";
import { questionNumbers } from "../questionNumbering";

type QuestionBlock = Extract<Block, { type: "question" }>;

export function PdfQuestion({ block, number }: { block: QuestionBlock; number: number }) {
  const stemNumbers = questionNumbers(block.stem);
  const position = block.enunciadoPosition ?? "below";
  const hasEnunciado = block.enunciado != null && block.enunciado.length > 0;

  const enunciadoView = hasEnunciado ? (
    <View style={{ marginBottom: 4 }}>
      <Text>
        <PdfRichText content={block.enunciado!} />
      </Text>
    </View>
  ) : null;

  return (
    <View style={{ flexDirection: "column", marginBottom: 8, ...nodeStyleToPdf(block.style) }}>
      <View style={{ marginBottom: 4 }}>
        <Text style={{ color: "#555555" }}>{number}.</Text>
      </View>

      {position === "above" && enunciadoView}

      {block.stem.map((child, i) => (
        <PdfBlock key={child.id} block={child} number={stemNumbers[i]} />
      ))}

      {position === "below" && enunciadoView}

      {block.instruction && (
        <View style={{ marginBottom: 4 }}>
          <Text style={{ fontStyle: "italic", color: "#555555" }}>
            <PdfRichText content={block.instruction} />
          </Text>
        </View>
      )}

      <PdfAnswer answer={block.answer} />
    </View>
  );
}

export default PdfQuestion;
