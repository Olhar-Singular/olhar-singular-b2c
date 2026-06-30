/**
 * Render-time regression guard for the image-overflow fix.
 *
 * The other PdfImage tests assert the *style object*. This one runs react-pdf's
 * REAL layout engine (@react-pdf/layout) over the actual <AdaptationPdf> tree
 * and checks the computed box: a tall image must be bounded to the content box
 * and to a page-safe height, so react-pdf paginates instead of drawing the
 * image overflowing onto the blocks below it (the original bug).
 */
import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import FontStore from "@react-pdf/font";
import { AdaptationPdf } from "./AdaptationPdf";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

// --- minimal PNG encoder: a real PNG with the requested intrinsic dimensions,
//     so react-pdf reads a true aspect ratio when laying the image out. ---
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
};
const pngDataUri = (w: number, h: number): string => {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const row = Buffer.alloc(1 + w * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return "data:image/png;base64," + png.toString("base64");
};

type Box = { width: number; height: number; top: number };
function imageBox(node: unknown): Box | null {
  if (!node || typeof node !== "object") return null;
  const n = node as { type?: string; box?: Box; children?: unknown[] };
  if (n.type === "IMAGE" && n.box) return n.box;
  for (const child of n.children ?? []) {
    const found = imageBox(child);
    if (found) return found;
  }
  return null;
}

async function layoutImage(doc: CanonicalDocument): Promise<Box> {
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  const layout = await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    new (FontStore as unknown as { new (): unknown })() as never,
  );
  const box = imageBox(layout);
  if (!box) throw new Error("no IMAGE box in computed layout");
  return box;
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// A4 content box is ≈515.3pt wide (841.89/595.28 page − 2×40 margin).
const CONTENT_LIMIT = 516;
// Discriminating bound: the fix caps a tall image at ≈701pt; the old (buggy) code
// let it fill the column to ≈752pt (overflowing). 720 sits between the two, so
// this assertion fails if the height cap is ever removed.
const PAGE_HEIGHT_LIMIT = 720;

describe("PdfImage — real react-pdf layout keeps images within the page", () => {
  it("bounds a tall image (no width) to the content box and a page-safe height", async () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [{ id: id(1), type: "image", src: pngDataUri(1000, 1500), alt: "tall" }],
    };
    const box = await layoutImage(doc);
    expect(box.width).toBeLessThanOrEqual(CONTENT_LIMIT);
    expect(box.height).toBeLessThan(PAGE_HEIGHT_LIMIT);
  });

  it("clamps an oversized explicit width to the content box", async () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      // 1000px → 750pt, far wider than the ~515pt content box.
      blocks: [{ id: id(2), type: "image", src: pngDataUri(1200, 400), alt: "wide", width: 1000 }],
    };
    const box = await layoutImage(doc);
    expect(box.width).toBeLessThanOrEqual(CONTENT_LIMIT);
  });
});
