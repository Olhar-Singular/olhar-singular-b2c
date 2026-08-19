import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App";
import "./index.css";

// @react-pdf/renderer (PDF export) and its deps (fontkit/brotli) reach for the
// Node `Buffer` global, which browsers don't provide — without this the export
// crashes with "Buffer is not defined". Must run before any module touches it.
globalThis.Buffer = globalThis.Buffer ?? Buffer;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* enableSystem=false: light stays the default regardless of OS preference —
        the user picks dark explicitly via the account menu, it is never implied. */}
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="olhar-singular-theme">
      <App />
    </ThemeProvider>
  </StrictMode>,
);
