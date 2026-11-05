/**
 * As alternativas de uma questão não se dividem entre duas folhas quando cabem
 * juntas (N-U-004), e nada se perde nem se abre folha em branco quando a questão
 * é maior que a folha.
 *
 * O `minPresenceAhead` do 0530 só protegia o começo do grupo abertura + APOIO; as
 * alternativas ficavam livres, e `a) b) c)` ficava no pé da folha 1 com `d)` no
 * topo da 2. O teste empurra a questão para o pé da folha (preenchimento
 * calibrado, de 0 a 40 parágrafos) e roda o layout real do react-pdf.
 */
import { describe, it, expect, vi } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import type { CanonicalDocument, RichText } from "@/lib/adaptation/canonical/schema";

// Real react-pdf layout: a few seconds each, more under the full suite (same convention as the other layout tests).
vi.setConfig({ testTimeout: 60_000 });

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string): RichText => [{ type: "text", text: t }];

type Node = { lines?: { string?: string }[]; children?: Node[] };
const paintedText = (node: Node): string =>
  (node.lines ?? []).map((l) => l.string ?? "").join("") + " " + (node.children ?? []).map(paintedText).join(" ");

const LONG_STEM_REPEATS = 85;
const LONG_FILLER_FROM = 8;
const LONG_FILLER_TO = 24;
const STEM = "Qual fruta tem o maior preco por unidade";
const ALTS = ["Banana prata", "Laranja pera", "Uva italia", "Maca fuji"];

async function layout(filler: number, stem = STEM, answer?: CanonicalDocument["blocks"][number]): Promise<Node> {
  const blocks: CanonicalDocument["blocks"] = [];
  for (let i = 0; i < filler; i += 1) {
    blocks.push({ id: id(100 + i), type: "paragraph", content: rt(`Linha de preenchimento ${i}`) });
  }
  blocks.push(
    answer ??
      ({
        id: id(1),
        type: "question",
        stem: [{ id: id(2), type: "paragraph", content: rt(stem) }],
        answer: {
          kind: "multipleChoice",
          alternatives: ALTS.map((text, i) => ({ id: id(10 + i), content: rt(text), correct: i === 0 })),
        },
      } as never),
  );
  const doc: CanonicalDocument = { schemaVersion: 1, blocks };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  return (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
}

describe("PdfQuestion — alternativas juntas na mesma folha (N-U-004)", () => {
  // Faixa de alturas em que a questão toda passa do pé da folha 1.
  for (let filler = 20; filler <= 40; filler += 1) {
    it(`a folha que pinta a primeira alternativa pinta todas, e o enunciado com elas (${filler} parágrafos antes)`, async () => {
      const pages = (await layout(filler)).children ?? [];
      const withFirst = pages.filter((p) => paintedText(p).includes(ALTS[0]));
      expect(withFirst).toHaveLength(1);
      const text = paintedText(withFirst[0]);
      for (const alt of ALTS) expect(text).toContain(alt);
      expect(text).toContain(STEM);
    });
  }

  it("questão no topo da folha não gera folha em branco", async () => {
    expect((await layout(0)).children).toHaveLength(1);
  });

  it("verdadeiro/falso, caixas de seleção e ordenação também ficam juntos", async () => {
    const items = ALTS.map((text, i) => ({ id: id(10 + i), content: rt(text), correct: true }));
    const kinds = [
      { kind: "trueFalse", items },
      { kind: "checkbox", items },
      { kind: "ordering", items },
    ];
    for (const answer of kinds) {
      for (let filler = 24; filler <= 38; filler += 1) {
        const q = { id: id(1), type: "question", stem: [{ id: id(2), type: "paragraph", content: rt(STEM) }], answer } as never;
        const pages = (await layout(filler, STEM, q)).children ?? [];
        const withFirst = pages.filter((p) => paintedText(p).includes(ALTS[0]));
        expect(withFirst, `${answer.kind} ${filler}`).toHaveLength(1);
        for (const alt of ALTS) expect(paintedText(withFirst[0]), `${answer.kind} ${filler}`).toContain(alt);
      }
    }
  });

  it("pareamento também fica junto", async () => {
    const answer = { kind: "matching", pairs: ALTS.map((text, i) => ({ id: id(10 + i), left: rt(text), right: rt(`Par ${i}`) })) };
    for (let filler = 24; filler <= 38; filler += 1) {
      const q = { id: id(1), type: "question", stem: [{ id: id(2), type: "paragraph", content: rt(STEM) }], answer } as never;
      const pages = (await layout(filler, STEM, q)).children ?? [];
      const withFirst = pages.filter((p) => paintedText(p).includes(ALTS[0]));
      expect(withFirst, `matching ${filler}`).toHaveLength(1);
      for (const alt of ALTS) expect(paintedText(withFirst[0]), `matching ${filler}`).toContain(alt);
    }
  });

  // L10 T4 a T9: com o enunciado maior que meia folha a questão não viaja inteira (KEEP_QUESTION_PT),
  // e quem segura as respostas juntas é o marco da própria resposta, de cada tipo.
  it("com enunciado de mais de meia folha, cada tipo de resposta ainda fica junto na mesma folha", async () => {
    const items = ALTS.map((text, i) => ({ id: id(10 + i), content: rt(text), correct: true }));
    const answers = [
      { kind: "multipleChoice", alternatives: items },
      { kind: "trueFalse", items },
      { kind: "checkbox", items },
      { kind: "ordering", items },
      { kind: "matching", pairs: ALTS.map((text, i) => ({ id: id(10 + i), left: rt(text), right: rt(`Par ${i}`) })) },
    ];
    const long = `${STEM} ${"palavra longa de enunciado ".repeat(LONG_STEM_REPEATS)}`;
    for (const answer of answers) {
      for (let filler = LONG_FILLER_FROM; filler <= LONG_FILLER_TO; filler += 1) {
        const q = { id: id(1), type: "question", stem: [{ id: id(2), type: "paragraph", content: rt(long) }], answer } as never;
        const pages = (await layout(filler, long, q)).children ?? [];
        const withFirst = pages.filter((p) => paintedText(p).includes(ALTS[0]));
        expect(withFirst, `${answer.kind} ${filler}`).toHaveLength(1);
        for (const alt of ALTS) expect(paintedText(withFirst[0]), `${answer.kind} ${filler}`).toContain(alt);
      }
    }
  });

  it("uma questão maior que meia folha começa onde há meia folha livre e flui para a seguinte (L10 T4)", async () => {
    const long = `${STEM} ${"palavra longa de enunciado ".repeat(LONG_STEM_REPEATS)}`;
    for (const filler of [10, 12]) {
      const pages = (await layout(filler, long)).children ?? [];
      expect(paintedText(pages[0]), `filler ${filler}`).toContain(STEM);
    }
  });

  it("questão maior que a folha: nada se perde e a primeira folha não fica em branco", async () => {
    const long = `${STEM} ${"palavra longa de enunciado ".repeat(300)}`;
    const many = Array.from({ length: 30 }, (_, i) => `Alternativa numero ${i} com texto bem comprido para ocupar linhas`);
    const q = {
      id: id(1),
      type: "question",
      stem: [{ id: id(2), type: "paragraph", content: rt(long) }],
      answer: {
        kind: "multipleChoice",
        alternatives: many.map((text, i) => ({ id: id(10 + i), content: rt(text), correct: i === 0 })),
      },
    } as never;
    const pages = (await layout(0, long, q)).children ?? [];
    const all = pages.map(paintedText).join(" ");
    expect(paintedText(pages[0])).toContain(STEM);
    for (const text of many) expect(all).toContain(text);
    expect(pages.every((p) => paintedText(p).trim().length > 0)).toBe(true);
  });

  it("as alternativas de uma questão longa, depois de um enunciado enorme, não saltam folha à toa", async () => {
    const long = `${STEM} ${"palavra longa de enunciado ".repeat(150)}`;
    const pages = (await layout(0, long)).children ?? [];
    // 4 alternativas curtas cabem no resto da última folha do enunciado.
    expect(pages.length).toBeLessThanOrEqual(2);
    const withFirst = pages.filter((p) => paintedText(p).includes(ALTS[0]));
    expect(withFirst).toHaveLength(1);
    for (const alt of ALTS) expect(paintedText(withFirst[0])).toContain(alt);
  });
});
