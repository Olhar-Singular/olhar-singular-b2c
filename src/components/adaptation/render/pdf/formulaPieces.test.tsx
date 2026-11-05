/**
 * O desenho dos pedaços de uma fórmula no PDF (N-U-006, B5/B7 da revisão do Lote 10): a marca de
 * "não hifenize" fica DEPOIS do primeiro caractere de cada pedaço, o vão do LaTeX fecha o pedaço
 * anterior (um NBSP na MESMA string) e a junta é um run próprio de corpo 0,1. Sem efeito visível
 * que um teste de layout alcance, a posição é travada na árvore.
 */
import { describe, it, expect } from "vitest";
import { isValidElement, type ReactNode } from "react";
import { PdfRichText } from "./PdfRichText";
import { mathPdfSegments } from "./mathToPdfText";
import { NO_HYPHEN_MARK } from "./registerFonts";
import { MATH_NBSP } from "../mathAtom";
import type { RichText } from "@/lib/adaptation/canonical/schema";

/** Percorre a árvore: texto vira a própria string, a junta macia (corpo 0,1) vira `"<joint>"`. */
function flatten(node: ReactNode, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => flatten(child, out));
    return out;
  }
  if (isValidElement(node)) {
    const props = node.props as { style?: { fontSize?: number }; children?: ReactNode };
    if (props.style?.fontSize === 0.1) out.push("<joint>");
    else flatten(props.children, out);
  }
  return out;
}

const math = (latex: string): RichText => [{ type: "inlineMath", latex }];
const LATEX = "a + b + c + d + e + f + g + h";
const COLUMN = 50;

describe("pedaços de fórmula", () => {
  const segments = mathPdfSegments(LATEX, 12, COLUMN);

  it("a fórmula estreita é mesmo partida, com os três tipos de junta possíveis", () => {
    expect(segments.length).toBeGreaterThan(3);
    expect(segments.some((s) => s.joint === "space")).toBe(true);
  });

  it("a marca vem depois do 1º caractere, nunca antes, e cada pedaço leva uma só", () => {
    const strings = flatten(PdfRichText({ content: math(LATEX), fontSize: 12, columnPt: COLUMN }) as ReactNode).filter(
      (s) => s !== "<joint>",
    );
    expect(strings).toHaveLength(segments.length);
    strings.forEach((piece) => {
      expect(piece[0]).not.toBe(NO_HYPHEN_MARK);
      expect(piece[1]).toBe(NO_HYPHEN_MARK);
      expect(piece.split(NO_HYPHEN_MARK)).toHaveLength(2);
    });
  });

  it("o vão do LaTeX fecha o pedaço anterior (NBSP no fim, na mesma string) e a junta vem antes do seguinte", () => {
    const tokens = flatten(PdfRichText({ content: math(LATEX), fontSize: 12, columnPt: COLUMN }) as ReactNode);
    const expected: string[] = [];
    segments.forEach((segment, k) => {
      if (segment.joint !== "none") expected.push("<joint>");
      const first = String.fromCodePoint(segment.text.codePointAt(0) as number);
      const marked = first + NO_HYPHEN_MARK + segment.text.slice(first.length);
      expected.push(marked + (segments[k + 1]?.joint === "space" ? MATH_NBSP : ""));
    });
    expect(tokens).toEqual(expected);
    // o último pedaço nunca termina em NBSP e o penúltimo termina quando a junta seguinte é um espaço
    expect(tokens.filter((t) => t !== "<joint>").some((t) => t.endsWith(MATH_NBSP))).toBe(true);
    expect(tokens[tokens.length - 1].endsWith(MATH_NBSP)).toBe(false);
  });
});

describe("junta na emenda entre texto e fórmula (N-U-008)", () => {
  const text = (t: string): RichText[number] => ({ type: "text", text: t });
  const formula = (latex: string): RichText[number] => ({ type: "inlineMath", latex });
  const tokensOf = (content: RichText) => flatten(PdfRichText({ content, fontSize: 12 }) as ReactNode);
  const X = "x" + NO_HYPHEN_MARK;
  const Y = "y" + NO_HYPHEN_MARK;

  it("texto colado antes e depois da fórmula leva uma junta de cada lado", () => {
    expect(tokensOf([text("a("), formula("x"), text(").")])).toEqual(["a(", "<joint>", X, "<joint>", ")."]);
  });

  it("com espaço de um lado só, a junta vem só do outro", () => {
    expect(tokensOf([text("a "), formula("x"), text(").")])).toEqual(["a ", X, "<joint>", ")."]);
    expect(tokensOf([text("a("), formula("x"), text(" b")])).toEqual(["a(", "<joint>", X, " b"]);
  });

  it("com espaço dos dois lados não há junta", () => {
    expect(tokensOf([text("a "), formula("x"), text(" b")])).toEqual(["a ", X, " b"]);
  });

  it("NBSP não é o espaço que o textkit separa: também leva junta", () => {
    expect(tokensOf([text("a\u00a0"), formula("x"), text("\u00a0b")])).toEqual(["a\u00a0", "<joint>", X, "<joint>", "\u00a0b"]);
  });

  it("fórmula sozinha, no começo ou no fim do conteúdo, não leva junta", () => {
    expect(tokensOf([formula("x")])).toEqual([X]);
    expect(tokensOf([formula("x"), text(" b")])).toEqual([X, " b"]);
    expect(tokensOf([text("a "), formula("x")])).toEqual(["a ", X]);
  });

  it("duas fórmulas coladas levam UMA junta entre elas", () => {
    expect(tokensOf([formula("x"), formula("y")])).toEqual([X, "<joint>", Y]);
  });
});
