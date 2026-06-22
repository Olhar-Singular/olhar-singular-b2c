/**
 * Menu model for the "+" block inserter (plano §6.4, Fase 5a).
 *
 * Two sections, covering everything the old `CanonicalToolbar` covered plus the
 * "Texto e mídia" set from §6.4:
 *  - Questão: the 8 answer kinds (a new question opens its card on insert).
 *  - Texto e mídia: Título H1, Seção H2, Parágrafo, Imagem, Fórmula, Banco de
 *    palavras (→ scaffolding node), Divisória, Quebra de página.
 *
 * Each item carries a pure `InserterAction`, reusing the round-trip-safe builders
 * from `commands.ts`. "Quebra de página" is `needsFollowing` — it only makes
 * sense when a block follows the gap, so the menu hides it at the trailing gap.
 */

import {
  HelpCircle,
  Heading1,
  Heading2,
  Pilcrow,
  ImageIcon,
  Sigma,
  Minus,
  SeparatorHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  buildQuestionNode,
  buildImageNode,
  buildMathNode,
  buildDivider,
  buildHeadingNode,
  buildParagraphNode,
} from "../commands";
import { QUESTION_KINDS } from "../questionKinds";
import type { InserterAction } from "./insertAtPos";

export interface InserterItem {
  /** Stable key / test handle. */
  id: string;
  label: string;
  icon: LucideIcon;
  action: InserterAction;
  /** Hidden at the trailing gap (no block follows it). */
  needsFollowing?: boolean;
}

export interface InserterSection {
  id: string;
  label: string;
  items: InserterItem[];
}

const questionItems: InserterItem[] = QUESTION_KINDS.map(({ kind, label }) => ({
  id: `question:${kind}`,
  label,
  icon: HelpCircle,
  action: { type: "insert", build: () => buildQuestionNode(kind) },
}));

const textMediaItems: InserterItem[] = [
  { id: "heading1", label: "Título", icon: Heading1, action: { type: "insert", build: () => buildHeadingNode(1) } },
  { id: "heading2", label: "Seção", icon: Heading2, action: { type: "insert", build: () => buildHeadingNode(2) } },
  { id: "paragraph", label: "Parágrafo", icon: Pilcrow, action: { type: "insert", build: () => buildParagraphNode() } },
  { id: "image", label: "Imagem", icon: ImageIcon, action: { type: "insert", build: () => buildImageNode("") } },
  { id: "math", label: "Fórmula", icon: Sigma, action: { type: "insert", build: () => buildMathNode(undefined) } },
  { id: "divider", label: "Divisória", icon: Minus, action: { type: "insert", build: () => buildDivider() } },
  { id: "pageBreak", label: "Quebra de página", icon: SeparatorHorizontal, action: { type: "pageBreak" }, needsFollowing: true },
];

export const INSERTER_SECTIONS: InserterSection[] = [
  { id: "question", label: "Questão", items: questionItems },
  { id: "text-media", label: "Texto e mídia", items: textMediaItems },
];
