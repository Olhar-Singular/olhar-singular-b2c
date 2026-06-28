import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// @react-pdf/renderer (PDF export) and its deps (fontkit/brotli) reach for the
// Node `Buffer` global, which browsers don't provide — without this the export
// crashes with "Buffer is not defined". Must run before any module touches it.
globalThis.Buffer = globalThis.Buffer ?? Buffer;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
