/**
 * Nenhum hífen aparece na emenda entre texto e fórmula (N-U-008, família do N-U-006).
 *
 * O AL07 do golden (`AL07␣␣` + fórmula + `␣␣(fim da frase)`) imprimia `\end{aligned}-` e
 * `AL07-`. Causa: o quebrador do textkit põe um ponto de hifenização (e, se a linha quebra ali,
 * um "-") depois de toda palavra cuja sílaba seguinte é DIFERENTE de um espaço simples
 * (`syllables[i + 1] !== " "`). Dois espaços seguidos viram UMA sílaba `"  "`, então a palavra
 * antes deles ganhava o ponto de hifenização. O `hyphenateWord` agora devolve cada espaço como
 * sílaba própria. Roda o layout REAL, em várias distâncias da margem (a quebra só cai na emenda
 * em algumas).
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import type { Block, CanonicalDocument, RichText } from "@/lib/adaptation/canonical/schema";

const id = (() => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
})();

type Node = { lines?: Array<{ string?: string }>; children?: Node[] };

async function printed(blocks: Block[]): Promise<string[]> {
  const doc: CanonicalDocument = { schemaVersion: 1, blocks };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  const tree = (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
  const out: string[] = [];
  const walk = (n: Node) => {
    for (const l of n.lines ?? []) out.push(l.string ?? "");
    (n.children ?? []).forEach(walk);
  };
  walk(tree);
  return out;
}

/** O AL07 do golden: `x-y` é o único hífen do documento. */
const AL07 = String.raw`\begin{aligned} 2x+y&=7\\ x-y&=2 \end{aligned}`;
const hyphens = (lines: string[]) => lines.join("\n").split("-").length - 1;
const paragraph = (content: RichText): Block => ({ id: id(), type: "paragraph", content }) as unknown as Block;
const text = (t: string): RichText => [{ type: "text", text: t }];
const math = (latex: string): RichText => [{ type: "inlineMath", latex }];

// quanto texto antes: a quebra de linha cai em lugares diferentes
const LEADS = Array.from({ length: 24 }, (_, n) => Array.from({ length: n }, (_, i) => (i % 2 ? "casa " : "palavra ")).join(""));

describe("emenda texto/fórmula sem hífen (N-U-008)", () => {
  const HEADS = ["AL07  ", "AL07 ", "AL07   ", "Resolva:  "];
  const TAILS = ["  (fim da frase)", " (fim da frase)", "   (fim da frase)", "  ", " e confira."];
  for (const head of HEADS) {
    for (const tail of TAILS) {
      it(`${JSON.stringify(head)} + fórmula + ${JSON.stringify(tail)}: nenhum hífen além do da fórmula`, async () => {
        const blocks = LEADS.map((lead) => paragraph([...text(lead + head), ...math(AL07), ...text(tail)]));
        const lines = await printed(blocks);
        expect(hyphens(lines)).toBe(LEADS.length);
      });
    }
  }

  it("texto com dois espaços entre palavras, sem fórmula, também não ganha hífen", async () => {
    const blocks = LEADS.map((lead) => paragraph(text(`${lead}ABCD  EFGH  IJKL  MNOP  (fim)`)));
    expect(hyphens(await printed(blocks))).toBe(0);
  });

  it("os espaços continuam todos na linha: nenhum caractere some", async () => {
    const lines = await printed([paragraph([...text("AL07  "), ...math(AL07), ...text("  (fim da frase)")])]);
    const all = lines.join("").replace(/[\s\u00a0]+/g, "");
    expect(all).toContain("AL07" + AL07.replace(/[\s\u00a0]+/g, "") + "(fimdafrase)");
  });

  // Texto colado na fórmula, sem espaço (`(` + fórmula + `)`, fórmula + `.`): o textkit também põe
  // um ponto de hifenização entre dois runs sem espaço, e a linha que quebra ali imprimia "-".
  describe("texto colado na fórmula, sem espaço", () => {
    const SHORT = String.raw`x+y`;
    const BIG = Array.from({ length: 60 }, (_, i) => i + 1).join(" + ");
    const FORMULAS: Array<[string, string, number]> = [["AL07", AL07, 1], ["curta", SHORT, 0], ["60 termos", BIG, 0]];
    for (const [name, latex, own] of FORMULAS) {
      for (const head of ["AL07", "a(", "x"]) {
        for (const tail of ["(fim da frase)", ",", ".", "²", ")"]) {
          it(`${JSON.stringify(head)} + ${name} + ${JSON.stringify(tail)}: nenhum hífen a mais`, async () => {
            const blocks = LEADS.map((lead) => paragraph([...text(lead + head), ...math(latex), ...text(tail)]));
            expect(hyphens(await printed(blocks))).toBe(own * LEADS.length);
          });
        }
      }
    }

    it("duas fórmulas coladas: nenhum hífen entre elas", async () => {
      const blocks = LEADS.map((lead) => paragraph([...text(lead), ...math(AL07), ...math(AL07), ...text(" fim")]));
      expect(hyphens(await printed(blocks))).toBe(2 * LEADS.length);
    });

    it("a emenda não acrescenta caractere visível: o texto, na ordem, é o mesmo", async () => {
      const lines = await printed([paragraph([...text("a("), ...math(SHORT), ...text(")."), ...math(SHORT)])]);
      expect(lines.join("").replace(/[\s\u00a0]+/g, "")).toMatch(/^a\(x\+y\)\.x\+y/);
    });
  });
});
