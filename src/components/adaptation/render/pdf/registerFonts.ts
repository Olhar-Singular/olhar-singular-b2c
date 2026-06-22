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
 * A module-level `done` guard ensures a second call is a no-op, which is safe
 * to call at the top of `buildPdfDocument` without performance concerns.
 */

import { Font } from "@react-pdf/renderer";

let done = false;

export function registerPdfFonts(): void {
  if (done) return;
  done = true;

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
    ],
  });

  Font.register({
    family: "OpenDyslexic",
    fonts: [
      { src: "/fonts/OpenDyslexic-Regular.ttf", fontWeight: "normal", fontStyle: "normal" },
      { src: "/fonts/OpenDyslexic-Bold.ttf", fontWeight: "bold", fontStyle: "normal" },
      { src: "/fonts/OpenDyslexic-Italic.ttf", fontWeight: "normal", fontStyle: "italic" },
    ],
  });
}
