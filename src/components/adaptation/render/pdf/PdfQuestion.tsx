/**
 * PdfQuestion — PDF analogue of QuestionView. Renders the optional
 * number/points/difficulty header, the recursive stem blocks (via the shared
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

type QuestionBlock = Extract<Block, { type: "question" }>;

const DIFFICULTY_LABEL: Record<NonNullable<QuestionBlock["difficulty"]>, string> = {
  facil: "Fácil",
  medio: "Médio",
  dificil: "Difícil",
};

function buildMeta(block: QuestionBlock): string {
  const parts: string[] = [];
  if (block.number !== undefined) parts.push(`${block.number}.`);
  if (block.points !== undefined) parts.push(`(${block.points} pts)`);
  if (block.difficulty !== undefined) parts.push(DIFFICULTY_LABEL[block.difficulty]);
  return parts.join("  ");
}

export function PdfQuestion({ block }: { block: QuestionBlock }) {
  const meta = buildMeta(block);
  return (
    <View style={{ marginBottom: 8, ...nodeStyleToPdf(block.style) }}>
      {meta !== "" && <Text style={{ color: "#555555", marginBottom: 4 }}>{meta}</Text>}

      {block.stem.map((child) => (
        <PdfBlock key={child.id} block={child} />
      ))}

      {block.instruction && (
        <Text style={{ fontStyle: "italic", color: "#555555", marginBottom: 4 }}>
          <PdfRichText content={block.instruction} />
        </Text>
      )}

      <PdfAnswer answer={block.answer} />
    </View>
  );
}

export default PdfQuestion;
