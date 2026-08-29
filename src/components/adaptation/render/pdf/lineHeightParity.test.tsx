/**
 * Contrato de entrelinha do PDF (achado 0429).
 *
 * O `@react-pdf` resolve um `lineHeight` numérico contra o `fontSize` do MESMO
 * nó de estilo e propaga aos filhos o resultado já congelado em pontos. Como o
 * único nó que declarava os dois era o `<Page>` (12 pt x 1,4), todo texto com
 * corpo próprio herdava 16,8 pt absolutos: a fórmula em bloco (16,87 pt) saía
 * com entrelinha 1,0 (linhas coladas), o título de nível 1 (18 pt) com menos
 * entrelinha do que o próprio corpo da fonte, e instrução/legenda saíam mais
 * espaçadas do que na folha em que o professor paginou a prova.
 *
 * Na tela o token é uma RAZÃO (CSS multiplica pelo `font-size` de cada
 * elemento). Este teste trava a mesma leitura no papel: quem declara corpo
 * próprio declara também a razão, no mesmo nó.
 */

import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { AdaptationPdf } from "./AdaptationPdf";
import { BASE_FONT_PT, BASE_LINE_HEIGHT } from "../pageTokens";
import { renderDocument } from "../__fixtures__/renderDocument";
import type { PanelSettings } from "@/components/adaptation/export/panelSettings";

type Styleish = { fontSize?: number; lineHeight?: number };

const settings: PanelSettings = {
  header: {
    title: "Prova de Matemática",
    school: "Escola Municipal",
    teacher: "Ana",
    date: "2026-08-29",
  },
  pageBreakPerQuestion: false,
};

/** Junta os estilos de um nó (objeto ou array) numa lista plana. */
function stylesOf(node: ReactElement): Styleish[] {
  const style = (node.props as { style?: unknown }).style;
  if (Array.isArray(style)) return style.filter((s) => typeof s === "object" && s !== null);
  if (typeof style === "object" && style !== null) return [style as Styleish];
  return [];
}

/**
 * Percorre a árvore renderizando componentes de função (como o walk do
 * `AdaptationPdf.test`) e devolve os estilos que declaram `fontSize`.
 *
 * O rodapé fica de fora: é um `<Text fixed render>` de uma linha só,
 * posicionado em absoluto, e mexer no `lineHeight` dele é justamente o que o
 * achado `0120` mostra ser capaz de sumir com o rodapé do arquivo.
 */
function sizedStyles(node: unknown, out: Styleish[] = []): Styleish[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((child) => sizedStyles(child, out));
    return out;
  }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement;
  if ((el.props as { fixed?: boolean }).fixed === true) return out;
  for (const style of stylesOf(el)) {
    if (typeof style.fontSize === "number") out.push(style);
  }
  if (typeof el.type === "function") {
    sizedStyles((el.type as (p: unknown) => unknown)(el.props), out);
  }
  sizedStyles((el.props as { children?: unknown }).children, out);
  return out;
}

/**
 * O run inline de fórmula é a única exceção deliberada (achado 0430): ele
 * carrega o corpo inflado da compensação de caixa alta da Courier, e como o
 * textkit dimensiona a linha pelo run mais alto, repetir a razão cheia ali
 * esticaria o parágrafo INTEIRO. Lá o contrato é o produto, não a razão: o
 * avanço tem que ser o do corpo do documento.
 */
function avancaComoOCorpo(s: Styleish): boolean {
  return Math.abs((s.fontSize ?? 0) * (s.lineHeight ?? 0) - BASE_FONT_PT * BASE_LINE_HEIGHT) < 1e-9;
}

describe("entrelinha do PDF (achado 0429)", () => {
  it("declara a razão junto de todo corpo próprio, para o valor não congelar no <Page>", () => {
    const styles = sizedStyles(AdaptationPdf({ document: renderDocument, settings }));

    expect(styles.length).toBeGreaterThan(0);
    const semRazao = styles.filter(
      (s) => s.lineHeight !== BASE_LINE_HEIGHT && !avancaComoOCorpo(s),
    );
    expect(semRazao).toEqual([]);
  });
});
