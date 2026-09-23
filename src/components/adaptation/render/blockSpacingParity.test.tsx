/**
 * Contrato de paridade do ESPAÇAMENTO ENTRE BLOCOS (achado 0114).
 *
 * `pageStyle.blockSpacing` é a origem única do vão entre dois blocos de topo: a
 * folha do Revisar lê `--doc-block-spacing` (emitido por `pageTokensToCss`) e o
 * PDF converte o mesmo px para pt. A prévia do Exportar era a exceção: fixava o
 * vão em `space-y-3` (12px), então o controle "Espaçamento" do popover Formato
 * mudava a folha e o arquivo e NÃO mudava a única tela feita para conferir o
 * impresso — que ainda por cima saía mais apertada que o papel (12px contra 16px).
 *
 * Aqui o contrato é a declaração de estilo (jsdom não resolve `var()` nem faz
 * layout): o contêiner da prévia precisa gastar o vão pelo token da folha.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { CanonicalRenderer } from "./CanonicalRenderer";
import { BASE_BLOCK_SPACING_PX, pageTokensToCss } from "./pageTokens";

const doc: CanonicalDocument = {
  version: 1,
  blocks: [
    { id: "b1", type: "heading", level: 1, content: [{ type: "text", text: "Prova" }] },
    { id: "b2", type: "paragraph", content: [{ type: "text", text: "Instruções" }] },
  ],
};

describe("espaçamento entre blocos — paridade prévia do Exportar × folha × PDF", () => {
  it("gasta o vão da prévia pelo token que a folha emite, e não por um valor fixo", () => {
    render(<CanonicalRenderer document={doc} />);
    const container = screen.getByTestId("canonical-renderer");
    expect(container.style.rowGap).toBe(
      `var(--doc-block-spacing, ${BASE_BLOCK_SPACING_PX}px)`,
    );
    // `gap` só vale em flex/grid, e no jsdom a classe do Tailwind não vira
    // layout: o contrato aqui é a declaração.
    expect(container).toHaveClass("flex", "flex-col");
  });

  it("não fixa mais o vão numa classe utilitária do Tailwind", () => {
    render(<CanonicalRenderer document={doc} />);
    expect(screen.getByTestId("canonical-renderer").className).not.toMatch(/space-y-/);
  });

  it("o fallback da prévia é o mesmo default canônico que a folha emite", () => {
    const css = pageTokensToCss() as Record<string, unknown>;
    expect(css["--doc-block-spacing"]).toBe(`${BASE_BLOCK_SPACING_PX}px`);
  });
});
