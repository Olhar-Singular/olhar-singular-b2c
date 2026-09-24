import { describe, it, expect } from "vitest";
import { copyExportWarnings, MATH_LOSS_WARNING, pdfExportWarnings } from "./exportWarnings";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const doc = (blocks: CanonicalDocument["blocks"]): CanonicalDocument => ({
  schemaVersion: 1,
  blocks,
});

describe("pdfExportWarnings", () => {
  it("documento sem fórmula não gera aviso", () => {
    expect(
      pdfExportWarnings(
        doc([{ id: id(1), type: "paragraph", content: [{ type: "text", text: "olá" }] }]),
      ),
    ).toEqual([]);
  });

  it("avisa quando há fórmula de bloco (o PDF imprime o LaTeX cru)", () => {
    const warnings = pdfExportWarnings(doc([{ id: id(1), type: "blockMath", latex: "a^2" }]));
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/LaTeX/i);
  });

  it("avisa quando a fórmula está inline dentro de uma alternativa", () => {
    const warnings = pdfExportWarnings(
      doc([
        {
          id: id(1),
          type: "question",
          number: 1,
          stem: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "q" }] }],
          answer: {
            kind: "multipleChoice",
            alternatives: [
              { id: id(3), content: [{ type: "inlineMath", latex: "E = mc^2" }], correct: true },
            ],
          },
        },
      ]),
    );
    expect(warnings).toHaveLength(2);
  });

  it("avisa que o itálico sai reto quando a fonte não tem face itálica (Lexend)", () => {
    const warnings = pdfExportWarnings(
      doc([{ id: id(1), type: "paragraph", content: [{ type: "text", text: "olá" }] }]),
      { fontFamily: "lexend" },
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/itálico/i);
    expect(warnings[0]).toMatch(/Lexend/);
  });

  it("fonte com face itálica embutida não gera aviso", () => {
    expect(
      pdfExportWarnings(
        doc([{ id: id(1), type: "paragraph", content: [{ type: "text", text: "olá" }] }]),
        { fontFamily: "atkinson" },
      ),
    ).toEqual([]);
  });

  it("fonte desconhecida (valor legado) não gera aviso de itálico", () => {
    expect(
      pdfExportWarnings(
        doc([{ id: id(1), type: "paragraph", content: [{ type: "text", text: "olá" }] }]),
        { fontFamily: "Comic Sans" },
      ),
    ).toEqual([]);
  });

  it("acumula o aviso de fórmula e o de itálico", () => {
    const warnings = pdfExportWarnings(doc([{ id: id(1), type: "blockMath", latex: "a^2" }]), {
      fontFamily: "lexend",
    });
    expect(warnings).toHaveLength(3);
  });
  it("avisa que o texto alternativo da imagem não chega ao PDF", () => {
    const warnings = pdfExportWarnings(
      doc([
        {
          id: id(1),
          type: "image",
          src: "https://exemplo.com/figura.png",
          alt: "figura larga de apoio",
        },
      ]),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/texto alternativo/i);
    expect(warnings[0]).toMatch(/leitor de tela/i);
  });

  it("avisa também quando a imagem está dentro do enunciado de uma questão", () => {
    const warnings = pdfExportWarnings(
      doc([
        {
          id: id(1),
          type: "question",
          number: 1,
          stem: [
            { id: id(2), type: "paragraph", content: [{ type: "text", text: "q" }] },
            { id: id(3), type: "image", src: "https://exemplo.com/figura.png", alt: "mapa" },
          ],
          answer: { kind: "open", lines: 3 },
        },
      ]),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/texto alternativo/i);
  });

  it("acumula o aviso de imagem e o de fórmula", () => {
    const warnings = pdfExportWarnings(
      doc([
        { id: id(1), type: "image", src: "https://exemplo.com/figura.png", alt: "figura" },
        { id: id(2), type: "blockMath", latex: "a^2" },
      ]),
    );
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toMatch(/texto alternativo/i);
    expect(warnings[1]).toMatch(/LaTeX/i);
  });
});

// ---------------------------------------------------------------------------
// 0411 — o "Copiar" entrega o mesmo LaTeX cru do PDF; a varredura é a mesma
// ---------------------------------------------------------------------------

describe("copyExportWarnings (0411)", () => {
  it("documento sem fórmula copia sem nada a dizer", () => {
    expect(
      copyExportWarnings(
        doc([{ id: id(1), type: "paragraph", content: [{ type: "text", text: "olá" }] }]),
      ),
    ).toEqual([]);
  });

  it("avisa da fórmula com a MESMA frase do PDF (é o mesmo texto entregue)", () => {
    const mathDoc = doc([{ id: id(1), type: "blockMath", latex: "a^2" }]);
    expect(copyExportWarnings(mathDoc)).toEqual([MATH_LOSS_WARNING]);
    expect(pdfExportWarnings(mathDoc)).toContain(MATH_LOSS_WARNING);
  });

  it("pega inline math em qualquer campo RichText", () => {
    const warnings = copyExportWarnings(
      doc([{ id: id(1), type: "paragraph", content: [{ type: "inlineMath", latex: "E = mc^2" }] }]),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/LaTeX/i);
  });

  it("não herda o aviso de imagem do PDF: a cópia é texto, não carrega figura nenhuma", () => {
    expect(
      copyExportWarnings(
        doc([{ id: id(1), type: "image", src: "https://exemplo.com/figura.png", alt: "figura" }]),
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 0415 — a fórmula sai em Courier, não na fonte escolhida no popover "Formato",
// e o diálogo só falava do LaTeX. O professor que escolheu OpenDyslexic recebia
// a prova com a matemática em monoespaçada sem nenhum aviso.
// ---------------------------------------------------------------------------

describe("aviso de tipografia da fórmula (0415)", () => {
  const mathDoc = doc([{ id: id(1), type: "blockMath", latex: "a^2" }]);

  it("o PDF avisa que a fórmula não segue a fonte nem o corpo do documento", () => {
    const warnings = pdfExportWarnings(mathDoc, { fontFamily: "opendyslexic" });
    expect(warnings.join(" ")).toMatch(/monoespaçada/i);
    expect(warnings.join(" ")).toMatch(/fonte/i);
  });

  it("avisa mesmo sem pageStyle: a fonte da fórmula é fixa de qualquer jeito", () => {
    expect(pdfExportWarnings(mathDoc).join(" ")).toMatch(/monoespaçada/i);
  });

  it("documento sem fórmula não ganha aviso de tipografia", () => {
    expect(
      pdfExportWarnings(
        doc([{ id: id(1), type: "paragraph", content: [{ type: "text", text: "olá" }] }]),
        { fontFamily: "opendyslexic" },
      ).join(" "),
    ).not.toMatch(/monoespaçada/i);
  });

  it("a cópia NÃO herda o aviso: texto puro não carrega tipografia nenhuma", () => {
    expect(copyExportWarnings(mathDoc).join(" ")).not.toMatch(/monoespaçada/i);
  });
});
