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

/**
 * Contraste do par accent / accent-foreground (achado 0136 da caca autonoma).
 *
 * `focus:bg-accent focus:text-accent-foreground` pinta a opcao destacada de
 * Select/DropdownMenu. No tema claro o par era dourado + branco (2,66:1): mover
 * o teclado pela lista piorava a leitura justamente do item em foco.
 */
function themeBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
  expect(match, `bloco de tema nao encontrado: ${selector}`).not.toBeNull();
  return match![1];
}

function token(themeSelector: string, name: string): string {
  const body = themeBody(themeSelector);
  const matches = [...body.matchAll(new RegExp(`--${name}\\s*:\\s*([^;]+);`, "g"))];
  expect(matches.length, `token --${name} ausente em ${themeSelector}`).toBeGreaterThan(0);
  return matches[matches.length - 1][1].trim();
}

/** Converte "40 55% 50%" (formato dos tokens shadcn) em canais sRGB 0..1. */
function hslTokenToRgb(value: string): [number, number, number] {
  const [hRaw, sRaw, lRaw] = value.split(/\s+/);
  const h = parseFloat(hRaw);
  const s = parseFloat(sRaw) / 100;
  const l = parseFloat(lRaw) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(h / 60) % 6;
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  return table[sector].map((v) => v + m) as [number, number, number];
}

function relativeLuminance(value: string): number {
  const [r, g, b] = hslTokenToRgb(value).map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("index.css — contraste do item destacado (accent)", () => {
  it.each([
    [":root", "tema claro"],
    [".dark", "tema escuro"],
  ])("%s (%s) atinge 4,5:1 entre --accent-foreground e --accent", (selector) => {
    const ratio = contrastRatio(
      token(selector, "accent"),
      token(selector, "accent-foreground"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * Contraste do chip de passo ja concluido do wizard (achado 0144 da caca autonoma).
 *
 * Os chips 1..N-1 do indicador de passos sao botoes habilitados (`goTo(i)`) com
 * rotulo em `text-xs` (12 px), entao valem os 4,5:1 de texto normal da WCAG 1.4.3.
 * O fundo e translucido (`bg-primary/10`, `hover:bg-primary/20`), logo o par real e
 * a tinta contra a composicao da tinta diluida sobre `--background`.
 */
const wizardSource = readFileSync(
  path.resolve(__dirname, "./components/adaptation/CanonicalAdaptationWizard.tsx"),
  "utf8",
);

/** Classes do ramo `i < stepIndex` (passo ja concluido) do indicador de passos. */
function completedChipClasses(): string {
  const match = wizardSource.match(/i < stepIndex\s*\?\s*"([^"]+)"/);
  expect(match, "ramo do chip concluido nao encontrado no wizard").not.toBeNull();
  return match![1];
}

/** `bg-primary/10 hover:bg-primary/20` -> [["primary", 0.1], ["primary", 0.2]] */
function chipBackgrounds(classes: string): [string, number][] {
  const matches = [...classes.matchAll(/bg-([a-z-]+)(?:\/(\d+))?\b/g)];
  expect(matches.length, `nenhum fundo no chip: ${classes}`).toBeGreaterThan(0);
  return matches.map((m) => [m[1], m[2] ? Number(m[2]) / 100 : 1]);
}

function chipInk(classes: string): string {
  const match = classes.match(/(?:^|\s)text-([a-z-]+)\b/);
  expect(match, `nenhuma tinta no chip: ${classes}`).not.toBeNull();
  return match![1];
}

function mix(fg: [number, number, number], bg: [number, number, number], alpha: number) {
  return fg.map((v, i) => alpha * v + (1 - alpha) * bg[i]) as [number, number, number];
}

function ratioRgb(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminanceRgb(a), luminanceRgb(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function luminanceRgb(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("wizard — contraste do chip de passo concluido", () => {
  it.each([
    [":root", "tema claro"],
    [".dark", "tema escuro"],
  ])("%s (%s) atinge 4,5:1 em repouso e no hover", (selector) => {
    const classes = completedChipClasses();
    const ink = hslTokenToRgb(token(selector, chipInk(classes)));
    const pageBg = hslTokenToRgb(token(selector, "background"));

    for (const [bgToken, alpha] of chipBackgrounds(classes)) {
      const chipBg = mix(hslTokenToRgb(token(selector, bgToken)), pageBg, alpha);
      expect(ratioRgb(ink, chipBg), `fundo ${bgToken}/${alpha}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
