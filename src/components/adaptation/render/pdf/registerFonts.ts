/**
 * registerPdfFonts — idempotent Font.register calls for the accessibility
 * font families used by the canonical document (`pageStyle.fontFamily`).
 *
 * The classic @react-pdf built-ins (Helvetica / Times-Roman / Courier) need no
 * registration. Only the three a11y families shipped in `public/fonts/` need it:
 *   - "Atkinson Hyperlegible" (Regular, Bold, Italic, BoldItalic)
 *   - "Lexend"                (Regular, Bold)
 *   - "OpenDyslexic"          (Regular, Bold, Italic)
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
export function hyphenateWord(word: string | null): string[] {
  const value = word ?? "";
  if (value.length <= UNBREAKABLE_WORD_THRESHOLD) return [value];

  const parts: string[] = [];
  for (let i = 0; i < value.length; i += WORD_CHUNK_SIZE) {
    parts.push(value.slice(i, i + WORD_CHUNK_SIZE));
  }
  return parts;
}

export function registerPdfFonts(): void {
  if (done) return;
  done = true;

  Font.registerHyphenationCallback(hyphenateWord);

  Font.register({
    family: "Atkinson Hyperlegible",
    fonts: [
      { src: "/fonts/AtkinsonHyperlegible-Regular.ttf", fontWeight: "normal", fontStyle: "normal" },
      { src: "/fonts/AtkinsonHyperlegible-Bold.ttf", fontWeight: "bold", fontStyle: "normal" },
      { src: "/fonts/AtkinsonHyperlegible-Italic.ttf", fontWeight: "normal", fontStyle: "italic" },
      { src: "/fonts/AtkinsonHyperlegible-BoldItalic.ttf", fontWeight: "bold", fontStyle: "italic" },
    ],
  });

  Font.register({
    family: "Lexend",
    fonts: [
      { src: "/fonts/Lexend-Regular.ttf", fontWeight: "normal", fontStyle: "normal" },
      { src: "/fonts/Lexend-Bold.ttf", fontWeight: "bold", fontStyle: "normal" },
      // No italic files ship for Lexend — map italics to the upright files.
      { src: "/fonts/Lexend-Regular.ttf", fontWeight: "normal", fontStyle: "italic" },
      { src: "/fonts/Lexend-Bold.ttf", fontWeight: "bold", fontStyle: "italic" },
    ],
  });

  Font.register({
    family: "OpenDyslexic",
    fonts: [
      { src: "/fonts/OpenDyslexic-Regular.ttf", fontWeight: "normal", fontStyle: "normal" },
      { src: "/fonts/OpenDyslexic-Bold.ttf", fontWeight: "bold", fontStyle: "normal" },
      { src: "/fonts/OpenDyslexic-Italic.ttf", fontWeight: "normal", fontStyle: "italic" },
      // No BoldItalic file ships — map bold+italic to the Bold file.
      { src: "/fonts/OpenDyslexic-Bold.ttf", fontWeight: "bold", fontStyle: "italic" },
    ],
  });
}
