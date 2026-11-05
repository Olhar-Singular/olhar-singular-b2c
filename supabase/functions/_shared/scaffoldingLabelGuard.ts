// =============================================================================
// Strips the step label the model writes into support (scaffolding) items (C-20).
//
// The screen, the PDF, Word and Copiar all number the items of a scaffolding block
// ("1.", "2.", ...). The model, asked for step-by-step support, often writes the label
// itself: "Passo 1: Sublinhe os números". The sheet then prints "2. Passo 1: ..." (129 of
// 676 support items in the real batteries). The prompt now forbids it; this removes what
// still gets through, deterministically, without touching the rest of the item.
//
// NOT the regex of `questionNumberGuard` (C-14): that one strips a digit followed by `-` or
// `.` and eats the first operand of a sum. Here the label has to be a WORD (Passo/Etapa) + a
// number + a separator, or a bare "N." / "N)" glued to its separator and followed by a space.
// =============================================================================

import type { AdaptationResult } from "../../../src/lib/adaptation/canonical/schema.ts";

const WORD_LABEL = /^\s*(?:passo|etapa)\s+\d+\s*[:.\-–—)]\s+(?=\S)/iu;
// Digits glued to `.` or `)`, then a space: "1. Leia", "2) Some". Never "3,5", "10.000" or "2 . 3".
const NUMBER_LABEL = /^\s*\d+[.)]\s+(?=\S)/u;

// A lowercase Latin word of two letters or more, or one of the one-letter Portuguese words
// (a, o, e, à, é...), not followed by an operator or a script ("ab = 12", "cm²", "a + b").
const OPERATOR_AFTER = String.raw`(?![a-zà-öø-ÿ0-9²³^_]|\s*[=<>+\-−×·÷*/^_²³])`;
const PROSE_WORD = new RegExp(String.raw`^(?:[a-zà-öø-ÿ]{2,}|[aoeàáéóô])` + OPERATOR_AFTER, "u");
// Units, functions and abbreviations that open a line as math, never as a sentence ("cm² é a unidade").
const MATH_WORDS: ReadonlySet<string> = new Set([
  "mm", "cm", "dm", "dam", "hm", "km", "mg", "kg", "ml", "cl", "dl", "min", "seg", "rad", "pi",
  "sen", "cos", "tan", "tg", "cotg", "sec", "log", "ln", "exp", "lim", "mmc", "mdc",
]);

/**
 * "Passo 1: x + 3 = 10" must stay "x + 3 = 10": a variable, a Greek letter or a unit is part of
 * the math, so only a real word (two or more letters, not a unit or a function) is capitalised (F6-2).
 */
function capitalise(text: string): string {
  const word = PROSE_WORD.exec(text)?.[0];
  if (!word || MATH_WORDS.has(word)) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The item without its step label; unchanged when it has none (or when the label is all there is). */
export function stripScaffoldingLabel(item: string): string {
  const stripped = item.replace(WORD_LABEL, "").replace(NUMBER_LABEL, "");
  if (stripped === item) return item;
  // The label went; the sentence now opens the item, so it opens like one.
  return capitalise(stripped);
}

type BlockLike = { type?: string; items?: unknown[]; stem?: unknown };

function cleanItems(block: BlockLike): BlockLike {
  const items = block.items as unknown[];
  const cleaned = items.map((item) => (typeof item === "string" ? stripScaffoldingLabel(item) : item));
  return cleaned.some((item, i) => item !== items[i]) ? { ...block, items: cleaned } : block;
}

function cleanBlock(block: unknown): unknown {
  const b = block as BlockLike | null;
  if (!b || typeof b !== "object") return block;
  if (b.type === "scaffolding" && Array.isArray(b.items)) return cleanItems(b);
  if (b.type === "question" && Array.isArray(b.stem)) {
    const stem = b.stem.map(cleanBlock);
    return stem.some((s, i) => s !== (b.stem as unknown[])[i]) ? { ...b, stem } : b;
  }
  return block;
}

export function stripScaffoldingLabels(result: AdaptationResult): AdaptationResult {
  const blocks = result.document.blocks.map(cleanBlock);
  if (blocks.every((b, i) => b === result.document.blocks[i])) return result;
  return { ...result, document: { ...result.document, blocks: blocks as typeof result.document.blocks } };
}
