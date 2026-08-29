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

/**
 * Contraste da barra lateral de navegacao (achado 0330 da caca autonoma).
 *
 * Todo o texto da sidebar e `--primary-foreground` (branco puro) rebaixado por
 * alfa sobre `.gradient-sidebar`. Como os fundos das pilulas/selos tambem eram
 * `bg-white/N`, a tinta descia e o fundo subia ao mesmo tempo: o selo do saldo
 * ficava em 2,87:1 e nem o item ativo alcancava os 4,5:1 da WCAG 1.4.3.
 *
 * O par real e sempre "tinta composta" x "fundo composto", medido no stop MAIS
 * CLARO do gradiente (pior caso do tema).
 */
const layoutSource = readFileSync(
  path.resolve(__dirname, "./components/common/Layout.tsx"),
  "utf8",
);

const WHITE: [number, number, number] = [1, 1, 1];
const BLACK: [number, number, number] = [0, 0, 0];

/** Stops `hsl(...)` do gradiente da sidebar, em canais sRGB 0..1. */
function sidebarStops(selector: string): [number, number, number][] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`\\n\\s*${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `regra CSS nao encontrada: ${selector}`).not.toBeNull();
  const stops = [...match![1].matchAll(/hsl\(([^)]+)\)/g)].map((m) =>
    hslTokenToRgb(m[1]),
  );
  expect(stops.length, `gradiente sem stops: ${selector}`).toBeGreaterThan(0);
  return stops;
}

/** `bg-white/15 hover:bg-black/10` -> superficies compostas sobre `stop`. */
function surfaces(classes: string, stop: [number, number, number]) {
  const found = [...classes.matchAll(/(?:^|\s)(?:hover:)?bg-(white|black)\/(\d+)\b/g)];
  const list = found.map((m) => ({
    label: `${m[1]}/${m[2]}`,
    rgb: mix(m[1] === "white" ? WHITE : BLACK, stop, Number(m[2]) / 100),
  }));
  return list.length > 0 ? list : [{ label: "gradiente", rgb: stop }];
}

/** Alfas de `text-primary-foreground[/N]`; vazio = herda do ancestral. */
function inkAlphas(classes: string): number[] {
  return [...classes.matchAll(/(?:^|\s)(?:hover:)?text-primary-foreground(?:\/(\d+))?\b/g)]
    .map((m) => (m[1] ? Number(m[1]) / 100 : 1));
}

function linkBranches(): { active: string; inactive: string } {
  const match = layoutSource.match(/isActive\(path\)\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/);
  expect(match, "ramos do linkClass nao encontrados no Layout").not.toBeNull();
  return { active: match![1], inactive: match![2] };
}

/** As duas copias (desktop e mobile) do selo de saldo de creditos. */
function creditBadgeClasses(): string[] {
  const found = [...layoutSource.matchAll(/className="([^"]*tabular-nums[^"]*)"/g)].map(
    (m) => m[1],
  );
  expect(found.length, "selo do saldo nao encontrado no Layout").toBe(2);
  return found;
}

function disclaimerClasses(): string {
  const match = layoutSource.match(/className="([^"]+)"\s*role="note"/);
  expect(match, "disclaimer da sidebar nao encontrado no Layout").not.toBeNull();
  return match![1];
}

function expectReadable(
  classes: string,
  stops: [number, number, number][],
  inheritedInk: number[],
  what: string,
) {
  const own = inkAlphas(classes);
  const alphas = own.length > 0 ? own : inheritedInk;
  expect(alphas.length, `sem tinta conhecida em ${what}`).toBeGreaterThan(0);
  for (const stop of stops) {
    for (const surface of surfaces(classes, stop)) {
      for (const alpha of alphas) {
        const ink = mix(WHITE, surface.rgb, alpha);
        expect(
          ratioRgb(ink, surface.rgb),
          `${what}: branco/${alpha * 100} sobre ${surface.label}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
}

describe("Layout — contraste da barra lateral sobre o gradiente", () => {
  it.each([
    [".gradient-sidebar", "tema claro"],
    [".dark .gradient-sidebar", "tema escuro"],
  ])("%s (%s) mantem toda a navegacao em 4,5:1", (selector) => {
    const stops = sidebarStops(selector);
    const { active, inactive } = linkBranches();

    expectReadable(active, stops, [], "item ativo");
    expectReadable(inactive, stops, [], "item inativo");
    for (const badge of creditBadgeClasses()) {
      expectReadable(badge, stops, inkAlphas(inactive), "selo do saldo");
    }
    expectReadable(disclaimerClasses(), stops, [], "disclaimer");
  });
});

/**
 * Vao entre paragrafos do MESMO enunciado (achado 0171).
 *
 * A regra de espacamento de bloco usa o combinador `>`, de proposito: ela so
 * alcanca os blocos de topo do editor. O preflight do Tailwind zera a margem de
 * `<p>`, entao dois paragrafos dentro do stem de uma questao ficavam COLADOS na
 * folha do Revisar (0 px) enquanto a previa abria 8 px e o PDF 12 pt. A folha
 * existe para antecipar o impresso: precisa do mesmo vao interno das outras
 * duas superficies.
 */
describe("index.css — vao entre paragrafos do stem da questao", () => {
  it("separa paragrafos irmaos dentro do stem com o vao interno da questao", () => {
    expect(ruleBody(".tiptap .question-stem p + p")).toMatch(
      /margin-top:\s*0\.5rem/,
    );
  });
});
