/**
 * Vão em volta da fórmula em BLOCO no PDF (achado 0407).
 *
 * O Yoga do `@react-pdf` não colapsa margens. Enquanto `PdfMath` usava
 * `marginVertical`, a junta "parágrafo → fórmula" somava o `marginBottom` do
 * parágrafo ao `marginTop` da fórmula e valia o dobro de qualquer outra junta
 * do documento: no papel a fórmula descia e colava na questão seguinte,
 * enquanto na prévia ela respirava igual dos dois lados. Além disso
 * `spacingAfter` ("espaço depois deste bloco") acabava empurrando o bloco
 * ANTERIOR, efeito que nenhuma UI anuncia.
 *
 * A garantia daqui: a fórmula espaça só para baixo, como todo outro bloco de
 * texto do renderer (`PdfLeafBlocks`).
 */

import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { PdfMath } from "./PdfMath";
import { PdfParagraph } from "./PdfLeafBlocks";

type Margins = {
  marginVertical?: number;
  marginTop?: number;
  marginBottom?: number;
};

const outerStyle = (el: ReactElement): Margins => (el.props as { style: Margins }).style;

const mathBlock = (style?: Block["style"]) =>
  ({ id: "m1", type: "blockMath", latex: "E=mc^2", style }) as Extract<
    Block,
    { type: "blockMath" }
  >;

describe("PdfMath — o vão da fórmula em bloco fica só abaixo", () => {
  it("não aplica margem acima com o gap padrão do documento", () => {
    const style = outerStyle(PdfMath({ block: mathBlock(), blockGap: 12 }) as ReactElement);

    expect(style.marginBottom).toBe(12);
    expect(style.marginVertical).toBeUndefined();
    expect(style.marginTop).toBeUndefined();
  });

  it("não deixa o spacingAfter do nó empurrar o bloco anterior", () => {
    const style = outerStyle(
      PdfMath({ block: mathBlock({ spacingAfter: 24 }), blockGap: 12 }) as ReactElement,
    );

    expect(style.marginBottom).toBe(18); // 24px → pt
    expect(style.marginVertical).toBeUndefined();
    expect(style.marginTop).toBeUndefined();
  });

  it("usa a mesma convenção de margem do parágrafo", () => {
    const paragraph = outerStyle(
      PdfParagraph({
        block: { id: "p1", type: "paragraph", content: [{ type: "text", text: "oi" }] } as Extract<
          Block,
          { type: "paragraph" }
        >,
        blockGap: 12,
      }) as ReactElement,
    );
    const math = outerStyle(PdfMath({ block: mathBlock(), blockGap: 12 }) as ReactElement);

    expect(math.marginBottom).toBe(paragraph.marginBottom);
    expect(math.marginTop).toBe(paragraph.marginTop);
  });
});
