/**
 * Superscript and subscript as text: the ONE place that decides how `x²` / `H₂O` are
 * written when there is no mark to carry them (C-02, C-11, C-32).
 *
 * The canonical document has no sup/sub mark, and the AI reads text, so a script that is
 * only flattened becomes the wrong value (`x2`, `103`). The convention is the one the
 * Word equation reader already uses: `x^2`, `10^3`, `3^(n+1)`, `H_(2)O`. The content goes
 * bare when it is a plain run of letters or digits AND the next character would not glue
 * to it; otherwise it goes in parentheses.
 *
 * Used by the .docx reader (`docx-math`), by pasted HTML in the sheet editors, and by the
 * Editor Manual HTML on its way to the AI (`htmlToText`).
 */

export type ScriptKind = "sup" | "sub";

/** `rest` is whatever text follows the script (only its first letter or digit matters). */
export function scriptToText(kind: ScriptKind, text: string, rest: string): string {
  const simple = /^[\p{L}\p{N}]+$/u.test(text) && !/[\p{L}\p{N}]/u.test(rest.charAt(0));
  return `${kind === "sup" ? "^" : "_"}${simple ? text : `(${text})`}`;
}

/** `vertical-align:super` / `sub` (what Word and Google Docs paste instead of <sup>/<sub>). */
function styleKind(el: Element): ScriptKind | null {
  const align = (el as HTMLElement).style?.verticalAlign;
  if (align === "super") return "sup";
  if (align === "sub") return "sub";
  return null;
}

function kindOf(el: Element): ScriptKind | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "sup" || tag === "sub") return tag;
  return styleKind(el);
}

/** The first character of the text that follows `el` in document order ("" at the end). */
function textAfter(el: Node): string {
  for (let n: Node | null = el; n; n = n.parentNode) {
    for (let s = n.nextSibling; s; s = s.nextSibling) {
      if (s.textContent) return s.textContent;
    }
  }
  return "";
}

/**
 * Replaces every `<sup>`, `<sub>` and `vertical-align: super|sub` element with its text in
 * the `^` / `_` convention. HTML with no script comes back byte for byte (no re-serialising
 * a paste that does not need it). An element with no visible text is left as a plain space.
 */
export function linearizeHtmlScripts(html: string): string {
  if (!/<su[pb]\b|vertical-align/i.test(html)) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  const scripts = Array.from(template.content.querySelectorAll("*")).filter((el) => kindOf(el) !== null);
  // Inner first, so an outer script reads the already flattened text.
  for (const el of scripts.reverse()) {
    const kind = kindOf(el) as ScriptKind;
    const text = el.textContent;
    el.replaceWith(
      document.createTextNode(text.trim() ? scriptToText(kind, text, textAfter(el)) : " "),
    );
  }
  return template.innerHTML;
}
