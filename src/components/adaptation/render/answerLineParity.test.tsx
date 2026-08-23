/**
 * Contrato de paridade da LINHA DE RESPOSTA (achado 0104).
 *
 * A pauta da questão aberta era desenhada com três cores diferentes nas três
 * superfícies (folha do Revisar via `border-surface-line-2`, prévia do Exportar
 * via `border-border` — token do chrome do app — e PDF via `#999999` literal),
 * todas abaixo do mínimo de 3:1 da WCAG 1.4.11 para objeto gráfico. Como é a
 * linha que o aluno usa no papel, ela precisa sobreviver a uma impressão em PB.
 *
 * Aqui trava-se o ponto único: as três superfícies leem `ANSWER_LINE_COLOR` de
 * `pageTokens`, e essa cor tem contraste >= 3:1 sobre o papel branco.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import {
  ANSWER_LINE_COLOR,
  ANSWER_LINE_GAP_PX,
  ANSWER_LINE_GAP_PT,
  ANSWER_LINE_WIDTH_PX,
  ANSWER_LINE_WIDTH_PT,
  ANSWER_LINE_DASH_PX,
  ANSWER_LINE_DASH_PT,
  ANSWER_LINE_DASH_SPACE_PX,
  ANSWER_LINE_DASH_SPACE_PT,
} from "./pageTokens";
import { OpenAnswerView } from "./answers/OpenAnswerView";
import { PdfAnswer } from "./pdf/PdfAnswer";
import { AnswerPreview } from "../canonical-editor/answer-editors/AnswerPreview";

// A questão aberta não usa RichTextField, mas o módulo do AnswerPreview importa
// o editor real; o mock mantém o teste leve (mesmo padrão de AnswerPreview.test).
vi.mock("../canonical-editor/RichTextField", () => ({
  RichTextField: () => <input />,
}));

const OPEN: Extract<QuestionAnswer, { kind: "open" }> = { kind: "open", answerLines: 2 };

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


type PaintCall = { method: string; args: unknown[] };
type Painter = Record<string, (...args: unknown[]) => unknown>;

/** Painter falso: registra a sequência de chamadas do `paint` do `Canvas`. */
function recordingPainter(calls: PaintCall[]): Painter {
  const painter: Painter = {};
  for (const method of [
    "save",
    "restore",
    "lineWidth",
    "lineCap",
    "strokeColor",
    "dash",
    "undash",
    "moveTo",
    "lineTo",
    "stroke",
  ]) {
    painter[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return painter;
    };
  }
  return painter;
}

type PaintFn = (painter: Painter, width: number, height: number) => unknown;

/** Varre a árvore do react-pdf atrás do `paint` do primeiro `Canvas`. */
function findPaint(node: unknown): PaintFn | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findPaint(child);
      if (found) return found;
    }
    return undefined;
  }
  const props = (node as ReactElement).props as
    | { paint?: PaintFn; children?: unknown }
    | undefined;
  if (!props) return undefined;
  if (typeof props.paint === "function") return props.paint;
  return findPaint(props.children);
}

/** Estilo do primeiro `Canvas` da árvore (a pauta do PDF). */
function findCanvasStyle(node: unknown): { marginBottom?: number } | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findCanvasStyle(child);
      if (found) return found;
    }
    return undefined;
  }
  const props = (node as ReactElement).props as
    | { paint?: unknown; style?: { marginBottom?: number }; children?: unknown }
    | undefined;
  if (!props) return undefined;
  if (typeof props.paint === "function") return props.style;
  return findCanvasStyle(props.children);
}

/** Roda o `paint` da pauta do PDF num painter falso e devolve a sequência. */
function paintCalls(): PaintCall[] {
  const calls: PaintCall[] = [];
  const paint = findPaint(PdfAnswer({ answer: OPEN }));
  expect(typeof paint).toBe("function");
  paint?.(recordingPainter(calls), 400, ANSWER_LINE_WIDTH_PT);
  return calls;
}

describe("linha de resposta — paridade de cor entre as três superfícies", () => {
  it("usa uma cor com contraste >= 3:1 sobre o papel branco", () => {
    const ratio = (1 + 0.05) / (luminance(ANSWER_LINE_COLOR) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("desenha a linha da prévia do Exportar com ANSWER_LINE_COLOR", () => {
    render(<OpenAnswerView answer={OPEN} />);
    const lines = screen.getByTestId("answer-open").children;
    expect(lines).toHaveLength(2);
    for (const line of Array.from(lines)) {
      expect(getComputedStyle(line).borderBottomColor).toBe(hexToRgb(ANSWER_LINE_COLOR));
    }
  });

  it("desenha a linha da folha do Revisar com ANSWER_LINE_COLOR", () => {
    render(<AnswerPreview answer={OPEN} onChange={() => {}} />);
    const lines = screen.getAllByTestId("preview-answer-line");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(getComputedStyle(line).borderBottomColor).toBe(hexToRgb(ANSWER_LINE_COLOR));
    }
  });

  it("desenha a linha do PDF com ANSWER_LINE_COLOR", () => {
    expect(paintCalls().find((c) => c.method === "strokeColor")?.args).toEqual([
      ANSWER_LINE_COLOR,
    ]);
  });
});

/**
 * Contrato de paridade do ESPAÇAMENTO da pauta (achado 0111).
 *
 * Cada superfície tinha o seu próprio valor escrito à mão — 18px de gap na folha
 * do Revisar, `space-y-3` (12px) na prévia do Exportar e 10pt (13,3px) de
 * `marginBottom` no PDF. O professor dimensionava a resposta pela folha e o aluno
 * recebia no papel ~25% menos altura por linha, justamente o que quebra para quem
 * escreve grande. `ANSWER_LINE_GAP_PX` é o ponto único; o PDF consome o mesmo
 * valor convertido para pt.
 */
describe("linha de resposta — paridade de espaçamento entre as três superfícies", () => {
  it("converte o gap para pt pela mesma razão 72/96 usada no resto do PDF", () => {
    expect(ANSWER_LINE_GAP_PT).toBeCloseTo(ANSWER_LINE_GAP_PX * (72 / 96), 5);
  });

  it("espaça a pauta da folha do Revisar por ANSWER_LINE_GAP_PX", () => {
    render(<AnswerPreview answer={OPEN} onChange={() => {}} />);
    const container = screen.getByTestId("answer-preview-open");
    expect(container.style.rowGap).toBe(`${ANSWER_LINE_GAP_PX}px`);
  });

  it("espaça a pauta da prévia do Exportar por ANSWER_LINE_GAP_PX", () => {
    render(<OpenAnswerView answer={OPEN} />);
    const container = screen.getByTestId("answer-open");
    expect(container.style.rowGap).toBe(`${ANSWER_LINE_GAP_PX}px`);
  });

  it("espaça a pauta do PDF pelo equivalente em pt de ANSWER_LINE_GAP_PX", () => {
    expect(findCanvasStyle(PdfAnswer({ answer: OPEN }))?.marginBottom).toBe(ANSWER_LINE_GAP_PT);
  });
});

/**
 * Contrato de paridade da ESPESSURA da pauta (achado 0145).
 *
 * Último resíduo da família 0011/0104/0111: cor, estilo e passo já vinham de
 * `pageTokens`, mas a espessura seguia escrita à mão uma vez por superfície — as
 * duas telas herdavam o `border-b` do Tailwind (1px CSS = 0,75pt) e o PDF trazia
 * `borderBottomWidth: 1` literal, que no papel é 1pt. A mesma pauta saía 33% mais
 * grossa impressa do que na tela em que a professora a conferiu.
 *
 * `ANSWER_LINE_WIDTH_PX` é o ponto único; o PDF consome o mesmo valor convertido
 * para pt pela razão 72/96, como os demais tokens.
 */
describe("linha de resposta — paridade de espessura entre as três superfícies", () => {
  it("converte a espessura para pt pela mesma razão 72/96 usada no resto do PDF", () => {
    expect(ANSWER_LINE_WIDTH_PT).toBeCloseTo(ANSWER_LINE_WIDTH_PX * (72 / 96), 5);
  });

  it("desenha a pauta da folha do Revisar com ANSWER_LINE_WIDTH_PX", () => {
    render(<AnswerPreview answer={OPEN} onChange={() => {}} />);
    for (const line of screen.getAllByTestId("preview-answer-line")) {
      expect(line.style.borderBottomWidth).toBe(`${ANSWER_LINE_WIDTH_PX}px`);
    }
  });

  it("desenha a pauta da prévia do Exportar com ANSWER_LINE_WIDTH_PX", () => {
    render(<OpenAnswerView answer={OPEN} />);
    for (const line of Array.from(screen.getByTestId("answer-open").children)) {
      expect((line as HTMLElement).style.borderBottomWidth).toBe(`${ANSWER_LINE_WIDTH_PX}px`);
    }
  });

  it("desenha a pauta do PDF pelo equivalente em pt de ANSWER_LINE_WIDTH_PX", () => {
    expect(paintCalls().find((c) => c.method === "lineWidth")?.args).toEqual([
      ANSWER_LINE_WIDTH_PT,
    ]);
  });
});

/**
 * Contrato de paridade da CADÊNCIA do tracejado (achado 0154).
 *
 * Cor, espessura e passo já eram ponto único (0104/0111/0145/0150), mas o ritmo
 * do tracejado continuava sendo o que cada motor decidia sozinho: as duas telas
 * usam o `border-dashed` do Tailwind (no Chrome, 3px de traço / 2px de vão para
 * uma borda de 1px) e o PDF derivava o dash da espessura
 * (`ctx.dash(w * 2, { space: w * 1.2 })`). Pior: como a cadência do @react-pdf é
 * FUNÇÃO da espessura, o 0145 — que baixou a borda de 1pt para 0,75pt — encolheu
 * o tracejado junto e levou a divergência de 17% para 56%. O papel saía quase
 * pontilhado onde a tela mostrava traços.
 *
 * `ANSWER_LINE_DASH_PX` / `ANSWER_LINE_DASH_SPACE_PX` são o ponto único; o PDF
 * pinta a pauta com esse dash explícito, para que nenhum ajuste futuro de
 * espessura volte a mexer no ritmo sem ninguém ver.
 */
describe("linha de resposta — paridade da cadência do tracejado", () => {
  it("converte a cadência para pt pela mesma razão 72/96 usada no resto do PDF", () => {
    expect(ANSWER_LINE_DASH_PT).toBeCloseTo(ANSWER_LINE_DASH_PX * (72 / 96), 5);
    expect(ANSWER_LINE_DASH_SPACE_PT).toBeCloseTo(ANSWER_LINE_DASH_SPACE_PX * (72 / 96), 5);
  });

  it("mantém as duas telas no `border-dashed` que os tokens transcrevem", () => {
    render(<AnswerPreview answer={OPEN} onChange={() => {}} />);
    for (const line of screen.getAllByTestId("preview-answer-line")) {
      expect(line.className).toContain("border-dashed");
    }
    render(<OpenAnswerView answer={OPEN} />);
    for (const line of Array.from(screen.getByTestId("answer-open").children)) {
      expect((line as HTMLElement).className).toContain("border-dashed");
    }
  });

  it("pinta a pauta do PDF com a cadência dos tokens", () => {
    expect(paintCalls().find((c) => c.method === "dash")?.args).toEqual([
      ANSWER_LINE_DASH_PT,
      { space: ANSWER_LINE_DASH_SPACE_PT },
    ]);
  });

  it("não deriva a cadência da espessura, como fazia o `borderBottomStyle: dashed`", () => {
    expect(ANSWER_LINE_DASH_PT).not.toBeCloseTo(ANSWER_LINE_WIDTH_PT * 2, 5);
    expect(ANSWER_LINE_DASH_SPACE_PT).not.toBeCloseTo(ANSWER_LINE_WIDTH_PT * 1.2, 5);
  });
});
