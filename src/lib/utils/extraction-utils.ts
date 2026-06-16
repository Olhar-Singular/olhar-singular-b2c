export function normalizeTextForDedup(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

// Leading enumeration marker the OCR model often embeds in an option's text:
// "a)" / "A." / "(a)" / "a -" / "1)". Matches a single letter (a-e) or 1-2
// digits, an optional wrapping paren, a delimiter, and trailing whitespace.
const OPTION_MARKER = /^\s*\(?\s*([a-eA-E]|\d{1,2})\s*[).:\-–]\s+/;

export function stripOptionMarker(text: string): string {
  const stripped = text.replace(OPTION_MARKER, "").trim();
  // Never collapse an option to nothing (e.g. the text was only a marker).
  return stripped === "" ? text.trim() : stripped;
}

export function findDuplicates(
  newQuestions: { text: string }[],
  existingQuestions: { text: string }[]
): Set<number> {
  const existingNormalized = new Set(existingQuestions.map((q) => normalizeTextForDedup(q.text)));
  const duplicateIndices = new Set<number>();
  newQuestions.forEach((q, i) => {
    if (existingNormalized.has(normalizeTextForDedup(q.text))) duplicateIndices.add(i);
  });
  return duplicateIndices;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(",");
  const mimeMatch = meta.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function autoCropFromBbox(
  pageImageUrl: string,
  bbox: { x: number; y: number; width: number; height: number },
  padding = 0.02
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      const x = Math.max(0, (bbox.x - padding) * w);
      const y = Math.max(0, (bbox.y - padding) * h);
      const cropW = Math.min(w - x, (bbox.width + padding * 2) * w);
      const cropH = Math.min(h - y, (bbox.height + padding * 2) * h);
      const canvas = document.createElement("canvas");
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, cropW, cropH);
      ctx.drawImage(img, x, y, cropW, cropH, 0, 0, cropW, cropH);
      resolve(canvas.toDataURL("image/png", 0.92));
    };
    img.onerror = () => reject(new Error("Failed to load image for cropping"));
    img.src = pageImageUrl;
  });
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.ok) return resp;
      if (attempt === maxRetries) throw new Error(`HTTP ${resp.status}`);
    } catch (e) {
      if (attempt === maxRetries) throw e;
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error("Max retries exceeded");
}
