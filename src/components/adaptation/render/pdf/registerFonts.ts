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

export function registerPdfFonts(): void {
  if (done) return;
  done = true;

  // Turn hyphenation OFF. Without a callback, @react-pdf/textkit falls back to
  // its builtin hyphenator, which is loaded with en-US patterns: it splits
  // Portuguese words at English syllable boundaries and prints a trailing "-"
  // at every line break. The screen renderer never does that (CanonicalRenderer
  // breaks with `break-words`, no hyphen), so the PDF diverged from the preview
  // and students got hyphens suggesting syllable splits that do not exist.
  // The identity callback returns the word as a single part = no break inserted.
  Font.registerHyphenationCallback((word) => [word]);

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
