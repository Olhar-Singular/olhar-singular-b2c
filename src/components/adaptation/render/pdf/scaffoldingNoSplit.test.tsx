/**
 * A caixa do andaime não é partida pela virada de página (achado 0177).
 *
 * A `View` da caixa tem fundo, borda e canto arredondado. Sem `wrap={false}` o
 * react-pdf quebra qualquer `View` que não caiba e repinta fundo, borda e cantos
 * na folha seguinte: a página 2 abria com uma tira bege de 9,75 pt
 * (`SCAFFOLDING_PADDING_PT` + `RULE_WIDTH_PT`) e nada dentro, enquanto as duas
 * telas mostram a caixa sempre inteira. Ou a caixa cabe na folha corrente, ou
 * desce inteira para a seguinte.
 */

import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { PdfScaffolding } from "./PdfLeafBlocks";

const block = {
  id: "s1",
  type: "scaffolding",
  items: ["Leia o enunciado", "Sublinhe os dados", "Escreva a resposta"],
} as Extract<Block, { type: "scaffolding" }>;

describe("PdfScaffolding — moldura indivisível", () => {
  it("marca a caixa como não quebrável entre páginas", () => {
    const el = PdfScaffolding({ block }) as ReactElement;
    expect((el.props as { wrap?: boolean }).wrap).toBe(false);
  });
});
