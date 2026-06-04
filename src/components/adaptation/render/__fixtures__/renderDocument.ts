/**
 * Rich render fixture — one of every block type and every answer kind, with
 * per-node styles and inline math, used by the CanonicalRenderer tests.
 *
 * All ids are valid UUIDs so the document parses against CanonicalDocumentSchema.
 */

import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const renderDocument: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    {
      id: id(1),
      type: "heading",
      level: 2,
      content: [{ type: "text", text: "Atividade de Frações" }],
      style: { align: "center", color: "#2563EB", fontSize: 22 },
    },
    {
      id: id(2),
      type: "paragraph",
      content: [
        { type: "text", text: "Considere ", marks: ["bold"] },
        { type: "text", text: "esta", marks: ["italic", "underline"], color: "#DC2626" },
        { type: "text", text: " expressão: " },
        { type: "inlineMath", latex: "\\frac{a}{b}", alt: "a sobre b" },
        { type: "text", text: ".", marks: ["strike"] },
      ],
      style: { spacingAfter: 12, pageBreakBefore: true, fontFamily: "Georgia" },
    },
    {
      id: id(3),
      type: "blockMath",
      latex: "x^2 + y^2 = z^2",
      alt: "teorema de Pitágoras",
    },
    {
      id: id(4),
      type: "image",
      src: "https://example.com/fig.png",
      alt: "Diagrama de frações",
      width: 400,
      alignment: "center",
      caption: [{ type: "text", text: "Figura 1" }],
    },
    {
      id: id(5),
      type: "scaffolding",
      items: ["Passo 1: leia o enunciado", "Passo 2: identifique os dados"],
    },
    { id: id(6), type: "divider" },
    {
      id: id(10),
      type: "question",
      number: 1,
      points: 2,
      difficulty: "facil",
      stem: [
        {
          id: id(11),
          type: "paragraph",
          content: [{ type: "text", text: "Quanto é 1/2 + 1/4?" }],
        },
      ],
      instruction: [{ type: "text", text: "Escolha a opção correta." }],
      answer: {
        kind: "multipleChoice",
        alternatives: [
          { id: id(12), content: [{ type: "text", text: "3/4" }], correct: true },
          { id: id(13), content: [{ type: "text", text: "1/2" }], correct: false },
          { id: id(14), content: [{ type: "text", text: "2/6" }], correct: false },
        ],
      },
    },
    {
      id: id(20),
      type: "question",
      number: 2,
      stem: [{ id: id(21), type: "paragraph", content: [{ type: "text", text: "Verdadeiro ou falso?" }] }],
      answer: {
        kind: "trueFalse",
        items: [
          { id: id(22), content: [{ type: "text", text: "1/2 > 1/4" }], value: true },
          { id: id(23), content: [{ type: "text", text: "2/3 = 4/5" }], value: false },
        ],
      },
    },
    {
      id: id(30),
      type: "question",
      stem: [{ id: id(31), type: "paragraph", content: [{ type: "text", text: "Marque as corretas." }] }],
      answer: {
        kind: "checkbox",
        items: [
          { id: id(32), content: [{ type: "text", text: "Opção A" }], checked: true },
          { id: id(33), content: [{ type: "text", text: "Opção B" }], checked: false },
        ],
      },
    },
    {
      id: id(40),
      type: "question",
      stem: [{ id: id(41), type: "paragraph", content: [{ type: "text", text: "Associe." }] }],
      answer: {
        kind: "matching",
        pairs: [
          {
            id: id(42),
            left: [{ type: "text", text: "Brasil" }],
            right: [{ type: "text", text: "Brasília" }],
          },
        ],
      },
    },
    {
      id: id(50),
      type: "question",
      stem: [{ id: id(51), type: "paragraph", content: [{ type: "text", text: "Ordene." }] }],
      answer: {
        kind: "ordering",
        items: [
          { id: id(52), content: [{ type: "text", text: "Segundo" }], position: 2 },
          { id: id(53), content: [{ type: "text", text: "Primeiro" }], position: 1 },
        ],
      },
    },
    {
      id: id(60),
      type: "question",
      stem: [{ id: id(61), type: "paragraph", content: [{ type: "text", text: "Complete." }] }],
      answer: {
        kind: "fillBlank",
        gaps: [
          { id: id(62), answer: "3/4", alternatives: ["0.75"], tip: "some os numeradores" },
          { id: id(63), answer: "1" },
        ],
      },
    },
    {
      id: id(70),
      type: "question",
      stem: [{ id: id(71), type: "paragraph", content: [{ type: "text", text: "Preencha a tabela." }] }],
      answer: {
        kind: "table",
        rows: [
          [[{ type: "text", text: "Termo" }], [{ type: "text", text: "Valor" }]],
          [[{ type: "text", text: "a" }], [{ type: "text", text: "1" }]],
        ],
      },
    },
    {
      id: id(80),
      type: "question",
      stem: [{ id: id(81), type: "paragraph", content: [{ type: "text", text: "Explique." }] }],
      answer: { kind: "open", answerLines: 4 },
    },
  ],
};
