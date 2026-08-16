import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Paridade editor x PDF para os blocos de topo do editor canonico.
 *
 * O chrome de edicao (rotulo ::before, filete, padding do container) pode existir,
 * mas nao pode alterar alinhamento, estilo ou cor do texto que sera impresso:
 * HeadingBlockView/ParagraphBlockView e os leaf blocks do PDF nao centralizam nem
 * italicizam nada. Achado 0002 da caca autonoma.
 */
const css = readFileSync(path.resolve(__dirname, "./index.css"), "utf8");

/**
 * Junta o corpo de TODAS as regras cujo ultimo seletor e exatamente `selector`.
 * Com `required`, falha se o seletor sumiu (protege contra teste que passa a
 * verde so porque a regra foi renomeada).
 */
function ruleBody(selector: string, required = true): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [
    ...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g")),
  ];
  if (required) {
    expect(
      matches.length,
      `regra CSS nao encontrada: ${selector}`,
    ).toBeGreaterThan(0);
  }
  return matches.map((m) => m[1]).join("\n");
}

describe("index.css — blocos de topo do editor canonico", () => {
  it("nao centraliza o h1 de topo (PDF alinha a esquerda)", () => {
    expect(ruleBody(".tiptap:not(.rich-text-field) > h1")).not.toMatch(
      /text-align/,
    );
  });

  it("nao italiciza nem recolore o paragrafo de topo", () => {
    const body = ruleBody(".tiptap:not(.rich-text-field) > p", false);
    expect(body).not.toMatch(/font-style/);
    expect(body).not.toMatch(/(^|[\s;])color\s*:/);
  });

  it("nao rotula todo paragrafo de topo como 'Instrução'", () => {
    expect(ruleBody(".tiptap:not(.rich-text-field) > p::before")).not.toMatch(
      /Instrução/,
    );
  });
});
