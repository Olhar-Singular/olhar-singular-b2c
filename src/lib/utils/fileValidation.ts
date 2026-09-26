export function validatePdfMagicBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export function validateDocxMagicBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function validateImageMagicBytes(bytes: Uint8Array): "jpeg" | "png" | null {
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "png";
  return null;
}

export function detectFileType(bytes: Uint8Array): "pdf" | "docx" | "jpeg" | "png" | null {
  if (validatePdfMagicBytes(bytes)) return "pdf";
  if (validateDocxMagicBytes(bytes)) return "docx";
  return validateImageMagicBytes(bytes);
}

/**
 * Canonical MIME type of each accepted document format. The upload declares
 * this, not the browser's `file.type` (empty or generic on platforms that do
 * not know .docx), and the question-pdfs bucket accepts exactly these values.
 */
export const DOCUMENT_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
