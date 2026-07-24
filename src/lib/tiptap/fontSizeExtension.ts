import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

/**
 * Normalize a CSS font-size into the `px` string the canonical mapper expects.
 *
 * `toCanonical` reads this attribute with `parseFloat` and treats the number as
 * pixels, so a pasted `font-size: 12pt` used to be recorded as 12px — a 9pt run
 * on the sheet and in the PDF, silently one third smaller than the source. Any
 * unit we cannot convert exactly (em/rem/%/keywords) returns null, so the run
 * simply inherits the document size instead of carrying a wrong number.
 */
export function normalizeFontSize(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)\s*(px|pt)$/i.exec(raw.trim());
  if (match === null) return null;
  const value = Number(match[1]);
  if (value <= 0) return null;
  const px = match[2].toLowerCase() === "pt" ? value * (96 / 72) : value;
  // Trim floating-point noise (12pt -> 16px, not 16.000000000000004px).
  return `${+px.toFixed(4)}px`;
}

export const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => normalizeFontSize(element.style.fontSize),
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});
