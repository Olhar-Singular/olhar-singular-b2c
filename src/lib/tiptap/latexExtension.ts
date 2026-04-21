import { Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import katex from "katex";

const LATEX_INLINE_RE = /\$([^$\n]+)\$/g;

function renderLatex(latex: string): string {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: false, strict: false });
  } catch {
    return `<span class="latex-error" title="Invalid LaTeX">$${latex}$</span>`;
  }
}

function buildDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const text = node.text || "";
    LATEX_INLINE_RE.lastIndex = 0;
    let match;
    while ((match = LATEX_INLINE_RE.exec(text)) !== null) {
      const from = pos + match.index;
      const to = from + match[0].length;
      decorations.push(Decoration.inline(from, to, { class: "latex-rendered", "data-latex": match[1] }));
    }
  });
  return DecorationSet.create(doc, decorations);
}

export const LatexExtension = Node.create({
  name: "latex",
  addProseMirrorPlugins() {
    const key = new PluginKey("latexDecoration");
    return [
      new Plugin({
        key,
        state: {
          init(_, { doc }) { return buildDecorations(doc); },
          apply(tr, decorationSet) {
            return tr.docChanged ? buildDecorations(tr.doc) : decorationSet.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations(state) { return this.getState(state); } },
      }),
    ];
  },
});

export const latexStyles = `
  .latex-rendered { background: linear-gradient(to bottom, rgba(99,102,241,0.1), transparent); border-radius: 2px; padding: 0 2px; }
  .latex-rendered:hover { background: rgba(99,102,241,0.15); }
  .latex-error { color: #ef4444; background: rgba(239,68,68,0.1); border-radius: 2px; padding: 0 2px; }
  .ProseMirror .katex { font-size: 1.1em; }
`;

export default LatexExtension;
