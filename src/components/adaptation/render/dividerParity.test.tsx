/**
 * Contrato de paridade da DIVISÓRIA (achado 0148).
 *
 * O bloco `divider` era desenhado com duas cores diferentes, ambas abaixo dos
 * 3:1 que a WCAG 1.4.11 exige de objeto gráfico: as duas telas (folha do Revisar
 * e prévia do Exportar) herdavam `--border`, token do chrome do app e nem sequer
 * cor de papel (rgb(218,224,226) = 1,33:1, praticamente invisível numa
 * fotocópia), e o PDF trazia `#999999` literal (2,85:1). O professor decidia
 * onde pôr a divisória numa superfície em que ela quase não aparece e recebia no
 * papel um traço nítido que nunca tinha visto.
 *
 * `RULE_COLOR` é o ponto único das TRÊS superfícies, na família de
 * `ANSWER_LINE_COLOR`: a folha do Revisar lê pela var `--doc-rule-color` (o
 * `<hr>` do editor é desenhado pelo CSS), a prévia do Exportar pelo estilo
 * inline de `DividerView` e o PDF por `PdfDivider`.
 *
 * A espessura do traço é problema separado (achado 0150).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { RULE_COLOR, pageTokensToCss } from "./pageTokens";
import { DividerView } from "./blocks/DividerView";
import { PdfDivider } from "./pdf/PdfLeafBlocks";

const DIVIDER: Extract<Block, { type: "divider" }> = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "divider",
};

/** "#767676" -> "rgb(118, 118, 118)", forma em que o jsdom devolve a cor. */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** Luminância relativa (WCAG 2.x) de uma cor `#rrggbb`. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

type PdfRuleStyle = { borderBottomColor?: string };

/** Varre a árvore do react-pdf atrás do estilo do traço. */
function findRuleStyle(node: unknown): PdfRuleStyle | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRuleStyle(child);
      if (found) return found;
    }
    return undefined;
  }
  const props = (node as ReactElement).props as
    | { style?: PdfRuleStyle; children?: unknown }
    | undefined;
  if (!props) return undefined;
  if (props.style?.borderBottomColor) return props.style;
  return findRuleStyle(props.children);
}

describe("divisória: paridade de cor entre as três superfícies", () => {
  it("usa uma cor com contraste >= 3:1 sobre o papel branco", () => {
    const ratio = (1 + 0.05) / (luminance(RULE_COLOR) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("publica RULE_COLOR na folha do Revisar pela var --doc-rule-color", () => {
    const css = pageTokensToCss() as Record<string, string>;
    expect(css["--doc-rule-color"]).toBe(RULE_COLOR);
  });

  it("desenha a divisória da prévia do Exportar com RULE_COLOR", () => {
    render(<DividerView block={DIVIDER} />);
    expect(getComputedStyle(screen.getByTestId("divider")).borderTopColor).toBe(
      hexToRgb(RULE_COLOR),
    );
  });

  it("desenha a divisória do PDF com RULE_COLOR", () => {
    expect(findRuleStyle(PdfDivider({ block: DIVIDER }))?.borderBottomColor).toBe(RULE_COLOR);
  });
});
