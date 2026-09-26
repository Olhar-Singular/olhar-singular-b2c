/**
 * Contrato de VÃO da divisória (achado 0188).
 *
 * O mesmo bloco `divider` gastava três quantidades de papel nas três superfícies:
 *
 * - prévia do Exportar: o `DividerView` trazia `my-4`, 16 px literais SOMADOS ao
 *   `rowGap: var(--doc-block-spacing)` do `CanonicalRenderer` — gap de flex não
 *   colapsa com margem. Dava 32 px de cada lado do filete, o dobro do papel, e
 *   era o único vão do documento que não respondia ao controle "Espaçamento"
 *   do popover Formato (mesma família dos achados 0114 e 0130);
 * - folha do Revisar: o nó não tem NodeView, o schema emite um `<hr>` seco, o
 *   preflight do Tailwind zera a margem de `hr` e a regra de espaçamento do
 *   editor só mirava `h1, h2, h3, p`. O filete nascia colado no bloco seguinte;
 * - PDF: `marginBottom: blockGap`, o valor certo.
 *
 * O vão do divisor é `--doc-block-spacing`, uma vez só, como título e parágrafo:
 * na prévia ele vem inteiro do `rowGap` (nada de margem própria) e no editor da
 * mesma regra de margem que os blocos de topo têm, com os resets de ponta do
 * achado 0186.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { DividerView } from "./blocks/DividerView";

const DIVIDER: Extract<Block, { type: "divider" }> = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "divider",
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

describe("divisória: paridade de vão entre as três superfícies", () => {
  it("não dá margem vertical própria ao filete da prévia do Exportar", () => {
    render(<DividerView block={DIVIDER} />);
    const hr = screen.getByTestId("divider");
    expect(
      hr.className,
      "o vão da prévia vem do rowGap do CanonicalRenderer, não de uma margem do bloco",
    ).not.toMatch(/\b(my|mt|mb)-/);
    expect(hr.style.marginTop).toBe("");
    expect(hr.style.marginBottom).toBe("");
  });

  it("dá ao <hr> do editor o vão de bloco do documento", () => {
    expect(ruleBody('.tiptap:not(.rich-text-field) > hr[data-type="divider"]')).toMatch(
      /margin:\s*var\(--doc-block-spacing,\s*1rem\)\s*0\s*;/,
    );
  });

  it("zera o vão do filete quando ele é o primeiro ou o último bloco", () => {
    expect(
      ruleBody('.tiptap:not(.rich-text-field) > hr[data-type="divider"]:first-child'),
    ).toMatch(/margin-top:\s*0\s*;/);
    expect(
      ruleBody('.tiptap:not(.rich-text-field) > hr[data-type="divider"]:last-child'),
    ).toMatch(/margin-bottom:\s*0\s*;/);
  });
});
