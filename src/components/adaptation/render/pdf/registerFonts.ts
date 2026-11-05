/**
 * registerPdfFonts — idempotent Font.register calls for every font family the
 * canonical document can print (`pageStyle.fontFamily`).
 *
 * All of them ship in `public/fonts/` and therefore travel INSIDE the exported
 * PDF. That is the whole point (achado 0445): a @react-pdf built-in is a Type 1
 * font the file references but does not carry, so `pdffonts` reports `emb: no`
 * and the school's printer substitutes whatever it has — different metrics,
 * different line breaks, a "1 page" preview that comes out as 2.
 *
 * Accessibility families:
 *   - "Atkinson Hyperlegible" (Regular, Bold, Italic, BoldItalic)
 *   - "Lexend"                (Regular, Bold)
 *   - "OpenDyslexic"          (Regular, Bold, Italic)
 *
 * Classic families (Liberation, SIL OFL 1.1 — see `LICENSE-Liberation.txt`;
 * built by `scripts/build-classic-fonts.py`):
 *   - "Liberation Sans"  (Arial/Helvetica metrics)      ← tokens sans, arial
 *   - "Liberation Serif" (Times New Roman/Times metrics) ← tokens serif, georgia
 * Being metric-compatible with the built-ins they replace, they reflow nothing
 * in documents already saved.
 *
 * The one family still NOT registered is Courier (token `mono`): it is what the
 * PDF draws formulas in, and the cap-height compensation in `pageTokens.ts`
 * (achados 0424/0429) is calibrated on the built-in's metric.
 *
 * Symbol fonts (C-01): "DejaVu Sans" and "DejaVu Sans Mono" are the SECOND entry
 * of every font stack (`fontStack.ts`), so a character the chosen family lacks
 * (≤ √ ∈ ℝ, Greek in the accessibility fonts) is drawn from them instead of
 * falling to the built-in Helvetica that @react-pdf always appends.
 *
 * Every family registers all four weight/style combinations: @react-pdf does
 * NOT fall back across variants — rendering an unregistered one rejects the
 * whole export with "Could not resolve font". Variants without a dedicated
 * file map to the closest upright file (Lexend italics → Regular/Bold,
 * OpenDyslexic bold+italic → Bold), rendering "straight" instead of throwing.
 *
 * A module-level `done` guard ensures a second call is a no-op, which is safe
 * to call at the top of `buildPdfDocument` without performance concerns.
 */

import { Font } from "@react-pdf/renderer";
import { SYMBOL_FONT_FAMILY, SYMBOL_MONO_FONT_FAMILY } from "./fontStack";

let done = false;

/**
 * Longest token we assume a real line can still hold. No Portuguese word is
 * wider than this in the sizes the document uses, so words up to here are
 * emitted whole and never get a hyphen (that is what achado 0112 fixed).
 */
export const UNBREAKABLE_WORD_THRESHOLD = 30;

/** Size of each piece a runaway token is cut into. Smaller = tighter to the margin. */
export const WORD_CHUNK_SIZE = 8;

/**
 * Widest formula atom (LaTeX whose spaces are NBSP, see `latexLayoutAtom`) that
 * is still emitted whole. `mathToPdfText` only builds an atom up to the column
 * width in characters (≈ 85 at the base size, a bit more in a smaller body), so
 * anything under this is a formula that fits a line: it moves to the next line
 * intact instead of being cut at a chunk boundary, where textkit appends a "-"
 * and prints `(x-` / `+ y)` (C-15). Past it, it is not a formula atom any more
 * and the runaway-token rule keeps every character.
 */
export const FORMULA_ATOM_MAX_CHARS = 140;

/**
 * Hyphenation callback (achado 0115).
 *
 * In `@react-pdf/textkit` this callback is the ONLY source of break
 * opportunities inside a word (`options.hyphenationCallback || builtinHyphenate`).
 * Returning `[word]` for everything, as the previous fix did, removed the
 * en-US hyphens but also made a token wider than the content box unbreakable:
 * textkit laid it on a single line and silently DROPPED every character past
 * the right margin — the exported PDF lost 1.091 of 1.200 characters with no
 * error anywhere.
 *
 * So: normal words (<= UNBREAKABLE_WORD_THRESHOLD) still come back whole, with
 * no syllable split and no hyphen; a runaway token (URL colada, artefato de
 * OCR) is cut into fixed chunks so the line breaker can wrap it and keep all
 * its characters. textkit appends its own "-" at whatever chunk boundary it
 * actually breaks on; losing content is never an acceptable alternative.
 */
/**
 * Marca (hífen condicional, U+00AD) que o mapper da fórmula põe no começo de cada pedaço: o
 * textkit a REMOVE do texto depois de chamar `hyphenateWord`, então ela não vira glifo, mas
 * aqui avisa "este token é um pedaço de fórmula que cabe na coluna: não corte, não hifene"
 * (N-U-001). Sem ela, uma fórmula sem espaço (`1+2+...+80`, `x^{n-k-1}y^k`) acima do limite de
 * palavra era picada em pedaços de 8 com hífen no meio.
 */
export const NO_HYPHEN_MARK = "\u00ad";

export function hyphenateWord(word: string | null): string[] {
  const value = word ?? "";
  // Dois espaços seguidos chegam aqui como UM token (o textkit parte o texto em `/([ ]+)/`). Como
  // sílaba única `"  "`, ela é diferente de `" "` e o `getNodes` põe um ponto de hifenização na
  // palavra que a antecede: a linha que quebra ali imprime "-" (`AL07-`, `\end{aligned}-`,
  // N-U-008). Um espaço por sílaba: mesmo texto, mesma largura, nenhum ponto de hifenização.
  if (value.length > 1 && /^ +$/.test(value)) return Array.from(value);
  if (value.includes(NO_HYPHEN_MARK)) return [value];
  if (value.length <= UNBREAKABLE_WORD_THRESHOLD) return [value];
  if (value.length <= FORMULA_ATOM_MAX_CHARS && value.includes("\u00a0")) return [value];

  const parts: string[] = [];
  for (let i = 0; i < value.length; i += WORD_CHUNK_SIZE) {
    parts.push(value.slice(i, i + WORD_CHUNK_SIZE));
  }
  return parts;
}

/** Uma variante peso × estilo de uma família, como o @react-pdf a registra. */
export type PdfFontVariant = {
  src: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
};

/** Uma família e as suas quatro variantes. */
export type PdfFontRegistration = { family: string; fonts: PdfFontVariant[] };

/** As quatro variantes peso × estilo de uma fonte que tem um arquivo só. */
function symbolVariants(src: string): PdfFontVariant[] {
  return [
    { src, fontWeight: "normal", fontStyle: "normal" },
    { src, fontWeight: "bold", fontStyle: "normal" },
    { src, fontWeight: "normal", fontStyle: "italic" },
    { src, fontWeight: "bold", fontStyle: "italic" },
  ];
}

/**
 * Toda família que o documento pode imprimir, com o arquivo de cada variante.
 *
 * É uma CONSTANTE, e não uma sequência de chamadas soltas, porque o teste
 * precisa da mesma lista para montar um `FontStore` próprio (o layout real do
 * react-pdf roda sobre uma instância nova, que não enxerga o registro global) —
 * ver `src/test/pdfFontStore.ts`. Lista e registro divergirem devolveria o
 * "Could not resolve font" só na exportação de verdade.
 */
export const PDF_FONT_REGISTRATIONS: PdfFontRegistration[] = [
  // Fontes de SÍMBOLOS (C-01): segunda opção de toda pilha (`fontStack.ts`). Cada
  // uma tem um arquivo só; as quatro variantes apontam para ele, senão uma
  // fórmula em negrito ou itálico rejeitaria o PDF inteiro ("Could not resolve
  // font"). Sai de `scripts/build-symbol-fonts.py`.
  {
    family: SYMBOL_FONT_FAMILY,
    fonts: symbolVariants("/fonts/DejaVuSans-Symbols.ttf"),
  },
  {
    family: SYMBOL_MONO_FONT_FAMILY,
    fonts: symbolVariants("/fonts/DejaVuSansMono-Symbols.ttf"),
  },
  {
    family: "Liberation Sans",
    fonts: [
      { src: "/fonts/LiberationSans-Regular.ttf", fontWeight: "normal", fontStyle: "normal" },
      { src: "/fonts/LiberationSans-Bold.ttf", fontWeight: "bold", fontStyle: "normal" },
      { src: "/fonts/LiberationSans-Italic.ttf", fontWeight: "normal", fontStyle: "italic" },
      { src: "/fonts/LiberationSans-BoldItalic.ttf", fontWeight: "bold", fontStyle: "italic" },
    ],
  },
  {
    family: "Liberation Serif",
    fonts: [
      { src: "/fonts/LiberationSerif-Regular.ttf", fontWeight: "normal", fontStyle: "normal" },
      { src: "/fonts/LiberationSerif-Bold.ttf", fontWeight: "bold", fontStyle: "normal" },
      { src: "/fonts/LiberationSerif-Italic.ttf", fontWeight: "normal", fontStyle: "italic" },
      { src: "/fonts/LiberationSerif-BoldItalic.ttf", fontWeight: "bold", fontStyle: "italic" },
    ],
  },
  {
    family: "Atkinson Hyperlegible",
    fonts: [
      { src: "/fonts/AtkinsonHyperlegible-Regular.ttf", fontWeight: "normal", fontStyle: "normal" },
      { src: "/fonts/AtkinsonHyperlegible-Bold.ttf", fontWeight: "bold", fontStyle: "normal" },
      { src: "/fonts/AtkinsonHyperlegible-Italic.ttf", fontWeight: "normal", fontStyle: "italic" },
      { src: "/fonts/AtkinsonHyperlegible-BoldItalic.ttf", fontWeight: "bold", fontStyle: "italic" },
    ],
  },
  {
    family: "Lexend",
    fonts: [
      { src: "/fonts/Lexend-Regular.ttf", fontWeight: "normal", fontStyle: "normal" },
      { src: "/fonts/Lexend-Bold.ttf", fontWeight: "bold", fontStyle: "normal" },
      // No italic files ship for Lexend — map italics to the upright files.
      { src: "/fonts/Lexend-Regular.ttf", fontWeight: "normal", fontStyle: "italic" },
      { src: "/fonts/Lexend-Bold.ttf", fontWeight: "bold", fontStyle: "italic" },
    ],
  },
  {
    family: "OpenDyslexic",
    fonts: [
      { src: "/fonts/OpenDyslexic-Regular.ttf", fontWeight: "normal", fontStyle: "normal" },
      { src: "/fonts/OpenDyslexic-Bold.ttf", fontWeight: "bold", fontStyle: "normal" },
      { src: "/fonts/OpenDyslexic-Italic.ttf", fontWeight: "normal", fontStyle: "italic" },
      // No BoldItalic file ships — map bold+italic to the Bold file.
      { src: "/fonts/OpenDyslexic-Bold.ttf", fontWeight: "bold", fontStyle: "italic" },
    ],
  },
];

/** The part of a registered @react-pdf font face that `shareAliasedFaces` touches. */
type FontFaceSource = { src: string; data: unknown; load: () => Promise<unknown> };

/**
 * Faces that point at the SAME file (Lexend italics, OpenDyslexic bold-italic, the
 * symbol fonts) must share ONE parsed font, not one copy per face.
 *
 * @react-pdf parses a copy per registered face, but pdfkit embeds a single font per
 * PostScript name, so with two copies the glyph objects of the embedded one are
 * created at embed time with no code points and stay cached in the (reused) font.
 * The next export that lays text out with that copy hands pdfkit glyphs whose
 * ToUnicode entry is empty, and the PDF text layer loses that letter ("Lembre-se"
 * copied as "embre-se", F-L). The paper was always right. Sharing the parsed font
 * makes layout and embedding see the same glyph objects.
 */
export function shareAliasedFaces(families: Record<string, { sources: FontFaceSource[] }>): void {
  for (const { sources } of Object.values(families)) {
    const primaryBySrc = new Map<string, FontFaceSource>();
    for (const source of sources) {
      const primary = primaryBySrc.get(source.src);
      if (!primary) {
        primaryBySrc.set(source.src, source);
        continue;
      }
      source.load = async () => {
        await primary.load();
        source.data = primary.data;
      };
    }
  }
}

export function registerPdfFonts(): void {
  if (done) return;
  done = true;

  Font.registerHyphenationCallback(hyphenateWord);

  for (const registration of PDF_FONT_REGISTRATIONS) {
    Font.register(registration);
  }
  shareAliasedFaces(Font.getRegisteredFonts() as unknown as Record<string, { sources: FontFaceSource[] }>);
}
