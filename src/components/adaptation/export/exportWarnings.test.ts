import { describe, it, expect } from "vitest";
import { pdfExportWarnings } from "./exportWarnings";
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
    expect(warnings).toHaveLength(1);
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
    expect(warnings).toHaveLength(1);
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
    expect(warnings).toHaveLength(2);
  });
});
