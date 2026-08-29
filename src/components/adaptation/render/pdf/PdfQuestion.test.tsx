/**
 * Onde o número da questão mora na árvore do PDF.
 *
 * O número era um <Text> IRMÃO da coluna do enunciado, alinhado por
 * `alignItems: "flex-start"` — topo com topo, não linha de base com linha de
 * base. Enquanto as duas caixas tinham a mesma altura de linha o alinhamento
 * saía certo por coincidência; bastava uma fórmula inline (Courier a
 * MATH_PDF_FONT_SIZE_PT dentro de um corpo de 12pt) engordar a primeira linha
 * do enunciado para o "1." ficar 4,38pt acima do texto que numera (achado 0428).
 *
 * A regra que fecha os dois casos: quando o stem abre com texto, o número é um
 * run do PRÓPRIO <Text> do enunciado (mesma linha, mesma linha de base, sem
 * depender de altura nenhuma); quando abre com bloco não-textual (imagem,
 * fórmula em bloco, andaime) a coluna irmã continua — é o caso que motivou o
 * `flex-start`, porque a linha de base de uma imagem é a borda de baixo dela.
 */

import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { Text } from "@react-pdf/renderer";
import { PdfQuestion } from "./PdfQuestion";
import type { Block } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];

/** Texto plano de uma subárvore, expandindo componentes de função. */
function textOf(node: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (n === null || n === undefined || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (isValidElement(n)) {
      const el = n as ReactElement;
      if (typeof el.type === "function" && el.type !== (Text as unknown)) {
        walk((el.type as (p: unknown) => unknown)(el.props));
        return;
      }
      walk((el.props as { children?: unknown }).children);
    }
  };
  walk(node);
  return out.join("");
}

/** Todos os <Text> da árvore, com componentes de função já expandidos. */
function textNodes(node: unknown, found: ReactElement[] = []): ReactElement[] {
  if (node === null || node === undefined || typeof node === "boolean") return found;
  if (Array.isArray(node)) {
    node.forEach((c) => textNodes(c, found));
    return found;
  }
  if (isValidElement(node)) {
    const el = node as ReactElement;
    if (el.type === (Text as unknown)) {
      found.push(el);
      textNodes((el.props as { children?: unknown }).children, found);
      return found;
    }
    if (typeof el.type === "function") {
      textNodes((el.type as (p: unknown) => unknown)(el.props), found);
      return found;
    }
    textNodes((el.props as { children?: unknown }).children, found);
  }
  return found;
}

/** O <Text> mais externo que contém o rótulo do número. */
const numberHost = (node: unknown, label: string): ReactElement | undefined =>
  textNodes(node).find((t) => textOf(t).includes(label));

describe("PdfQuestion — o número divide a linha do enunciado", () => {
  it("costura o número no mesmo <Text> do stem quando o enunciado tem fórmula inline", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [
        {
          id: id(2),
          type: "paragraph",
          content: [
            { type: "text", text: "Qual é a raiz de " },
            { type: "inlineMath", latex: "x^2+2x+1" },
            { type: "text", text: "?" },
          ],
        },
      ],
      answer: { kind: "open" },
    };

    const host = numberHost(PdfQuestion({ block, number: 1 }), "1.");
    expect(host).toBeDefined();
    // Mesma caixa de texto ⇒ mesma linha de base, com ou sem fórmula.
    expect(textOf(host)).toContain("Qual é a raiz de ");
  });

  it("costura o número no <Text> do enunciado quando ele vem acima do stem", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [{ id: id(2), type: "paragraph", content: rt("resto") }],
      enunciado: rt("Leia o contexto"),
      enunciadoPosition: "above",
      answer: { kind: "open" },
    };

    const host = numberHost(PdfQuestion({ block, number: 2 }), "2.");
    expect(textOf(host)).toContain("Leia o contexto");
  });

  it("mantém a coluna irmã quando o stem abre com imagem", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [
        { id: id(2), type: "image", src: "data:image/png;base64,AAA" },
        { id: id(3), type: "paragraph", content: rt("depois da figura") },
      ],
      answer: { kind: "open" },
    };

    const host = numberHost(PdfQuestion({ block, number: 3 }), "3.");
    expect(textOf(host)).not.toContain("depois da figura");
  });
});
