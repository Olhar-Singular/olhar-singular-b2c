/**
 * A caixa do checkbox é a MESMA nas quatro superfícies (achado 0358).
 *
 * O bug: as duas telas desenhavam um quadrado vazado e o PDF e o Word emitiam o
 * texto literal `[ ]`. O aluno recebia no papel dois colchetes finos (~13px de
 * traço) no lugar de uma caixa fechada de 17px — alvo menor e menos legível
 * justo para o público do produto —, e as duas telas ainda discordavam entre si
 * no tamanho (17px x 16px) e na cor da borda.
 *
 * Contrato: as quatro superfícies leem `CHECKBOX_BOX_*` de `pageTokens`; o papel
 * DESENHA a caixa (um `Canvas` por item, como a pauta da questão aberta desde o
 * 0154) e o Word a emite como borda de run, nunca como glifo de colchete.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { isValidElement, type ReactElement } from "react";
import { Canvas } from "@react-pdf/renderer";
import { CheckboxView } from "./answers/CheckboxView";
import { AnswerPreview } from "../canonical-editor/answer-editors/AnswerPreview";
import { PdfAnswer } from "./pdf/PdfAnswer";
import { blockToDocxParagraphs } from "../export/exportDocx";
import {
  ANSWER_LINE_COLOR,
  CHECKBOX_BOX_PX,
  CHECKBOX_BOX_BORDER_PX,
} from "./pageTokens";
import type { Block, QuestionAnswer, RichText } from "@/lib/adaptation/canonical/schema";

vi.mock("../canonical-editor/RichTextField", () => ({
  RichTextField: ({ ariaLabel }: { ariaLabel?: string }) => <input aria-label={ariaLabel} />,
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string): RichText => [{ type: "text", text: t }];
const ANSWER: Extract<QuestionAnswer, { kind: "checkbox" }> = {
  kind: "checkbox",
  items: [
    { id: id(1), content: rt("alfa"), checked: true },
    { id: id(2), content: rt("beta"), checked: false },
  ],
};

// --- telas -----------------------------------------------------------------

function expectTokenBox(box: HTMLElement): void {
  expect(box.style.width).toBe(`${CHECKBOX_BOX_PX}px`);
  expect(box.style.height).toBe(`${CHECKBOX_BOX_PX}px`);
  expect(box.style.borderWidth).toBe(`${CHECKBOX_BOX_BORDER_PX}px`);
  expect(box.style.borderColor).toBe("rgb(118, 118, 118)");
}

describe("caixa do checkbox — telas (0358)", () => {
  it("a prévia do Exportar desenha a caixa com os tokens", () => {
    render(<CheckboxView answer={ANSWER} />);
    const boxes = screen.getAllByTestId("checkbox-box");
    expect(boxes).toHaveLength(2);
    boxes.forEach(expectTokenBox);
  });

  it("a folha do Revisar desenha a MESMA caixa", () => {
    render(<AnswerPreview answer={ANSWER} onChange={vi.fn()} />);
    const boxes = screen.getAllByTestId("preview-bullet");
    expect(boxes).toHaveLength(2);
    boxes.forEach(expectTokenBox);
  });
});

// --- PDF -------------------------------------------------------------------

function walkText(node: unknown, out: string[]): void {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((c) => walkText(c, out));
    return;
  }
  if (isValidElement(node)) {
    const el = node as ReactElement;
    if (typeof el.type === "function") walkText((el.type as (p: unknown) => unknown)(el.props), out);
    walkText((el.props as { children?: unknown }).children, out);
  }
}

function canvasNodes(node: unknown, found: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    node.forEach((c) => canvasNodes(c, found));
    return found;
  }
  if (isValidElement(node)) {
    const el = node as ReactElement;
    if (el.type === Canvas) found.push(el);
    canvasNodes((el.props as { children?: unknown }).children, found);
  }
  return found;
}

describe("caixa do checkbox — PDF (0358)", () => {
  it("desenha uma caixa por item em vez de imprimir o colchete", () => {
    const el = PdfAnswer({ answer: ANSWER });
    const text: string[] = [];
    walkText(el, text);
    expect(text.join("")).not.toContain("[");
    expect(text.join("")).not.toContain("]");
    expect(canvasNodes(el)).toHaveLength(2);
  });
});

// --- Word ------------------------------------------------------------------

function docxText(node: unknown): string {
  const parts: string[] = [];
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o === null || typeof o !== "object") return;
    const n = o as { rootKey?: string; root?: unknown };
    if (n.rootKey === "w:t" && Array.isArray(n.root)) {
      for (const p of n.root) if (typeof p === "string") parts.push(p);
    }
    Object.values(o as Record<string, unknown>).forEach(walk);
  };
  walk(node);
  return parts.join("");
}

/** Bordas de RUN (`w:bdr`) encontradas na árvore docx. */
function runBorders(node: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  // O mesmo nó aparece em mais de uma propriedade da árvore do docx (opções e
  // filhos apontam para o objeto), então visita-se cada um UMA vez.
  const seen = new Set<unknown>();
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o === null || typeof o !== "object") return;
    if (seen.has(o)) return;
    seen.add(o);
    const n = o as { rootKey?: string; root?: unknown[] };
    if (n.rootKey === "w:bdr" && Array.isArray(n.root)) {
      for (const k of n.root) {
        const attr = k as { rootKey?: string; root?: Record<string, { key: string; value?: unknown }> };
        if (attr.rootKey !== "_attr" || !attr.root) continue;
        found.push(
          Object.fromEntries(
            Object.entries(attr.root)
              .filter(([, v]) => v?.value !== undefined)
              .map(([k2, v]) => [k2, v.value]),
          ),
        );
      }
    }
    Object.values(o as Record<string, unknown>).forEach(walk);
  };
  walk(node);
  return found;
}

describe("caixa do checkbox — Word (0358)", () => {
  const block: Block = {
    id: id(90),
    type: "question",
    stem: [{ id: id(91), type: "paragraph", content: rt("enunciado") }],
    answer: ANSWER,
  };

  it("emite a caixa como borda de run, nunca como colchete de texto", () => {
    const paragraphs = blockToDocxParagraphs(block, 1);
    const text = paragraphs.map(docxText).join("\n");
    expect(text).toContain("alfa");
    expect(text).toContain("beta");
    expect(text).not.toContain("[");
    expect(text).not.toContain("]");
    expect(runBorders(paragraphs)).toHaveLength(2);
  });
});
