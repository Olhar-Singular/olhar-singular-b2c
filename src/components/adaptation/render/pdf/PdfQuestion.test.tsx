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
import { questionNumberColumnPt } from "../pageTokens";
import { resolveElementFontSizes, resolvePageStyle } from "../pageStyle";

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

/**
 * Vao entre paragrafos do MESMO enunciado (achado 0171).
 *
 * Os blocos do stem caiam no `blockGap` padrao do `PdfBlock` (12 pt), que e a
 * junta entre blocos de TOPO do documento. Dentro da questao o vao e outro: as
 * duas telas usam 8 px entre os irmaos do stem. Sem repassar nada, o papel
 * imprimia o dobro do respiro da previa entre dois paragrafos do mesmo
 * enunciado.
 */
function viewsWithMargin(node: unknown, found: ReactElement[] = []): ReactElement[] {
  if (node === null || node === undefined || typeof node === "boolean") return found;
  if (Array.isArray(node)) {
    node.forEach((c) => viewsWithMargin(c, found));
    return found;
  }
  if (isValidElement(node)) {
    const el = node as ReactElement;
    if (typeof el.type === "function" && el.type !== (Text as unknown)) {
      viewsWithMargin((el.type as (p: unknown) => unknown)(el.props), found);
      return found;
    }
    const style = (el.props as { style?: { marginBottom?: number } }).style;
    if (style && typeof style.marginBottom === "number") found.push(el);
    viewsWithMargin((el.props as { children?: unknown }).children, found);
  }
  return found;
}

/** marginBottom do container MAIS INTERNO que envolve o texto informado. */
const gapAfter = (node: unknown, text: string): number | undefined => {
  const hosts = viewsWithMargin(node).filter((v) => textOf(v).includes(text));
  const host = hosts[hosts.length - 1];
  return (host?.props as { style?: { marginBottom?: number } } | undefined)?.style?.marginBottom;
};

describe("PdfQuestion — vao entre paragrafos do stem", () => {
  const twoParagraphs: Extract<Block, { type: "question" }> = {
    id: id(1),
    type: "question",
    stem: [
      { id: id(2), type: "paragraph", content: rt("Leia o termo abaixo e responda:") },
      { id: id(3), type: "paragraph", content: rt("antidisestabelecimentarianismo") },
    ],
    answer: { kind: "open" },
  };

  it("usa o vao interno da questao (6 pt = 8 px) entre o 1o e o 2o paragrafo", () => {
    const tree = PdfQuestion({ block: twoParagraphs, number: 1 });
    expect(gapAfter(tree, "Leia o termo abaixo e responda:")).toBe(6);
  });

  it("usa o mesmo vao interno depois do ultimo bloco do stem", () => {
    const tree = PdfQuestion({ block: twoParagraphs, number: 1 });
    expect(gapAfter(tree, "antidisestabelecimentarianismo")).toBe(6);
  });

  it("mantem o vao interno quando o stem nao abre com texto", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [
        { id: id(2), type: "image", src: "data:image/png;base64,AAA" },
        { id: id(3), type: "paragraph", content: rt("depois da figura") },
      ],
      answer: { kind: "open" },
    };
    expect(gapAfter(PdfQuestion({ block, number: 1 }), "depois da figura")).toBe(6);
  });
});

/**
 * A COLUNA do enunciado (achado 0175).
 *
 * O 0428 costurou o número como run do <Text> do texto que ele numera — e junto
 * levou embora o `flexDirection: "row"` que dava ao stem uma coluna própria. As
 * duas telas continuam desenhando o stem inteiro numa coluna que começa depois
 * do rótulo (`shrink-0` + `gap-2`), então no papel a segunda linha do enunciado,
 * o segundo parágrafo do stem e tudo mais voltavam encostados na margem, no
 * mesmo x do número.
 *
 * A geometria que fecha os dois: recuo à esquerda do tamanho da coluna no bloco
 * do stem + recuo NEGATIVO de primeira linha no run do número (recuo pendurado),
 * que é o que o `flex` + `shrink-0` das telas produz.
 */
function viewsWithPadding(node: unknown, found: ReactElement[] = []): ReactElement[] {
  if (node === null || node === undefined || typeof node === "boolean") return found;
  if (Array.isArray(node)) {
    node.forEach((c) => viewsWithPadding(c, found));
    return found;
  }
  if (isValidElement(node)) {
    const el = node as ReactElement;
    if (typeof el.type === "function" && el.type !== (Text as unknown)) {
      viewsWithPadding((el.type as (p: unknown) => unknown)(el.props), found);
      return found;
    }
    const style = (el.props as { style?: { paddingLeft?: number } }).style;
    if (style && typeof style.paddingLeft === "number") found.push(el);
    viewsWithPadding((el.props as { children?: unknown }).children, found);
  }
  return found;
}

const paddingLeftOf = (node: unknown, text: string): number | undefined => {
  const host = viewsWithPadding(node).find((v) => textOf(v).includes(text));
  return (host?.props as { style?: { paddingLeft?: number } } | undefined)?.style?.paddingLeft;
};

const textIndentOf = (node: unknown, label: string): number | undefined =>
  (
    textNodes(node).find((t) => textOf(t) === `${label} `)?.props as
      | { style?: { textIndent?: number } }
      | undefined
  )?.style?.textIndent;

describe("PdfQuestion — a coluna do enunciado (0175)", () => {
  const twoParagraphs: Extract<Block, { type: "question" }> = {
    id: id(1),
    type: "question",
    stem: [
      { id: id(2), type: "paragraph", content: rt("Leia o termo abaixo e responda:") },
      { id: id(3), type: "paragraph", content: rt("antidisestabelecimentarianismo") },
    ],
    answer: { kind: "open" },
  };

  it("recua todo o stem na coluna do número quando a questão abre com parágrafo", () => {
    const tree = PdfQuestion({ block: twoParagraphs, number: 1 });
    expect(paddingLeftOf(tree, "antidisestabelecimentarianismo")).toBeCloseTo(
      questionNumberColumnPt("1"),
      4,
    );
  });

  it("pendura a primeira linha na margem, com o run do número recuando o tamanho da coluna", () => {
    const tree = PdfQuestion({ block: twoParagraphs, number: 1 });
    expect(textIndentOf(tree, "1.")).toBeCloseTo(-questionNumberColumnPt("1"), 4);
  });

  it("recua o enunciado que abre a questão pela mesma coluna, no corpo do enunciado", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [{ id: id(2), type: "paragraph", content: rt("resto") }],
      enunciado: rt("Leia o contexto"),
      enunciadoPosition: "above",
      answer: { kind: "open" },
    };
    const sizes = resolveElementFontSizes(resolvePageStyle());
    const column = questionNumberColumnPt("2", sizes.stem);
    const tree = PdfQuestion({ block, number: 2 });
    expect(paddingLeftOf(tree, "Leia o contexto")).toBeCloseTo(column, 4);
    expect(textIndentOf(tree, "2.")).toBeCloseTo(-column, 4);
  });

  it("acompanha o rótulo de dois dígitos", () => {
    const tree = PdfQuestion({ block: twoParagraphs, number: 10 });
    expect(paddingLeftOf(tree, "antidisestabelecimentarianismo")).toBeCloseTo(
      questionNumberColumnPt("10"),
      4,
    );
    expect(questionNumberColumnPt("10")).toBeGreaterThan(questionNumberColumnPt("1"));
  });

  it("não imprime enunciado nenhum quando a posição é 'above' mas ele está vazio", () => {
    // `enunciadoPosition` sobrevive no documento canônico mesmo depois de o
    // enunciado ser apagado. Sem enunciado o número não tem texto com que
    // dividir a linha, então a questão cai na coluna irmã — e o ramo "above"
    // dessa via não pode ressuscitar um enunciado que não existe.
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [
        { id: id(2), type: "image", src: "data:image/png;base64,AAA" },
        { id: id(3), type: "paragraph", content: rt("só a figura numera") },
      ],
      enunciadoPosition: "above",
      answer: { kind: "open" },
    };
    const tree = PdfQuestion({ block, number: 4 });
    // Coluna irmã: o rótulo não vira run com recuo pendurado.
    expect(textIndentOf(tree, "4.")).toBeUndefined();
    expect(textOf(tree)).toContain("só a figura numera");
    expect(numberHost(tree, "4.")).toBeDefined();
  });

  it("mantém a coluna irmã (sem recuo pendurado) quando o stem abre com imagem", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [
        { id: id(2), type: "image", src: "data:image/png;base64,AAA" },
        { id: id(3), type: "paragraph", content: rt("depois da figura") },
      ],
      answer: { kind: "open" },
    };
    expect(textIndentOf(PdfQuestion({ block, number: 3 }), "3.")).toBeUndefined();
  });
});
