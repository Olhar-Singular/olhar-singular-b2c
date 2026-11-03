/**
 * O enunciado da questão não fica sozinho no pé da folha quando a FIGURA que o
 * segue desce (achado 1135).
 *
 * O <Image> do react-pdf é indivisível: quando não cabe no resto da folha, o
 * react-pdf quebra antes dele e deixava número + "Observe a figura" sozinhos
 * no pé da folha. Mesma forma do 0530 (APOIO). O teste empurra a questão para
 * o pé da folha e roda o layout real: a folha que pinta a abertura precisa
 * pintar também a figura.
 */
import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import type { CanonicalDocument, RichText } from "@/lib/adaptation/canonical/schema";

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
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return "data:image/png;base64," + png.toString("base64");
};

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string): RichText => [{ type: "text", text: t }];

type Node = {
  type?: string;
  props?: { minPresenceAhead?: number };
  lines?: { string?: string }[];
  children?: Node[];
};

const paintedText = (node: Node): string =>
  (node.lines ?? []).map((l) => l.string ?? "").join("") +
  " " +
  (node.children ?? []).map(paintedText).join(" ");

const hasImage = (node: Node): boolean =>
  node.type === "IMAGE" || (node.children ?? []).some(hasImage);

const STEM = "Observe a figura e responda";
const IMG = pngDataUri(60, 40);

type Lead = "paragraph" | "enunciado";

async function layout(filler: number, lead: Lead, imageBreak = false): Promise<Node> {
  const blocks: CanonicalDocument["blocks"] = [];
  for (let i = 0; i < filler; i += 1) {
    blocks.push({ id: id(100 + i), type: "paragraph", content: rt(`Linha de preenchimento ${i}`) });
  }
  const image = {
    id: id(3),
    type: "image" as const,
    src: IMG,
    width: 400,
    ...(imageBreak ? { style: { pageBreakBefore: true } } : {}),
  };
  blocks.push({
    id: id(1),
    type: "question",
    ...(lead === "enunciado"
      ? { enunciado: rt(STEM), enunciadoPosition: "above" as const, stem: [image] }
      : { stem: [{ id: id(2), type: "paragraph" as const, content: rt(STEM) }, image] }),
    answer: { kind: "open", answerLines: 2 },
  });
  const doc: CanonicalDocument = { schemaVersion: 1, blocks };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  return (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
}

describe("PdfQuestion — enunciado viaja com a figura indivisível", () => {
  for (const lead of ["paragraph", "enunciado"] as Lead[]) {
    // Figura de 400px (300pt x 200pt): faixa em que a abertura cabe no pé e a figura não.
    for (let filler = 22; filler <= 34; filler += 2) {
      it(`${lead}: a folha do enunciado também pinta a figura (${filler} parágrafos antes)`, async () => {
        const root = await layout(filler, lead);
        const pages = root.children ?? [];
        const stemPages = pages.filter((p) => paintedText(p).includes(STEM));
        expect(stemPages).toHaveLength(1);
        expect(hasImage(stemPages[0])).toBe(true);
      });
    }

    it(`${lead}: questão com figura no topo da folha não gera folha em branco`, async () => {
      const root = await layout(0, lead);
      expect(root.children).toHaveLength(1);
    });
  }

  it("figura que pede quebra de página antes não é amarrada à abertura", async () => {
    const guards = (node: Node): number =>
      (node.props?.minPresenceAhead ? 1 : 0) +
      (node.children ?? []).reduce((sum, child) => sum + guards(child), 0);
    expect(guards(await layout(0, "paragraph"))).toBe(1);
    expect(guards(await layout(0, "paragraph", true))).toBe(0);
  });
});
