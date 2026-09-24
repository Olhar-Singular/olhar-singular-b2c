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

/** Classes do ramo `i <= maxStepReached` (passo ja alcancado) do indicador de passos. */
function completedChipClasses(): string {
  const match = wizardSource.match(/i <= maxStepReached\s*\?\s*"([^"]+)"/);
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

/**
 * Filete do bloco de topo (achado 0341).
 *
 * O filete lateral e o unico sinal de "isto e um bloco de topo" na folha do
 * Revisar, e e ele que justifica o recuo horizontal que todo titulo e paragrafo
 * paga. Desenhado como `border-left` numa caixa com `border-radius: 0.5rem`, o
 * raio curvava as duas pontas do unico traco: num bloco de uma linha (22,4 px)
 * sobravam ~6 px de traco reto, e ainda a 1,37:1 sobre o papel branco (a WCAG
 * 2.2 pede 3:1 em objeto grafico, 1.4.11). No `h1` a cor era `transparent`: o
 * titulo pagava o recuo inteiro e nao recebia marca nenhuma.
 *
 * O filete vive agora num `::after` absoluto de altura total, imune ao raio, e
 * vale para os quatro tipos que a regra cobre.
 */
const TOP_BLOCK_TAGS = ["h1", "h2", "h3", "p"] as const;
const railSelector = (tag: string) =>
  `.tiptap:not(.rich-text-field) > ${tag}::after`;

describe("index.css — filete do bloco de topo", () => {
  it("desenha o filete fora do border-radius, de ponta a ponta", () => {
    const base = ruleBody(".tiptap:not(.rich-text-field) > p");
    expect(base, "filete como border-left e cortado pelo border-radius").not.toMatch(
      /border-left/,
    );

    const rail = ruleBody(railSelector("p"));
    expect(rail).toMatch(/position:\s*absolute/);
    // O `left` mora fora da caixa de conteudo desde o achado 0206.
    expect(rail).toMatch(/left:\s*-1rem/);
    expect(rail).toMatch(/top:\s*0/);
    expect(rail).toMatch(/bottom:\s*0/);
    expect(rail).toMatch(/width:\s*\dpx/);
  });

  it.each(TOP_BLOCK_TAGS)("marca o bloco de topo <%s> com o filete", (tag) => {
    expect(
      css.includes(`${railSelector(tag)},`) || css.includes(`${railSelector(tag)} {`),
      `sem filete para <${tag}>`,
    ).toBe(true);
    expect(
      ruleBody(`.tiptap:not(.rich-text-field) > ${tag}`, false),
    ).not.toMatch(/border-left/);
  });

  it("mantem o filete em 3:1 sobre o papel branco (WCAG 1.4.11)", () => {
    const rail = ruleBody(railSelector("p"));
    const match = rail.match(
      /background-color:\s*hsl\(var\(--([a-z0-9-]+)\)(?:\s*\/\s*([\d.]+))?\)/,
    );
    expect(match, `cor do filete nao reconhecida: ${rail}`).not.toBeNull();

    const alpha = match![2] ? Number(match![2]) : 1;
    const ink = mix(hslTokenToRgb(token(":root", match![1])), WHITE, alpha);
    expect(ratioRgb(ink, WHITE)).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Contraste da tinta de erro em texto pequeno (achado 0441).
 *
 * `--destructive` (0 72% 55%) foi calibrado como cor de FUNDO/ícone: como tinta
 * de texto ele chega a 4,37:1 sobre o papel branco da folha e 4,02:1 sobre o
 * `--background` do app — abaixo dos 4,5:1 que a WCAG 1.4.3 exige de texto
 * menor que 18,66 px. O aviso "Descrição desatualizada" dos nodeviews de
 * fórmula (12 px) é o único texto que denuncia a perda do `alt`, e era o item
 * de menor contraste do editor.
 *
 * O teste mede a razão do token que a fonte realmente usa, não a string da
 * classe: trocar o token de volta por um claro demais reprova de novo.
 */
const SIZE_UTILITIES = new Set([
  "xs", "sm", "base", "lg", "xl", "2xl", "3xl",
  "left", "right", "center", "justify", "start", "end",
]);

/** `text-surface-danger` -> token CSS `--sf-danger`; `text-foo` -> `--foo`. */
function cssTokenName(utility: string): string {
  return utility.startsWith("surface-")
    ? `sf-${utility.slice("surface-".length)}`
    : utility;
}

/** Tinta (`text-*`) declarada na primeira ocorrência de `anchor` na fonte. */
function inkTokenAt(source: string, anchor: RegExp, what: string): string {
  const at = source.search(anchor);
  expect(at, `âncora não encontrada em ${what}`).toBeGreaterThanOrEqual(0);
  const window = source.slice(Math.max(0, at - 240), at + 240);
  const inks = [...window.matchAll(/\btext-([a-z0-9-]+)\b/g)]
    .map((m) => m[1])
    .filter((name) => !SIZE_UTILITIES.has(name));
  expect(inks.length, `nenhuma tinta encontrada em ${what}`).toBeGreaterThan(0);
  return cssTokenName(inks[0]);
}

function readSource(relative: string): string {
  return readFileSync(path.resolve(__dirname, relative), "utf8");
}

describe("contraste da tinta de erro em texto pequeno (WCAG 1.4.3)", () => {
  it.each([
    [
      "aviso de alt desatualizado da fórmula inline",
      "./components/adaptation/canonical-editor/nodeviews/InlineMathNodeView.tsx",
      /data-testid="inlinemath-alt-stale"/,
    ],
    [
      "aviso de alt desatualizado da fórmula em bloco",
      "./components/adaptation/canonical-editor/nodeviews/BlockMathNodeView.tsx",
      /data-testid="blockmath-alt-stale"/,
    ],
  ])("%s atinge 4,5:1 sobre o papel da folha", (what, file, anchor) => {
    const ink = inkTokenAt(readSource(file), anchor, what);
    // A folha é branca nos dois temas (os --sf-* não são sobrescritos no .dark),
    // então o par certo é sempre a tinta de :root contra --sf-paper.
    const ratio = contrastRatio(token(":root", ink), token(":root", "sf-paper"));
    expect(ratio, `${what} (--${ink} sobre o papel)`).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    [
      "aviso de autosave interrompido",
      "./components/adaptation/CanonicalAdaptationWizard.tsx",
      /data-testid="capture-failure"/,
    ],
    [
      "erro do passo Barreiras",
      "./components/adaptation/steps/barriers/StepBarrierSelection.tsx",
      /<p role="alert"/,
    ],
    [
      "erro do passo Atividade",
      "./components/adaptation/steps/activity-input/StepActivityInput.tsx",
      /<p role="alert"/,
    ],
  ])("%s atinge 4,5:1 sobre o chrome do app nos dois temas", (what, file, anchor) => {
    const ink = inkTokenAt(readSource(file), anchor, what);
    for (const theme of [":root", ".dark"]) {
      for (const surface of ["background", "card"]) {
        expect(
          contrastRatio(token(theme, ink), token(theme, surface)),
          `${what}: --${ink} sobre --${surface} em ${theme}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

/**
 * Vao de bloco no topo e no pe da folha (achado 0186).
 *
 * `--doc-block-spacing` e vao ENTRE blocos: e assim que as duas superficies
 * impressas o gastam (a previa com `space-y-*`, isto e `> * + *`; o PDF so com
 * `marginBottom`). No editor a regra dava `margin: X 0` a todo bloco de topo,
 * inclusive ao primeiro e ao ultimo — e a margem nao colapsa para fora porque a
 * folha aplica padding acima do conteudo. Resultado: o titulo nascia 16 px
 * abaixo da margem impressa de 40 pt e o papel do Revisar carregava dois vaos
 * de bloco (32 px) que o PDF nao tem.
 */
describe("index.css — vao de bloco no primeiro e no ultimo bloco de topo", () => {
  it.each(TOP_BLOCK_TAGS)(
    "zera o vao acima do <%s> quando ele e o primeiro bloco",
    (tag) => {
      const selector = `.tiptap:not(.rich-text-field) > ${tag}:first-child`;
      expect(
        css.includes(`${selector},`) || css.includes(`${selector} {`),
        `sem reset de margin-top para o primeiro <${tag}>`,
      ).toBe(true);
    },
  );

  it.each(TOP_BLOCK_TAGS)(
    "zera o vao abaixo do <%s> quando ele e o ultimo bloco",
    (tag) => {
      const selector = `.tiptap:not(.rich-text-field) > ${tag}:last-child`;
      expect(
        css.includes(`${selector},`) || css.includes(`${selector} {`),
        `sem reset de margin-bottom para o ultimo <${tag}>`,
      ).toBe(true);
    },
  );

  it("os resets zeram so a margem da ponta, e depois da regra base", () => {
    expect(
      ruleBody(".tiptap:not(.rich-text-field) > p:first-child"),
    ).toMatch(/margin-top:\s*0\s*;/);
    expect(
      ruleBody(".tiptap:not(.rich-text-field) > p:last-child"),
    ).toMatch(/margin-bottom:\s*0\s*;/);
    expect(css.indexOf(".tiptap:not(.rich-text-field) > h1:first-child")).toBeGreaterThan(
      css.indexOf(".tiptap:not(.rich-text-field) > h1,"),
    );
  });
});

/**
 * Vao de bloco no topo e no pe quando o bloco extremo e um NODEVIEW (achado 0187).
 *
 * O reset do 0186 so alcanca `> h1, > h2, > h3, > p`. Questao, imagem, andaime e
 * formula em bloco sao NodeViews e carregam o vao numa classe propria
 * (`my-3`, de FOLHA_RAIL_HOST / ImageNodeView / ScaffoldNodeView), fora do
 * alcance daquele reset. Numa prova adaptada — que termina numa questao — a folha
 * do Revisar ficava com 12 px de papel a mais no pe que a previa e o PDF, e pior:
 * a margem colapsa para fora do `contentRef` (que nao tem padding nem borda), de
 * modo que `content.offsetHeight` nao a enxerga e o PageSheet calcula a
 * paginacao com uma altura menor que a desenhada.
 *
 * O wrapper de todo NodeView React do Tiptap carrega `data-node-view-wrapper`.
 */
describe("index.css — vao de bloco quando o bloco extremo e um nodeview", () => {
  const wrapper = ".tiptap:not(.rich-text-field) > [data-node-view-wrapper]";

  it("zera o vao acima do nodeview quando ele e o primeiro bloco", () => {
    expect(
      ruleBody(`${wrapper}:first-child`),
    ).toMatch(/margin-top:\s*0\s*;/);
  });

  it("zera o vao abaixo do nodeview quando ele e o ultimo bloco", () => {
    expect(
      ruleBody(`${wrapper}:last-child`),
    ).toMatch(/margin-bottom:\s*0\s*;/);
  });

  it("nao mexe no vao ENTRE blocos (o `my-3` do rail continua de pe)", () => {
    const body = ruleBody(`${wrapper}:first-child`);
    expect(body).not.toMatch(/margin-bottom/);
    expect(ruleBody(`${wrapper}:last-child`)).not.toMatch(/margin-top/);
  });
});

/**
 * Contraste do rotulo do botao destrutivo de confirmacao (achado 0355).
 *
 * `--destructive` foi calibrado como fundo/icone (grafico nao textual, 3:1).
 * Quando ele e o FUNDO de um botao que carrega rotulo de texto — o `Excluir`
 * dos alert dialogs, `text-sm font-medium`, 14 px — o par volta a ser regido
 * pela WCAG 1.4.3 e media 4,37:1. No hover era pior: `bg-destructive/90`
 * compunha o vermelho com o papel do dialogo e caia para 3,87:1, ou seja o
 * estado com o cursor sobre o botao que apaga o trabalho era o menos legivel.
 *
 * O teste mede o par real de cada call site (fundo composto sobre a superficie
 * do dialogo x tinta), em repouso e no hover, nos dois temas.
 */
const DESTRUCTIVE_ACTIONS: [string, string][] = [
  ["excluir imagem", "./components/adaptation/canonical-editor/nodeviews/ImageNodeView.tsx"],
  ["excluir questao", "./components/adaptation/canonical-editor/nodeviews/QuestionNodeView.tsx"],
  ["regerar adaptacao", "./components/adaptation/CanonicalAdaptationWizard.tsx"],
  ["excluir adaptacao e pasta", "./pages/AdaptacoesPage.tsx"],
];

/** Todo `className` do arquivo que pinta um fundo destrutivo com rotulo. */
function destructiveActionClasses(source: string): string[] {
  return [...source.matchAll(/className="([^"]*\bbg-destructive[a-z0-9-]*(?:\/\d+)?[^"]*)"/g)]
    .map((m) => m[1])
    .filter((classes) => /\btext-destructive-foreground\b/.test(classes));
}

/** `bg-x hover:bg-y/90` -> [["repouso", "x", 1], ["hover", "y", 0.9]] */
function buttonBackgrounds(classes: string): [string, string, number][] {
  const found = [
    ...classes.matchAll(/(?:^|\s)(hover:)?bg-([a-z0-9-]+?)(?:\/(\d+))?(?=\s|$)/g),
  ];
  expect(found.length, `nenhum fundo no botao: ${classes}`).toBeGreaterThan(0);
  return found.map((m) => [
    m[1] ? "hover" : "repouso",
    m[2],
    m[3] ? Number(m[3]) / 100 : 1,
  ]);
}

describe("contraste do botao destrutivo de confirmacao (WCAG 1.4.3)", () => {
  it.each(DESTRUCTIVE_ACTIONS)(
    "%s: rotulo a 4,5:1 em repouso e no hover, nos dois temas",
    (what, file) => {
      const sites = destructiveActionClasses(readSource(file));
      expect(sites.length, `nenhum botao destrutivo em ${what}`).toBeGreaterThan(0);

      for (const classes of sites) {
        const inkToken = classes.match(/\btext-(destructive-foreground)\b/)![1];
        for (const theme of [":root", ".dark"]) {
          // O AlertDialogContent do shadcn pinta `bg-background`.
          const surface = hslTokenToRgb(token(theme, "background"));
          const ink = hslTokenToRgb(token(theme, inkToken));
          for (const [state, bgToken, alpha] of buttonBackgrounds(classes)) {
            const bg = mix(hslTokenToRgb(token(theme, bgToken)), surface, alpha);
            expect(
              ratioRgb(ink, bg),
              `${what} (${state}): --${inkToken} sobre --${bgToken}/${alpha} em ${theme}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    },
  );
});

/**
 * Indicador de foco dos campos da folha, de verdade (achado 0212).
 *
 * O achado 0209 acrescentou `focus-visible:outline-2/-offset-2/-ring` ao campo,
 * e o teste que o acompanhou olhava so para a STRING de classe — ficou verde com
 * o bug de pe. Duas coisas de CASCATA derrubavam o indicador antes da tela:
 *
 * 1. `.tiptap:focus { outline: none }` alcanca o editavel do RichTextField (ele
 *    carrega `tiptap` entre as classes). Mesma especificidade (0,2,0) da utility
 *    `:focus-visible`, mas a regra mora FORA de `@layer`, depois das utilities —
 *    ganha por ordem de fonte. E `outline` e atalho: zera o `outline-style`.
 * 2. No Tailwind 3, `outline-2`/`-offset-2`/`-ring` dao largura, offset e cor —
 *    nenhum da `outline-style`. Quem daria e o `outline: auto` do user-agent,
 *    justamente o que o item 1 apaga.
 *
 * Por isso o teste olha para os dois arquivos: o reset so pode valer para foco
 * de MOUSE (`:not(:focus-visible)`) e a classe precisa declarar o estilo.
 */
describe("foco visivel dos campos da folha (WCAG 2.4.7)", () => {
  const richTextFieldSource = readSource(
    "./components/adaptation/canonical-editor/RichTextField.tsx",
  );

  it("o reset do .tiptap nao apaga o foco de teclado", () => {
    expect(
      ruleBody(".tiptap:focus", false),
      ".tiptap:focus { outline: none } apaga o indicador de teclado",
    ).not.toMatch(/outline/);
    expect(ruleBody(".tiptap:focus:not(:focus-visible)")).toMatch(
      /outline:\s*none/,
    );
  });

  it("o campo declara outline-style proprio, sem depender do user-agent", () => {
    // So os literais de classe: comentario nenhum entra na conta.
    const classes = [
      ...richTextFieldSource.matchAll(/"([^"\n]*)"/g),
    ].flatMap((m) => m[1].trim().split(/\s+/));
    expect(
      classes.filter((c) => c.startsWith("focus-visible:outline")).length,
      "classe de foco nao encontrada no RichTextField",
    ).toBeGreaterThan(0);
    expect(classes, "sem outline-style (focus-visible:outline)").toContain(
      "focus-visible:outline",
    );
    expect(classes).toContain("focus-visible:outline-2");
    expect(classes).toContain("focus-visible:outline-offset-2");
    expect(classes).toContain("focus-visible:outline-ring");
  });
});

/**
 * Contraste da tinta secundaria (--muted-foreground) — achado 0106.
 *
 * O contador "Passo N de 6" do wizard do Adaptar (`text-xs text-muted-foreground`)
 * e o unico lugar em TEXTO que diz em que ponto do fluxo o usuario esta (o stepper
 * acima e grafico). Com `--muted-foreground: 195 10% 45%` sobre o `--background`
 * o par ficava em 4,23:1, abaixo do minimo da WCAG 1.4.3 para texto normal — e
 * 12 px nao alcanca a excecao de texto grande.
 */
describe("index.css — contraste da tinta secundaria (muted-foreground)", () => {
  it.each([
    [":root", "background"],
    [":root", "card"],
    [":root", "popover"],
    [":root", "muted"],
    [".dark", "background"],
    [".dark", "card"],
    [".dark", "popover"],
    [".dark", "muted"],
  ])("%s: --muted-foreground atinge 4,5:1 sobre --%s", (selector, surface) => {
    const ratio = contrastRatio(
      token(selector, "muted-foreground"),
      token(selector, surface),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * Rotulo de tipo de bloco fora da arvore de acessibilidade (achado 0107).
 *
 * O rotulo cinza "TÍTULO"/"SEÇÃO"/"PARÁGRAFO" e chrome de EDICAO, desenhado por
 * `content` de `::before` — e `content` entra no calculo do accessible name no
 * Chrome. Resultado: o mesmo documento anunciava `heading "TÍTULO Atividade
 * adaptada"` no Revisar e `heading "Atividade adaptada"` no Exportar (renderer
 * read-only), e a navegacao por cabecalhos do leitor de tela ganhava palavras
 * que nao existem no documento.
 *
 * A forma `content: "Título" / ""` mantem o rotulo na tela e publica texto
 * alternativo VAZIO para a acessibilidade (CSS Generated Content, alt text).
 */
describe("index.css — rotulo de tipo de bloco nao entra no nome acessivel", () => {
  it.each([
    ["h1", "Título"],
    // h2 divide a regra com h3 (o `ruleBody` casa o ultimo seletor da lista).
    ["h3", "Seção"],
    ["p", "Parágrafo"],
  ])("<%s>: o rotulo '%s' declara texto alternativo vazio", (tag, label) => {
    const body = ruleBody(`.tiptap:not(.rich-text-field) > ${tag}::before`);
    expect(body, `rotulo '${label}' ausente em <${tag}>`).toContain(`"${label}"`);
    expect(
      body,
      `content de <${tag}> sem alt vazio: o rotulo vaza para o accessible name`,
    ).toMatch(new RegExp(`content:\\s*"${label}"\\s*/\\s*"";`));
  });
});

/**
 * Contraste do rotulo de tipo de bloco sobre o papel (achado 0322).
 *
 * O rotulo "TÍTULO"/"SEÇÃO"/"PARÁGRAFO" e desenhado a 9 px (0.5625rem) sobre o
 * branco da folha: texto normal, entao a WCAG 1.4.3 pede 4,5:1. A cor era
 * `hsl(var(--muted-foreground) / 0.7)`, que compoe com o papel em rgb(149,161,165)
 * e cai para 2,55:1 — sao os unicos elementos que dizem o que cada faixa da folha
 * e, na superficie onde o usuario precisa distinguir chrome de texto impresso.
 *
 * Alem da opacidade, o token estava errado de familia: `--muted-foreground` e do
 * tema do app e vira `195 10% 71%` no `.dark`, enquanto a folha e branca nos dois
 * temas (os `--sf-*` nao tem override no `.dark`). Chrome sobre o papel usa a
 * paleta do papel — mesma regra que o filete do bloco ja segue.
 */
describe("index.css — contraste do rotulo de tipo de bloco (achado 0322)", () => {
  /** Cor declarada na regra do rotulo, resolvida contra o papel branco. */
  function labelInk(): [number, number, number] {
    const body = ruleBody(".tiptap:not(.rich-text-field) > p::before");
    const match = body.match(
      /(?:^|[\s;])color:\s*hsl\(var\(--([a-z0-9-]+)\)(?:\s*\/\s*([\d.]+))?\)/,
    );
    expect(match, `cor do rotulo nao reconhecida: ${body}`).not.toBeNull();
    const alpha = match![2] ? Number(match![2]) : 1;
    return mix(hslTokenToRgb(token(":root", match![1])), WHITE, alpha);
  }

  it("mantem o rotulo de 9 px em 4,5:1 sobre o papel branco (WCAG 1.4.3)", () => {
    expect(ratioRgb(labelInk(), WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("usa um token da folha, que o tema escuro nao reescreve", () => {
    const body = ruleBody(".tiptap:not(.rich-text-field) > p::before");
    const name = body.match(/(?:^|[\s;])color:\s*hsl\(var\(--([a-z0-9-]+)\)/)![1];
    expect(
      themeBody(".dark"),
      `--${name} muda no tema escuro, mas o papel continua branco`,
    ).not.toMatch(new RegExp(`--${name}\\s*:`));
  });
});

/**
 * Coluna de texto do bloco de topo (achado 0206).
 *
 * `padding: 0 1rem` no bloco de topo estreitava a coluna do Revisar em 16 px de
 * cada lado: a MESMA frase quebrava em pontos diferentes na folha e no papel, e
 * dentro da propria folha titulo e paragrafo desalinhavam da imagem, da legenda
 * e do ordinal da questao (esses nascem na margem de 40 pt). O padding vertical
 * ja tinha caido pelo mesmo motivo no achado 0102 — mudava a altura; o
 * horizontal muda a largura da linha, que e onde o texto quebra.
 *
 * O chrome continua: filete e rotulo sao absolutos e agora vivem FORA da caixa
 * de conteudo (left negativo / 0), sem consumir largura de linha.
 */
describe("index.css — coluna de texto do bloco de topo", () => {
  /** Valor `left` declarado na regra, em rem (px convertido a rem). */
  function leftInRem(body: string): number {
    const match = body.match(/left:\s*(-?[\d.]+)(rem|px)?\s*;/);
    expect(match, `sem 'left' na regra: ${body}`).not.toBeNull();
    const value = Number(match![1]);
    return match![2] === "px" ? value / 16 : value;
  }

  it("nao paga recuo horizontal: a linha quebra onde quebra no PDF", () => {
    // A regra e compartilhada pelos quatro blocos de topo; `ruleBody` casa pelo
    // ultimo seletor da lista, entao `> p` e a porta de entrada dela.
    const body = ruleBody(".tiptap:not(.rich-text-field) > p");
    const declarations = [
      ...body.matchAll(/(?:^|;|\n)\s*padding(-left|-right|-inline[a-z-]*)?\s*:\s*([^;]+);/g),
    ];
    for (const [, side, value] of declarations) {
      const parts = value.trim().split(/\s+/);
      // padding: A | A B | A B C | A B C D -> horizontais sao [1] e [3] ?? [1]
      const horizontals = side
        ? [value.trim()]
        : [parts[1] ?? parts[0], parts[3] ?? parts[1] ?? parts[0]];
      for (const px of horizontals) {
        expect(
          parseFloat(px),
          `bloco de topo recua o texto impresso: padding${side ?? ""}: ${value.trim()}`,
        ).toBe(0);
      }
    }
  });

  it("o filete vive fora da caixa de conteudo", () => {
    expect(
      leftInRem(ruleBody(railSelector("p"))),
      "filete dentro da caixa: ou come largura de linha, ou sobrepoe o texto",
    ).toBeLessThan(0);
  });

  it("o rotulo do bloco comeca na mesma vertical do texto", () => {
    expect(
      leftInRem(ruleBody(".tiptap:not(.rich-text-field) > p::before")),
    ).toBe(0);
  });
});

/**
 * Alvo de toque do chrome que vive DENTRO da folha (achado 0236).
 *
 * A folha inteira e desenhada num `transform: scale(...)` que vai do ajuste
 * (0,4 no piso) ate 1, e o chrome de edicao viaja dentro dela: em 390px os
 * botoes de 28px do rail chegavam ao dedo com 21px, abaixo dos 24x24 CSS px do
 * WCAG 2.2 SC 2.5.8 (AA). Como a escala e dinamica, o piso tem que ser
 * dinamico tambem: em px de folha, dividido pela escala que o `PageSheet`
 * publica em `--folha-scale`.
 */
describe("index.css — alvo de toque do chrome da folha (achado 0236)", () => {
  it("dimensiona o alvo em px de tela, contra-escalando a folha", () => {
    const body = ruleBody(".folha-touch-target");
    expect(body).toMatch(/min-width:\s*calc\(24px\s*\/\s*var\(--folha-scale/);
    expect(body).toMatch(/min-height:\s*calc\(24px\s*\/\s*var\(--folha-scale/);
  });

  it("cresce a reserva do vao do rail junto com o alvo, em ponteiro grosso", () => {
    // O rail e uma caixa OPACA ancorada acima do bloco (0233): se o botao
    // cresce e o vao continua em 2,5rem de folha, o rail volta a ser desenhado
    // sobre o texto impresso do bloco de cima.
    expect(css).toMatch(
      /@media \(hover: none\) \{\s*\.folha-rail-host \{\s*margin-top:\s*calc\(2\.5rem\s*\/\s*var\(--folha-scale/,
    );
  });

  it("cresce a mesma reserva quando o teclado acende o rail", () => {
    expect(
      ruleBody(".folha-rail-host:has(.folha-rail:focus-within)"),
    ).toMatch(/margin-top:\s*calc\(2\.5rem\s*\/\s*var\(--folha-scale/);
  });
});

/**
 * Anel de foco dos campos de texto compartilhados (achado 0422).
 *
 * `src/components/ui/input.tsx` e `textarea.tsx` (arquivos gerados, protegidos)
 * terminam com `focus-visible:outline-none focus-visible:ring-0`, que compila
 * para `.focus-visible\:outline-none:focus-visible`, especificidade (0,2,0),
 * acima dos (0,1,0) da regra global `:focus-visible`. O unico indicador de foco
 * virava `border-ring/40`: 1,4:1 contra o estado de repouso, longe dos 3:1 do
 * WCAG 2.4.13. Como os componentes nao podem ser editados, o anel volta pelo
 * CSS global, num seletor com especificidade suficiente para vencer (0,2,0).
 */
describe("index.css — anel de foco de input/textarea (achado 0422)", () => {
  /** Especificidade (ids, classes/pseudo-classes, elementos) de um seletor composto. */
  function specificity(selector: string): [number, number, number] {
    // `\:` dentro do nome da classe nao e pseudo-classe: neutraliza os escapes.
    const s = selector.replace(/\\./g, "x");
    const ids = s.match(/#[\w-]+/g)?.length ?? 0;
    const classes =
      (s.match(/\.[\w-]+/g)?.length ?? 0) +
      (s.match(/\[[^\]]+\]/g)?.length ?? 0) +
      (s.match(/(?<!:):[\w-]+(?:\([^)]*\))?/g)?.length ?? 0);
    const elements = s.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g)?.length ?? 0;
    return [ids, classes, elements];
  }

  function beats(a: number[], b: number[]): boolean {
    for (let i = 0; i < 3; i += 1) {
      if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
  }

  /** Regra (seletor + corpo) cujo seletor termina em `alvo`. */
  function regraDe(alvo: string): { seletor: string; corpo: string } {
    const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const regras = [...semComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const regra = regras.find((m) =>
      m[1].split(",").some((s) => s.trim().endsWith(alvo)),
    );
    expect(regra, `nenhuma regra CSS alcanca ${alvo}`).toBeDefined();
    const seletor = regra![1]
      .split(",")
      .map((s) => s.trim())
      .find((s) => s.endsWith(alvo))!;
    return { seletor, corpo: regra![2] };
  }

  // Especificidade da regra que o componente gerado injeta nos utilitarios.
  const utilitario = specificity(".focus-visible\\:outline-none:focus-visible");

  const alvos = ["input:focus-visible", "textarea:focus-visible"];

  it("mede (0,2,0) para o utilitario que suprime o anel", () => {
    expect(utilitario).toEqual([0, 2, 0]);
  });

  it.each(alvos)("repoe o anel do projeto em %s", (alvo) => {
    const { corpo } = regraDe(alvo);
    expect(corpo).toMatch(/outline-2/);
    expect(corpo).toMatch(/outline-offset-2/);
    expect(corpo).toMatch(/outline-ring/);
  });

  it.each(alvos)("vence focus-visible:outline-none em %s", (alvo) => {
    const { seletor } = regraDe(alvo);
    expect(
      beats(specificity(seletor), utilitario),
      `${seletor} nao vence (0,2,0)`,
    ).toBe(true);
  });

  it("nao arredonda o campo de novo ao repor o anel", () => {
    // A regra global traz `rounded-sm`; herdar isso aqui achataria o
    // `rounded-md` do proprio Input.
    expect(regraDe("input:focus-visible").corpo).not.toMatch(/rounded-sm/);
  });
});
