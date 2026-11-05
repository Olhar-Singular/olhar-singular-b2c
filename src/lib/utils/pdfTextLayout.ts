/**
 * Page text from the positioned runs pdf.js hands back (N-I-001).
 *
 * pdf.js gives runs with a position, and `hasEOL` is the only structure the old code kept.
 * A stacked fraction (Word and LibreOffice equations) is two short lines, numerator over
 * denominator, with NO bar in the text layer: `f(x) = (2x + 1)/3` arrived as
 * "f(x)= 2 x + 1\n3 , calcule f(4)." and the extraction wrote `2x + 1/3`, a different
 * function (f(4) = 8,33 instead of 3) with no signal anywhere.
 *
 * The grouping is geometry, so it is recovered here from the positions: a full-size line
 * directly above another, centred over it, with the line they interrupt on both sides (or
 * a lone centred pair WITH a drawn bar between them) is one fraction, written
 * `(numerator)/(denominator)`. Anything that does not match every condition keeps the old
 * text, so ordinary pages are unchanged.
 *
 * A lone pair has no neighbour to confirm it, so geometry alone is not enough: a centred
 * two-line header, two indented alternatives and an armed sum (347 over 256) all look the
 * same. The bar the equation editor draws is the signal (see `pdfFractionBars.ts`); without
 * it the lines stay as they came. KNOWN LIMIT: a truly isolated fraction whose bar cannot
 * be read from the operator list (a picture, a font glyph) is emitted as two plain lines,
 * "a" then "b", never as a guessed "a/b".
 *
 * Pure: no pdf.js import, so it is tested with the real runs of real PDFs.
 */

import { UNREAD_FORMULA } from "../domain/unreadMarker.ts";
import type { FractionBar } from "./pdfFractionBars";

export interface PdfTextItem {
  str: string;
  /** Left edge and baseline, in PDF points (the `transform[4]`/`transform[5]` of the run). */
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL?: boolean;
}

interface Segment {
  items: PdfTextItem[];
  /** Baseline of the first full-size run. */
  y: number;
  x0: number;
  x1: number;
  /** The tallest run on the row: what a script on this row is small relative to. */
  height: number;
}

const isBlank = (item: PdfTextItem): boolean => item.str.trim() === "";

/** The most common run height on the page (a script or a radical sign is not "the body"). */
function bodyHeight(items: PdfTextItem[]): number {
  const counts = new Map<number, number>();
  for (const item of items) {
    if (isBlank(item) || item.height <= 0) continue;
    const key = Math.round(item.height);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 12;
  let bestCount = 0;
  for (const [height, count] of counts) {
    if (count > bestCount) {
      best = height;
      bestCount = count;
    }
  }
  return best;
}

/** Same-row runs (and their scripts) in content order. */
function toSegments(items: PdfTextItem[], body: number): Segment[] {
  const segments: Segment[] = [];
  let pendingBlank: PdfTextItem[] = [];
  const open = (item: PdfTextItem): Segment => {
    const segment: Segment = { items: [...pendingBlank], y: item.y, x0: item.x, x1: item.x + item.width, height: 0 };
    pendingBlank = [];
    segments.push(segment);
    return segment;
  };
  for (const item of items) {
    const current = segments[segments.length - 1];
    if (isBlank(item)) {
      // A blank run (the empty line-end marker, a spacer) goes with whichever row it sits on.
      if (current && Math.abs(item.y - current.y) <= 0.2 * body) current.items.push(item);
      else pendingBlank.push(item);
      continue;
    }
    // A script is small relative to the row it sits on, and close to that row's baseline.
    // Judging it against the page's most common height glued a 12 pt line to the 16.9 pt
    // math line above it on formula-dominated pages (L9A-2).
    const reference = current && current.height > 0 ? current.height : body;
    const script = item.height < 0.8 * reference;
    const sameRow = current && Math.abs(item.y - current.y) <= (script ? 0.6 * reference : 0.2 * body);
    const segment = sameRow ? current : open(item);
    segment.items.push(item);
    segment.height = Math.max(segment.height, item.height);
    segment.x0 = Math.min(segment.x0, item.x);
    segment.x1 = Math.max(segment.x1, item.x + item.width);
  }
  // Blank runs after the last text belong to the last row.
  if (pendingBlank.length && segments.length) segments[segments.length - 1].items.push(...pendingBlank);
  return segments;
}

const compact = (segment: Segment): string =>
  segment.items
    .map((item) => item.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A row of a table or a tabbed line is not a numerator: it is wide and has a column gap
 * between its words. A fraction part is short and its runs are tight.
 */
function isCompact(segment: Segment, body: number): boolean {
  if (segment.x1 - segment.x0 > 12 * body) return false;
  const texts = segment.items.filter((item) => !isBlank(item));
  return texts.every((item, k) => k === 0 || item.x - (texts[k - 1].x + texts[k - 1].width) <= 2.5 * body);
}

/** True when `numerator` sits directly above `denominator`, centred over it. */
function isStackedPair(n: Segment, d: Segment, body: number): boolean {
  if (!isCompact(n, body) || !isCompact(d, body)) return false;
  const gap = n.y - d.y;
  if (gap < 0.8 * body || gap > 1.9 * body) return false;
  const overlap = Math.min(n.x1, d.x1) - Math.max(n.x0, d.x0);
  const narrower = Math.min(n.x1 - n.x0, d.x1 - d.x0);
  if (narrower <= 0 || overlap < 0.6 * narrower) return false;
  const centreGap = Math.abs((n.x0 + n.x1) / 2 - (d.x0 + d.x1) / 2);
  return centreGap <= Math.max(2, 0.25 * Math.max(n.x1 - n.x0, d.x1 - d.x0));
}

/** Is `side` on the line the fraction interrupts, touching it on the given side? */
function touchesMiddle(side: Segment | undefined, n: Segment, d: Segment, body: number, where: "left" | "right"): boolean {
  if (!side) return false;
  const middle = (n.y + d.y) / 2;
  if (Math.abs(side.y - middle) > 0.35 * (n.y - d.y)) return false;
  const left = Math.min(n.x0, d.x0);
  const right = Math.max(n.x1, d.x1);
  return where === "left"
    ? side.x1 <= left + 1 && left - side.x1 <= 3 * body
    : side.x0 >= right - 1 && side.x0 - right <= 3 * body;
}

/**
 * A thin rule between the two lines, covering both and no wider than they are (not a table border).
 * It sits at least 0,2 em below the numerator's baseline: an underline hugs the text it underlines
 * (0,1 em) and does not make the number under it a denominator (L9BC-3).
 */
function hasBarBetween(n: Segment, d: Segment, bars: FractionBar[], body: number): boolean {
  const left = Math.min(n.x0, d.x0);
  const right = Math.max(n.x1, d.x1);
  return bars.some(
    (bar) =>
      bar.y < n.y - 0.2 * body &&
      bar.y > d.y &&
      bar.x0 <= left + 0.5 * body &&
      bar.x1 >= right - 0.5 * body &&
      bar.x1 - bar.x0 <= right - left + 2 * body,
  );
}

/** A word or an alternative label is prose, not a numerator or a denominator. */
const isProse = (segment: Segment): boolean => /\p{L}{4,}|^\(?[A-Za-z]\)/u.test(compact(segment));

const COMPOUND = /[\s+\-−–±×·÷*/^√=<>≤≥]/u;

const group = (text: string): string => (COMPOUND.test(text) ? `(${text})` : text);

/** The page text, with stacked fractions written `(numerator)/(denominator)`. */
/** Said where a stack the geometry cannot resolve was (the extraction prompt keeps it, never guesses). */
export const UNREAD_STACK = UNREAD_FORMULA;

export function pageTextFromItems(items: PdfTextItem[], bars: FractionBar[] = []): string {
  const body = bodyHeight(items);
  const segments = toSegments(items, body);
  const leftMargin = Math.min(...segments.map((s) => s.x0), Infinity);

  let out = "";
  for (let i = 0; i < segments.length; i += 1) {
    const n = segments[i];
    const d = segments[i + 1];
    if (d && isStackedPair(n, d, body)) {
      // Three or more lines stacked (a fraction inside a fraction, a limit, a matrix column):
      // where the bars are is not in the text layer. Say so instead of guessing a grouping.
      let last = i + 1;
      while (segments[last + 1] && isStackedPair(segments[last], segments[last + 1], body)) last += 1;
      const bottom = segments[last];
      if (
        last > i + 1 &&
        (touchesMiddle(segments[i - 1], n, bottom, body, "left") ||
          touchesMiddle(segments[last + 1], n, bottom, body, "right"))
      ) {
        out += `${UNREAD_STACK} `;
        i = last;
        continue;
      }
      const before = segments[i - 1];
      const after = segments[i + 2];
      const leftNeighbour = touchesMiddle(before, n, d, body, "left");
      const rightNeighbour = touchesMiddle(after, n, d, body, "right");
      const alone = Math.min(n.x0, d.x0) > leftMargin + 3 * body &&
        Math.abs((n.x0 + n.x1) / 2 - (d.x0 + d.x1) / 2) <= 1 &&
        compact(n).length <= 20 && compact(d).length <= 20 &&
        !isProse(n) && !isProse(d) && hasBarBetween(n, d, bars, body);
      // A neighbour on the line the fraction interrupts is not enough (a table cell of two lines next to a
      // one-line cell looks the same): the rule between the lines is what says it is a fraction (L9BC-4).
      if (hasBarBetween(n, d, bars, body) && (leftNeighbour || rightNeighbour || alone)) {
        if (!leftNeighbour && out && !out.endsWith("\n")) out += "\n";
        out += `${group(compact(n))}/${group(compact(d))}`;
        out += rightNeighbour ? " " : "\n";
        i += 1;
        continue;
      }
    }
    for (const item of n.items) out += item.str + (item.hasEOL ? "\n" : " ");
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
