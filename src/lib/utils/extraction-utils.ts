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

const OPTION_LINE = /^\s*\(?[A-Ea-e]\s*[).]\s/;

export function stripOptionsFromText(text: string, hasOptions: boolean): string {
  if (!hasOptions) return text;
  const lines = text.split("\n");
  const firstOptIdx = lines.findIndex((line) => OPTION_LINE.test(line));
  if (firstOptIdx === -1) return text;
  return lines.slice(0, firstOptIdx).join("\n").trim();
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

// A pixel is "ink" when any channel is clearly below white (tolerates JPEG noise).
const INK_THRESHOLD = 230;
// Blank margin kept around the figure once its edge is found, as a fraction of the page.
const BLANK_MARGIN = 0.01;

export async function autoCropFromBbox(
  pageImageUrl: string,
  bbox: { x: number; y: number; width: number; height: number },
  // The AI estimates this bbox by eye from the page image — general-purpose
  // vision models are not precise at pixel-level localization, so a tight
  // margin routinely cropped part of the actual figure off. Up to 6% of slack
  // is searched past each bbox edge, but only while the figure keeps going:
  // the crop stops at the first blank band (plus a small margin), so the text
  // lines around the figure are not pulled into the image.
  padding = 0.06
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;

      const page = document.createElement("canvas");
      page.width = w;
      page.height = h;
      const pageCtx = page.getContext("2d")!;
      pageCtx.drawImage(img, 0, 0);
      const { data } = pageCtx.getImageData(0, 0, w, h);
      const inkAt = (px: number, py: number) => {
        const i = (py * w + px) * 4;
        return Math.min(data[i], data[i + 1], data[i + 2]) < INK_THRESHOLD;
      };
      const rowHasInk = (row: number, x0: number, x1: number) => {
        for (let px = x0; px < x1; px++) if (inkAt(px, row)) return true;
        return false;
      };
      const colHasInk = (col: number, y0: number, y1: number) => {
        for (let py = y0; py < y1; py++) if (inkAt(col, py)) return true;
        return false;
      };

      // Walks from `edge` towards `limit` (one step at a time, `step` = ±1):
      // through ink (figure the bbox undershot), then up to `margin` blank lines.
      const grow = (edge: number, limit: number, step: number, margin: number, hasInk: (i: number) => boolean) => {
        let pos = edge;
        while (pos !== limit && hasInk(pos + (step < 0 ? -1 : 0))) pos += step;
        let blank = 0;
        while (pos !== limit && blank < margin && !hasInk(pos + (step < 0 ? -1 : 0))) {
          pos += step;
          blank++;
        }
        return pos;
      };

      const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)));
      const bx0 = clamp(bbox.x * w, w);
      const bx1 = clamp((bbox.x + bbox.width) * w, w);
      const by0 = clamp(bbox.y * h, h);
      const by1 = clamp((bbox.y + bbox.height) * h, h);
      const padX = Math.round(padding * w);
      const padY = Math.round(padding * h);
      const marginX = Math.round(BLANK_MARGIN * w);
      const marginY = Math.round(BLANK_MARGIN * h);

      const y0 = grow(by0, Math.max(0, by0 - padY), -1, marginY, (r) => rowHasInk(r, bx0, bx1));
      const y1 = grow(by1, Math.min(h, by1 + padY), 1, marginY, (r) => rowHasInk(r, bx0, bx1));
      const x0 = grow(bx0, Math.max(0, bx0 - padX), -1, marginX, (c) => colHasInk(c, y0, y1));
      const x1 = grow(bx1, Math.min(w, bx1 + padX), 1, marginX, (c) => colHasInk(c, y0, y1));

      const cropW = Math.max(1, x1 - x0);
      const cropH = Math.max(1, y1 - y0);
      const canvas = document.createElement("canvas");
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, cropW, cropH);
      ctx.drawImage(img, x0, y0, cropW, cropH, 0, 0, cropW, cropH);
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
