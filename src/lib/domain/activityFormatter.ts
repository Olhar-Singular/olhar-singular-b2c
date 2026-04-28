// Inline text formatter for activity DSL preview.
// Handles markdown-like formatting, math (KaTeX), colors, font sizes, and blanks.

import katex from "katex";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function preprocessLatex(expr: string): string {
  return expr.replace(/\\text\{(_+)\}/g, (_, underscores: string) => {
    const em = Math.max(1.5, Math.min(underscores.length * 0.5, 8));
    return `\\underline{\\hspace{${em}em}}`;
  });
}

function renderKatexInline(expr: string): string {
  try {
    return katex.renderToString(preprocessLatex(expr), { throwOnError: false, displayMode: false });
  } catch {
    return "<code>" + esc(expr) + "</code>";
  }
}

export function renderKatexBlock(expr: string): string {
  try {
    return katex.renderToString(preprocessLatex(expr), { throwOnError: false, displayMode: true });
  } catch {
    return "<pre>" + esc(expr) + "</pre>";
  }
}

export function formatInline(text: string): string {
  let s = text.replace(/\x0C/g, "");
  s = esc(s);

  const mathSlots: string[] = [];
  function slot(html: string): string {
    mathSlots.push(html);
    return `\x00${mathSlots.length - 1}\x00`;
  }

  s = s.replace(/\$\$(.+?)\$\$/g, (_, expr) =>
    slot(
      '<div style="margin:0.5rem 0;padding:0.5rem;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;text-align:center;overflow-x:auto">' +
        renderKatexBlock(expr) +
        "</div>"
    )
  );

  s = s.replace(/\$(.+?)\$/g, (_, expr) => slot(renderKatexInline(expr)));

  s = s.replace(/@cor\[(.+?)\]\{(.+?)\}/g, '<span style="color:$1">$2</span>');
  s = s.replace(/@tam\[(\d+)\]\{(.+?)\}/g, '<span style="font-size:$1px">$2</span>');

  s = s.replace(/_{3,}/g, (match) => {
    const w = Math.max(2, Math.min(match.length * 0.55, 12));
    return `<span style="display:inline-block;border-bottom:1.5px solid currentColor;width:${w}em;vertical-align:bottom;margin:0 1px"></span>`;
  });

  s = s.replace(/\*\*(.+?)\*\*/g, '<span style="font-weight:700">$1</span>');
  s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<span style="font-style:italic">$1</span>');
  s = s.replace(/__(.+?)__/g, '<span style="text-decoration:underline">$1</span>');
  s = s.replace(/~~(.+?)~~/g, '<span style="text-decoration:line-through">$1</span>');

  s = s.replace(/\x00(\d+)\x00/g, (_, i) => mathSlots[parseInt(i, 10)]);

  return s;
}
