/**
 * A deliberately rich, valid CanonicalDocument exercising every block kind,
 * inline marks, inlineMath, per-node style, optional fields present/absent,
 * and three question interaction kinds (multipleChoice, trueFalse, fillBlank).
 *
 * Used by the lossless round-trip tests. Ids are fixed (valid UUIDs) so the
 * deep-equal assertion is deterministic.
 */

import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const richDocument: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    {
      id: id(1),
      type: "heading",
      level: 1,
      content: [{ type: "text", text: "Capítulo 1" }],
      style: { align: "center" },
    },
    {
      id: id(2),
      type: "paragraph",
      content: [
        { type: "text", text: "Considere " },
        { type: "text", text: "este termo", marks: ["bold", "italic"] },
        { type: "text", text: " e " },
        { type: "inlineMath", latex: "x^2 + y^2", alt: "x squared plus y squared" },
        { type: "text", text: " com " },
        { type: "text", text: "destaque", color: "#DC2626" },
        { type: "text", text: " final.", marks: ["underline", "strike"] },
      ],
    },
    {
      id: id(3),
      type: "blockMath",
      latex: "\\int_0^1 x\\,dx = \\tfrac12",
      alt: "integral of x from 0 to 1",
      style: { align: "center", pageBreakBefore: true },
    },
    {
      id: id(4),
      type: "image",
      src: "https://example.com/diagram.png",
      alt: "Um diagrama",
      width: 320,
      alignment: "right",
      caption: [
        { type: "text", text: "Figura 1: " },
        { type: "text", text: "o diagrama", marks: ["italic"] },
      ],
    },
    {
      id: id(5),
      type: "scaffolding",
      items: ["Leia o enunciado", "Identifique os dados", "Resolva passo a passo"],
    },
    { id: id(6), type: "divider" },
    {
      id: id(7),
      type: "question",
      number: 1,
      points: 2.5,
      difficulty: "medio",
      stem: [
        {
          id: id(8),
          type: "paragraph",
          content: [{ type: "text", text: "Qual é a capital do Brasil?" }],
        },
        {
          id: id(9),
          type: "blockMath",
          latex: "a^2 + b^2 = c^2",
        },
      ],
      instruction: [{ type: "text", text: "Marque a alternativa correta." }],
      answer: {
        kind: "multipleChoice",
        alternatives: [
          { id: id(10), content: [{ type: "text", text: "São Paulo" }], correct: false },
          {
            id: id(11),
            content: [{ type: "text", text: "Brasília" }],
            correct: true,
          },
          { id: id(13), content: [{ type: "text", text: "Rio de Janeiro" }], correct: false },
        ],
      },
    },
    {
      id: id(14),
      type: "question",
      stem: [
        {
          id: id(15),
          type: "paragraph",
          content: [{ type: "text", text: "Julgue as afirmações." }],
        },
      ],
      answer: {
        kind: "trueFalse",
        items: [
          { id: id(16), content: [{ type: "text", text: "O céu é azul." }], value: true },
          { id: id(17), content: [{ type: "text", text: "Peixes voam." }], value: false },
        ],
      },
    },
    {
      id: id(18),
      type: "question",
      stem: [
        {
          id: id(19),
          type: "paragraph",
          content: [{ type: "text", text: "Complete a frase." }],
        },
      ],
      answer: {
        kind: "fillBlank",
        gaps: [
          { id: id(20), answer: "fotossíntese", alternatives: ["photosynthesis"], tip: "processo das plantas" },
          { id: id(21), answer: "clorofila" },
        ],
      },
    },
    // Edge cases: empty paragraph content, image without optional fields.
    { id: id(22), type: "paragraph", content: [] },
    {
      id: id(23),
      type: "image",
      src: "https://example.com/plain.png",
      alt: "",
    },
    // Question with an empty-ish stem (single empty paragraph) + open answer.
    {
      id: id(24),
      type: "question",
      stem: [{ id: id(25), type: "paragraph", content: [] }],
      answer: { kind: "open", answerLines: 5 },
    },
  ],
};
