// =============================================================================
// Deterministic check of an AI extraction against the text it was given (C-03).
//
// The extraction prompt already says "never invent, deduce or complete". A rule
// alone did not hold: with the equations missing from a DOCX's text the model
// wrote plausible, DIFFERENT ones (x + y = 5 where the teacher had x + y = 10)
// and nothing downstream could tell. When the input is text, the result is
// checkable: a number or expression that appears nowhere in that text is a
// suspect. This module never blocks or charges anything; it lists the questions
// the teacher must look at.
//
// Pure, no I/O. Imports only the marker module under src/lib/domain (the one
// place the client and this function agree on the "[fórmula não lida]" text).
// =============================================================================

import { UNREAD_MARKER_PATTERN, findBareCommandLines } from "../../../src/lib/domain/unreadMarker.ts";
import { lostFractions, questionOfFraction } from "./fractionGuard.ts";
import type { ExtractionIssue } from "../../../src/lib/domain/examIssues.ts";

export type { ExtractionIssue, ExtractionIssueKind } from "../../../src/lib/domain/examIssues.ts";

interface CheckableQuestion {
  text?: string;
  options?: string[] | null;
}

/** Below this much letter/digit content the input is a scan: there is nothing to compare with. */
const MIN_CHECKABLE_CHARS = 8;
const PAGE_MARKER = /^\s*---\s*Página\s+\d+\s*---\s*$/gimu;

/** True when the input carries real text (a scanned PDF or a photo has none). */
export function hasCheckableInput(inputText: string): boolean {
  const content = inputText.replace(PAGE_MARKER, "");
  return (content.match(/[\p{L}\p{N}]/gu) ?? []).length >= MIN_CHECKABLE_CHARS;
}

// ── Normalisation ────────────────────────────────────────────────────────────

const SCRIPT_RUN = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ]+|[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]+/gu;

/** `\frac{a}{b}` -> `a/b`, `\sqrt{x}` -> `√x`, and the commands that are just a symbol. */
function delatex(s: string): string {
  if (!s.includes("\\")) return s;
  return s
    .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1/$2")
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√$1")
    .replace(/\\(?:cdot|times)\b/g, "*")
    .replace(/\\(?:geq?|ge)\b/g, "≥")
    .replace(/\\(?:leq?|le)\b/g, "≤")
    .replace(/\\neq?\b/g, "≠")
    .replace(/\\approx\b/g, "=")
    .replace(/\\(?:left|right|,|;|!|quad|text|mathrm)\b/g, "")
    .replace(/\\([a-zA-Z]+)/g, "$1");
}

/**
 * One spelling for the things a model rewrites freely: superscript and subscript
 * characters become `^(..)`/`_(..)` (the form our DOCX reader writes), vulgar fractions
 * and LaTeX fractions/roots become `a/b` and `√`, `>=`/`<=`/`!=` and `≈` become one
 * comparison sign each, Applied to BOTH sides before comparing.
 */
function normalize(raw: string): string {
  return delatex(
    raw
      .replace(SCRIPT_RUN, (run) => {
        const mark = /^[₀-₎]/u.test(run) ? "_" : "^";
        return `${mark}(${run.normalize("NFKC")})`;
      })
      .normalize("NFKC")
      .replace(/\u2044/g, "/"),
  )
    .replace(/>=/g, "≥")
    .replace(/<=/g, "≤")
    .replace(/!=/g, "≠")
    .replace(/≈/g, "=");
}

/** A leading question number or alternative letter, which the extraction strips or keeps freely. */
const LINE_LABEL = /^[ \t]*(?:(?:quest[aã]o|q)[ \t]*\d+[ \t]*[.):\-–]?|\(?\d+[ \t]*[.)]|\(?[a-eA-E][ \t]*[.)])[ \t]+/gimu;

function stripLabels(s: string): string {
  return s.replace(LINE_LABEL, "");
}

/**
 * The comparison form of a piece of text: letters, digits and the operators that carry
 * a value. Spaces, brackets, `$`, `\`, `^`, `_` and punctuation go, so `x 2 − 7 x`
 * (a PDF), `x² - 7x` (the model) and `x^2 − 7x` (our DOCX) are the same thing, while
 * `x+y=5` and `x+y=10` are not. A root is `#` (`√ 144`, `√144`, `sqrt(144)`). The fraction
 * bar is dropped too: a PDF puts numerator and denominator on two lines (`1` / `√ 3`).
 */
function skeleton(s: string): string {
  return s
    .toLowerCase()
    .replace(/sqrt|√/g, "#")
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/[^\p{L}\p{N}#+\-*=<>≤≥%]/gu, "");
}

/**
 * `3 x 4` and `3 × 4` are one product, and `2 x 2` from a PDF is `2x²`: between two digits an
 * `x` or `*` is dropped. Only ever used to compare (both sides), never to keep or show.
 */
const withoutProductSign = (skel: string): string => skel.replace(/(?<=\d)[x*](?=\d)/g, "");

/**
 * `1.000` -> 1000, `1.200,50` -> 1200.5, `0,5` -> 0.5: the value, not the spelling.
 * A token that is neither (`1.2.3,5`) is kept as written: never a `NaN` item.
 */
function numberValue(token: string): string {
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(token)) return String(Number(token.replace(/\./g, "").replace(",", ".")));
  if (/^\d+(?:[.,]\d+)?$/.test(token)) return String(Number(token.replace(",", ".")));
  return token;
}

const NUMBER = /\d+(?:[.,]\d+)*/g;

function numbersOf(s: string): string[] {
  return (s.match(NUMBER) ?? []).map(numberValue);
}

const OPERATORS = "=+\\-−–×÷*/<>≤≥";

/** Whitespace around operators and after a root sign goes, so `x² - 5x + 6 = 0` is one token. */
function tight(s: string): string {
  return s
    .replace(new RegExp(`[ \\t]*([${OPERATORS}^])[ \\t]*`, "gu"), "$1")
    .replace(/(√|sqrt)[ \t]+/gi, "$1");
}

const HAS_VALUE_SIGN = new RegExp(`[${OPERATORS}^√²³¹⁰⁴-⁹₀-₉]`, "u");

/** Tokens of the result that read as an expression: a digit plus an operator, a power or a root. */
function expressionsOf(s: string): string[] {
  return tight(s)
    .split(/\s+/)
    .map((t) => t.replace(/^["'“‘]+|["'”’.,;:?!]+$/gu, ""))
    .filter((t) => /[\d²³¹⁰⁴-⁹₀-₉]/u.test(t) && HAS_VALUE_SIGN.test(t));
}

// ── The check ────────────────────────────────────────────────────────────────

/**
 * What a piece of text may legitimately contain, given the text it came from: values
 * (numbers and expressions) that appear nowhere in `inputText` are suspects. A scan has no
 * text to compare with (`checkable` false): nothing is ever a suspect then.
 */
export function referenceOf(inputText: string): { checkable: boolean; suspectsIn: (candidate: string, options?: { expressions?: boolean }) => string[] } {
  const checkable = hasCheckableInput(inputText);
  const bareInput = normalize(stripLabels(inputText));
  const inputSkeleton = skeleton(bareInput);
  const inputProductless = withoutProductSign(inputSkeleton);
  const inputNumbers = new Set(numbersOf(bareInput));

  return {
    checkable,
    suspectsIn(candidate: string, options: { expressions?: boolean } = {}): string[] {
      if (!checkable) return [];
      const bare = normalize(stripLabels(candidate));
      const suspectExpressions = unique(expressionsOf(bare)).filter((e) => {
        const sk = skeleton(e);
        return !inputSkeleton.includes(sk) && !inputProductless.includes(withoutProductSign(sk));
      });
      const inExpressions = suspectExpressions.join(" ");
      const suspectNumbers = unique(numbersOf(bare)).filter(
        (n) => !inputNumbers.has(n) && !numbersOf(inExpressions).includes(n),
      );
      return options.expressions === false ? suspectNumbers : [...suspectExpressions, ...suspectNumbers];
    },
  };
}

/** Anything the model sent, as text. */
const text = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));

/** The first words of a question, enough to recognise it on the sheet. */
export const excerptOf = (s: string): string => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 50 ? `${flat.slice(0, 50)}…` : flat;
};

export const unique = <T>(items: T[]): T[] => [...new Set(items)];

export function markersOf(s: string): string[] {
  return s.match(new RegExp(UNREAD_MARKER_PATTERN.source, "giu")) ?? [];
}

/**
 * Compares the extraction with the text it was extracted from. Returns, per question,
 * what the teacher should double-check; an empty list means nothing suspicious (or an
 * input that is a scan, where only the images could say).
 */
export function checkExtraction(inputText: string, questions: CheckableQuestion[]): ExtractionIssue[] {
  const input = text(inputText);
  const issues: ExtractionIssue[] = [];
  // The model may hand back a number where a string was asked (`options: [10, 20]`): read it
  // as text instead of throwing, because this runs after the extraction was charged.
  const texts = (Array.isArray(questions) ? questions : []).map((q) => [
    text(q?.text),
    ...(Array.isArray(q?.options) ? q.options.map(text) : []),
  ]);

  // A marker the input had and the result no longer has: the model completed it.
  const lost = markersOf(input).length - texts.flat().reduce((n, t) => n + markersOf(t).length, 0);

  const reference = referenceOf(input);

  texts.forEach((parts, index) => {
    const question = index + 1;
    const joined = parts.join("\n");
    const found: ExtractionIssue[] = [];

    const markers = unique(markersOf(joined));
    if (markers.length) found.push({ question, kind: "unread", items: markers });

    const gaps = parts.flatMap(findBareCommandLines);
    if (gaps.length) found.push({ question, kind: "gap", items: unique(gaps) });

    const suspects = reference.suspectsIn(joined);
    if (suspects.length) found.push({ question, kind: "invented", items: suspects });
    issues.push(...found.map((f) => ({ ...f, of: texts.length, excerpt: excerptOf(parts[0]) })));
  });

  if (lost > 0) issues.push({ question: null, kind: "lost_marker", items: [] });

  // A grouped fraction of the input (`(2 x + 1)/3`) that no fraction of the result matches (N-I-001).
  const joinedTexts = texts.map((parts) => parts.join("\n"));
  for (const fraction of lostFractions(input, joinedTexts.join("\n"))) {
    const at = questionOfFraction(fraction, joinedTexts);
    issues.push({
      question: at < 0 ? null : at + 1,
      kind: "fraction",
      items: [fraction.fraction],
      ...(at < 0 ? {} : { of: texts.length, excerpt: excerptOf(texts[at][0]) }),
    });
  }
  return issues;
}
