/**
 * Contrato de VÃO da fórmula em bloco (achado 0189).
 *
 * A mesma fórmula media 25,3 px na folha do Revisar e 57,3 px na prévia do
 * Exportar. Os 32 px de diferença são `2 x 1em`: as margens que a folha de
 * estilo do próprio KaTeX aplica em `.katex-display` (`margin: 1em 0`), que
 *
 * - na folha do Revisar COLAPSAM para fora do `NodeViewWrapper` e somem dentro
 *   do vão do bloco (resultado certo por acidente, não por contrato: o vão
 *   ficava travado em 16 px e surdo ao controle "Espaçamento" do Formato);
 * - na prévia do Exportar ficam CONTIDAS, porque o bloco é item de flex do
 *   `CanonicalRenderer` e item de flex estabelece contexto de formatação
 *   próprio. E aí ainda somavam ao `rowGap` do `--doc-block-spacing` o `my-3`
 *   do próprio `BlockMathView` (gap de flex não colapsa com margem): 28 px de
 *   vão onde o papel imprime 16;
 * - no PDF não existem: `PdfMath` gasta só `marginBottom` (achado 0407).
 *
 * O subtree do KaTeX é decoração (mesma leitura do achado 0438): quem dá o vão
 * é o documento, uma vez só, como em título e parágrafo — `rowGap` na prévia,
 * `--doc-block-spacing` no editor, `marginBottom` no PDF.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { BlockMathView } from "./blocks/BlockMathView";

const MATH: Extract<Block, { type: "blockMath" }> = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "blockMath",
  latex: "a^2 + b^2 = c^2",
};

const css = readFileSync(path.resolve(__dirname, "../../../index.css"), "utf8");

/** Corpo das regras cujo seletor final é exatamente `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [
    ...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g")),
  ];
  expect(matches.length, `regra CSS não encontrada: ${selector}`).toBeGreaterThan(0);
  return matches.map((m) => m[1]).join("\n");
}

describe("fórmula em bloco: paridade de vão entre as três superfícies", () => {
  it("não dá margem vertical própria ao bloco da prévia do Exportar", () => {
    render(<BlockMathView block={MATH} />);
    const math = screen.getByTestId("block-math");
    expect(
      math.className,
      "o vão da prévia vem do rowGap do CanonicalRenderer, não de uma margem do bloco",
    ).not.toMatch(/\b(my|mt|mb)-/);
    expect(math.style.marginTop).toBe("");
    expect(math.style.marginBottom).toBe("");
  });

  it("zera o `margin: 1em 0` que o KaTeX aplica em .katex-display", () => {
    expect(ruleBody(".katex-display.katex-display")).toMatch(/margin:\s*0\s*;/);
  });

  it("dá à fórmula de topo do editor o vão de bloco do documento", () => {
    expect(
      ruleBody('.tiptap:not(.rich-text-field) > [data-testid="blockmath-node"]'),
    ).toMatch(/margin:\s*var\(--doc-block-spacing,\s*1rem\)\s*0\s*;/);
  });
});
