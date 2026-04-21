import type { InlineRun } from "@/types/adaptation";

type Span = { start: number; end: number; text: string; bold: boolean; italic: boolean };

export function parseMarkdownInline(text: string): InlineRun[] | undefined {
  if (!text.includes("*")) return undefined;

  const spans: Span[] = [];
  let m: RegExpExecArray | null;

  const RE_BOLD = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*/g;
  while ((m = RE_BOLD.exec(text)) !== null) {
    if (m[1] !== undefined) {
      spans.push({ start: m.index, end: RE_BOLD.lastIndex, text: m[1], bold: true, italic: true });
    } else {
      spans.push({ start: m.index, end: RE_BOLD.lastIndex, text: m[2], bold: true, italic: false });
    }
  }

  let masked = text;
  for (const span of [...spans].reverse()) {
    masked =
      masked.slice(0, span.start) +
      " ".repeat(span.end - span.start) +
      masked.slice(span.end);
  }

  const RE_ITALIC = /\*([^*]+?)\*/g;
  while ((m = RE_ITALIC.exec(masked)) !== null) {
    spans.push({ start: m.index, end: RE_ITALIC.lastIndex, text: m[1], bold: false, italic: true });
  }

  if (spans.length === 0) return undefined;

  spans.sort((a, b) => a.start - b.start);

  const runs: InlineRun[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start > cursor) {
      runs.push({ text: text.slice(cursor, span.start) });
    }
    const run: InlineRun = { text: span.text };
    if (span.bold) run.bold = true;
    if (span.italic) run.italic = true;
    runs.push(run);
    cursor = span.end;
  }

  if (cursor < text.length) {
    runs.push({ text: text.slice(cursor) });
  }

  if (runs.every((r) => !r.bold && !r.italic)) return undefined;

  return runs;
}
