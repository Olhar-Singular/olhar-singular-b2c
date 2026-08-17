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
import { ANSWER_LINE_COLOR, ANSWER_LINE_GAP_PX, ANSWER_LINE_GAP_PT } from "./pageTokens";
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

type PdfLineStyle = { borderBottomColor?: string; marginBottom?: number };

/** Varre a árvore do react-pdf atrás do estilo da primeira linha pautada. */
function findLineStyle(node: unknown): PdfLineStyle | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findLineStyle(child);
      if (found) return found;
    }
    return undefined;
  }
  const props = (node as ReactElement).props as
    | { style?: PdfLineStyle; children?: unknown }
    | undefined;
  if (!props) return undefined;
  if (props.style?.borderBottomColor) return props.style;
  return findLineStyle(props.children);
}

function findBorderColor(node: unknown): string | undefined {
  return findLineStyle(node)?.borderBottomColor;
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
    expect(findBorderColor(PdfAnswer({ answer: OPEN }))).toBe(ANSWER_LINE_COLOR);
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
    expect(findLineStyle(PdfAnswer({ answer: OPEN }))?.marginBottom).toBe(ANSWER_LINE_GAP_PT);
  });
});
