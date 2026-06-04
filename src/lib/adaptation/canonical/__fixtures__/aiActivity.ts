/**
 * Sample AI output fixtures for ai.ts tests.
 *
 * These objects intentionally mirror what Gemini structured-output returns:
 * no `id` fields anywhere, using the AiActivity shape.
 */

import type { AiActivity } from "../ai";

// ---------------------------------------------------------------------------
// Valid fixtures
// ---------------------------------------------------------------------------

/** Rich activity covering heading, paragraph with inline math, image,
 *  multipleChoice (1 correct), trueFalse, and fillBlank. */
export const validRichActivity: AiActivity = {
  blocks: [
    {
      type: "heading",
      level: 2,
      content: [{ type: "text", text: "Atividade: Frações" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Considere a expressão " },
        { type: "inlineMath", latex: "\\frac{a}{b} + \\frac{c}{d}" },
        { type: "text", text: " e responda." },
      ],
    },
    {
      type: "image",
      src: "https://example.com/fractions.png",
      alt: "Diagrama de frações",
      width: 600,
      alignment: "center",
      caption: [{ type: "text", text: "Figura 1" }],
    },
    {
      type: "question",
      number: 1,
      points: 2,
      difficulty: "facil",
      stem: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Qual é o resultado de 1/2 + 1/4?" }],
        },
      ],
      instruction: [{ type: "text", text: "Escolha a opção correta." }],
      answer: {
        kind: "multipleChoice",
        alternatives: [
          { content: [{ type: "text", text: "3/4" }], correct: true },
          { content: [{ type: "text", text: "1/2" }], correct: false },
          { content: [{ type: "text", text: "2/6" }], correct: false },
        ],
      },
    },
    {
      type: "question",
      number: 2,
      difficulty: "medio",
      stem: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Indique verdadeiro ou falso." }],
        },
      ],
      answer: {
        kind: "trueFalse",
        items: [
          {
            content: [{ type: "text", text: "1/2 > 1/4" }],
            value: true,
          },
          {
            content: [{ type: "text", text: "2/3 = 4/5" }],
            value: false,
          },
        ],
      },
    },
    {
      type: "question",
      number: 3,
      difficulty: "dificil",
      stem: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Preencha a lacuna." }],
        },
      ],
      answer: {
        kind: "fillBlank",
        gaps: [
          {
            answer: "3/4",
            alternatives: ["0.75"],
            tip: "some the numerators over the common denominator",
          },
        ],
      },
    },
  ],
  strategies_applied: ["visual_support", "scaffolding"],
  pedagogical_justification: "Uses visual aids to support fraction comprehension.",
  implementation_tips: ["Print in color", "Allow calculator use"],
};

/** Minimal valid activity — single open question. */
export const validMinimalActivity: AiActivity = {
  blocks: [
    {
      type: "question",
      stem: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Explique com suas palavras." }],
        },
      ],
      answer: { kind: "open", answerLines: 5 },
    },
  ],
  strategies_applied: [],
  pedagogical_justification: "Open-ended question to promote critical thinking.",
  implementation_tips: [],
};

/** Activity with scaffolding block. */
export const validScaffoldingActivity: AiActivity = {
  blocks: [
    {
      type: "scaffolding",
      items: ["Passo 1: leia o enunciado", "Passo 2: identifique os dados"],
    },
    {
      type: "question",
      stem: [
        {
          type: "blockMath",
          latex: "\\int_0^1 x^2\\,dx",
          alt: "integral of x squared from 0 to 1",
        },
      ],
      answer: { kind: "open" },
    },
  ],
  strategies_applied: ["scaffolding"],
  pedagogical_justification: "Scaffolded steps guide problem-solving process.",
  implementation_tips: [],
};

/** Activity with checkbox, matching, ordering, and table answers. */
export const validAllAnswerTypesActivity: AiActivity = {
  blocks: [
    {
      type: "question",
      stem: [
        { type: "paragraph", content: [{ type: "text", text: "Select all correct." }] },
      ],
      answer: {
        kind: "checkbox",
        items: [
          { content: [{ type: "text", text: "A" }], checked: true },
          { content: [{ type: "text", text: "B" }], checked: false },
        ],
      },
    },
    {
      type: "question",
      stem: [
        { type: "paragraph", content: [{ type: "text", text: "Match pairs." }] },
      ],
      answer: {
        kind: "matching",
        pairs: [
          {
            left: [{ type: "text", text: "Left 1" }],
            right: [{ type: "text", text: "Right 1" }],
          },
        ],
      },
    },
    {
      type: "question",
      stem: [
        { type: "paragraph", content: [{ type: "text", text: "Order correctly." }] },
      ],
      answer: {
        kind: "ordering",
        items: [
          { content: [{ type: "text", text: "First" }], position: 1 },
          { content: [{ type: "text", text: "Second" }], position: 2 },
        ],
      },
    },
    {
      type: "question",
      stem: [
        { type: "paragraph", content: [{ type: "text", text: "Complete the table." }] },
      ],
      answer: {
        kind: "table",
        rows: [
          [[{ type: "text", text: "Cell A" }], [{ type: "text", text: "Cell B" }]],
          [[{ type: "text", text: "Cell C" }], [{ type: "text", text: "Cell D" }]],
        ],
      },
    },
  ],
  strategies_applied: ["variety"],
  pedagogical_justification: "Covers all answer types.",
  implementation_tips: [],
};

// ---------------------------------------------------------------------------
// Adversarial fixtures (used to test parseAiActivity rejection)
// ---------------------------------------------------------------------------

/** multipleChoice with 0 correct answers — must be rejected. */
export const adversarialZeroCorrect = {
  blocks: [
    {
      type: "question",
      stem: [{ type: "paragraph", content: [{ type: "text", text: "Q?" }] }],
      answer: {
        kind: "multipleChoice",
        alternatives: [
          { content: [{ type: "text", text: "A" }], correct: false },
          { content: [{ type: "text", text: "B" }], correct: false },
        ],
      },
    },
  ],
  strategies_applied: [],
  pedagogical_justification: "test",
  implementation_tips: [],
};

/** multipleChoice with 2 correct answers — must be rejected. */
export const adversarialTwoCorrect = {
  blocks: [
    {
      type: "question",
      stem: [{ type: "paragraph", content: [{ type: "text", text: "Q?" }] }],
      answer: {
        kind: "multipleChoice",
        alternatives: [
          { content: [{ type: "text", text: "A" }], correct: true },
          { content: [{ type: "text", text: "B" }], correct: true },
        ],
      },
    },
  ],
  strategies_applied: [],
  pedagogical_justification: "test",
  implementation_tips: [],
};

/** Missing pedagogical_justification entirely. */
export const adversarialMissingJustification = {
  blocks: [
    {
      type: "question",
      stem: [{ type: "paragraph", content: [{ type: "text", text: "Q?" }] }],
      answer: { kind: "open" },
    },
  ],
  strategies_applied: [],
  // pedagogical_justification is intentionally absent
  implementation_tips: [],
};

/** A question whose stem contains another question — must be rejected
 *  because AiContentBlockSchema has no "question" variant. */
export const adversarialNestedQuestion = {
  blocks: [
    {
      type: "question",
      stem: [
        // nested question inside stem — not allowed in AI schema
        {
          type: "question",
          stem: [{ type: "paragraph", content: [{ type: "text", text: "inner" }] }],
          answer: { kind: "open" },
        },
      ],
      answer: { kind: "open" },
    },
  ],
  strategies_applied: [],
  pedagogical_justification: "test",
  implementation_tips: [],
};

/** Unknown block type in the top-level blocks array. */
export const adversarialUnknownBlockType = {
  blocks: [
    {
      type: "unknown_block",
      content: "whatever",
    },
  ],
  strategies_applied: [],
  pedagogical_justification: "test",
  implementation_tips: [],
};

/** blocks is not an array. */
export const adversarialNonArrayBlocks = {
  blocks: "not an array",
  strategies_applied: [],
  pedagogical_justification: "test",
  implementation_tips: [],
};
