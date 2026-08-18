import { describe, it, expect } from "vitest";
import { TextRun, Paragraph, PageBreak, Table, TableRow, TableCell, WidthType } from "docx";
import {
  docxFileName,
  docxContentBlocks,
  withPageBreak,
  type DocxBlock,
  richTextToRuns,
  blockToDocxParagraphs,
  headerParagraphs,
  docxExportWarnings,
  documentRunStyle,
} from "./exportDocx";
import type {
  Block,
  Inline,
  QuestionAnswer,
  CanonicalDocument,
} from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const text = (t: string): Inline[] => [{ type: "text", text: t }];

describe("docxFileName", () => {
  it("retorna nome padrão quando o cabeçalho não tem título", () => {
    expect(docxFileName({})).toBe("atividade-adaptada.docx");
  });

  it("slugifica o título e adiciona .docx", () => {
    expect(docxFileName({ title: "Minha Prova Final" })).toBe("minha-prova-final.docx");
  });

  it("remove acentos do título", () => {
    expect(docxFileName({ title: "Atividade de Matemática" })).toBe("atividade-de-matematica.docx");
  });

  it("retorna nome padrão quando o título é só espaços", () => {
    expect(docxFileName({ title: "   " })).toBe("atividade-adaptada.docx");
  });

  it("retorna nome padrão quando o título só tem símbolos (slug vazio)", () => {
    expect(docxFileName({ title: "!!!" })).toBe("atividade-adaptada.docx");
  });
});

describe("richTextToRuns", () => {
  it("mapeia texto (com e sem marcas) e TAMBÉM o math inline", () => {
    const nodes: Inline[] = [
      { type: "text", text: "negrito", marks: ["bold", "italic", "underline"] },
      { type: "text", text: "limpo" },
      { type: "inlineMath", latex: "x^2" }, // emitido como LaTeX (B15)
    ];
    const runs = richTextToRuns(nodes);
    expect(runs).toHaveLength(3);
    expect(runs[0]).toBeInstanceOf(TextRun);
  });
});

describe("blockToDocxParagraphs", () => {
  it("heading nível 1 e nível 3 → 1 parágrafo cada", () => {
    expect(
      blockToDocxParagraphs({ id: id(1), type: "heading", level: 1, content: text("H1") }, 1),
    ).toHaveLength(1);
    expect(
      blockToDocxParagraphs({ id: id(2), type: "heading", level: 3, content: text("H3") }, 1),
    ).toHaveLength(1);
  });

  it("paragraph e divider → 1 parágrafo cada", () => {
    expect(
      blockToDocxParagraphs({ id: id(3), type: "paragraph", content: text("p") }, 1),
    ).toHaveLength(1);
    expect(blockToDocxParagraphs({ id: id(4), type: "divider" }, 1)).toHaveLength(1);
  });

  it("blockMath → 1 parágrafo com a fórmula (B15: antes sumia)", () => {
    expect(
      blockToDocxParagraphs({ id: id(5), type: "blockMath", latex: "x" }, 1),
    ).toHaveLength(1);
  });

  it("questão aberta usa answerLines e cai no default 3", () => {
    // stem + 2 linhas + spacer = 4
    expect(
      blockToDocxParagraphs(
        {
          id: id(6),
          type: "question",
          stem: [{ id: id(7), type: "paragraph", content: text("q") }],
          answer: { kind: "open", answerLines: 2 },
        },
        1,
      ),
    ).toHaveLength(4);
    // sem answerLines → default 3: stem + 3 linhas + spacer = 5
    expect(
      blockToDocxParagraphs(
        { id: id(8), type: "question", stem: [], answer: { kind: "open" } },
        1,
      ),
    ).toHaveLength(5);
  });

  it("múltipla escolha renderiza uma alternativa por opção (regressão: lia answer.choices inexistente)", () => {
    const mc = blockToDocxParagraphs(
      {
        id: id(9),
        type: "question",
        customNumber: "1a", // exercita o ramo customNumber ?? number
        stem: [
          { id: id(10), type: "paragraph", content: text("q") },
          { id: id(11), type: "divider" }, // stem não-paragraph → agora renderizado (B15)
        ],
        answer: {
          kind: "multipleChoice",
          alternatives: [
            { id: id(12), content: text("A"), correct: true },
            { id: id(13), content: text("B"), correct: false },
            { id: id(14), content: text("C"), correct: false },
          ],
        },
      },
      1,
    );
    // stem + divider do stem + 3 alternativas + spacer = 6
    expect(mc).toHaveLength(6);
  });

  it("verdadeiro/falso → uma linha POR AFIRMAÇÃO (B15: antes era uma linha fixa)", () => {
    // sem itens não há afirmação a marcar: stem + spacer = 2
    expect(
      blockToDocxParagraphs(
        { id: id(15), type: "question", stem: [], answer: { kind: "trueFalse", items: [] } },
        3,
      ),
    ).toHaveLength(2);
    // dois itens → stem + 2 linhas + spacer = 4
    expect(
      blockToDocxParagraphs(
        {
          id: id(15),
          type: "question",
          stem: [],
          answer: {
            kind: "trueFalse",
            items: [
              { id: id(16), content: text("a"), value: true },
              { id: id(17), content: text("b"), value: false },
            ],
          },
        },
        3,
      ),
    ).toHaveLength(4);
  });

  it("checkbox sem itens → stem + spacer", () => {
    expect(
      blockToDocxParagraphs(
        { id: id(16), type: "question", stem: [], answer: { kind: "checkbox", items: [] } },
        1,
      ),
    ).toHaveLength(2);
  });
});

describe("headerParagraphs", () => {
  it("um parágrafo por campo preenchido", () => {
    expect(
      headerParagraphs({ title: "T", school: "E", teacher: "P", date: "D" }),
    ).toHaveLength(4);
  });

  it("cabeçalho vazio → nenhum parágrafo", () => {
    expect(headerParagraphs({})).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B15 — o Word não pode perder conteúdo em silêncio
// ---------------------------------------------------------------------------
//
// As asserções acima contam PARÁGRAFOS; um mapper que devolve um parágrafo vazio
// passa por elas. Estas leem o TEXTO que chega ao .docx, que é o que o professor
// recebe. A referência de apresentação é o PDF (PdfAnswer/PdfLeafBlocks): o Word
// tem que mostrar o mesmo conteúdo, com o gabarito igualmente OCULTO.

/** Extrai o texto de um nó docx (os runs vivem em nós `w:t`). */
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

/** Todo o texto que um bloco canônico produz no .docx. */
function blockText(block: Block, number = 1): string {
  return blockToDocxParagraphs(block, number).map(docxText).join("\n");
}

const q = (answer: Block extends never ? never : QuestionAnswer, extra: Partial<Block> = {}) =>
  ({
    id: id(90),
    type: "question",
    stem: [{ id: id(91), type: "paragraph", content: text("enunciado do stem") }],
    answer,
    ...extra,
  }) as Block;

describe("B15 · conteúdo que precisa chegar ao Word", () => {
  it("inlineMath vira texto (LaTeX) em vez de sumir", () => {
    const runs = richTextToRuns([
      { type: "text", text: "vale " },
      { type: "inlineMath", latex: "x^2 + 1" },
    ]);
    expect(docxText(runs)).toContain("x^2 + 1");
  });

  it("blockMath emite a fórmula", () => {
    expect(blockText({ id: id(20), type: "blockMath", latex: "\\frac{1}{2}" })).toContain(
      "\\frac{1}{2}",
    );
  });

  it("scaffolding emite todos os passos", () => {
    const out = blockText({
      id: id(21),
      type: "scaffolding",
      items: ["Leia o enunciado", "Identifique os dados"],
    });
    expect(out).toContain("Leia o enunciado");
    expect(out).toContain("Identifique os dados");
  });

  it("image deixa marca no lugar (alt + legenda) em vez de desaparecer", () => {
    const out = blockText({
      id: id(22),
      type: "image",
      src: "https://example.com/a.png",
      alt: "diagrama do ciclo",
      caption: text("Figura 1"),
    });
    expect(out).toContain("diagrama do ciclo");
    expect(out).toContain("Figura 1");
  });

  it("instrução e enunciado da questão são emitidos", () => {
    const out = blockText(
      q({ kind: "open" }, {
        instruction: text("Marque a alternativa correta."),
        enunciado: text("Considere o texto acima."),
      }),
    );
    expect(out).toContain("Marque a alternativa correta.");
    expect(out).toContain("Considere o texto acima.");
  });

  it("trueFalse emite a AFIRMAÇÃO de cada item, sem revelar o gabarito", () => {
    const out = blockText(
      q({
        kind: "trueFalse",
        items: [
          { id: id(30), content: text("O céu é azul."), value: true },
          { id: id(31), content: text("Peixes voam."), value: false },
        ],
      }),
    );
    expect(out).toContain("O céu é azul.");
    expect(out).toContain("Peixes voam.");
    // marcador vazio para o aluno, igual ao PDF
    expect(out).toContain("(  ) V");
    expect(out).not.toMatch(/\bV\)\s*✔|correta/i);
  });

  it("checkbox emite todos os itens com marcador vazio", () => {
    const out = blockText(
      q({
        kind: "checkbox",
        items: [
          { id: id(32), content: text("alfa"), checked: true },
          { id: id(33), content: text("beta"), checked: false },
        ],
      }),
    );
    expect(out).toContain("alfa");
    expect(out).toContain("beta");
    expect(out).toContain("[ ]");
    expect(out).not.toContain("[x]");
  });

  it("matching emite os dois lados de cada par", () => {
    const out = blockText(
      q({
        kind: "matching",
        pairs: [{ id: id(34), left: text("cão"), right: text("late") }],
      }),
    );
    expect(out).toContain("cão");
    expect(out).toContain("late");
  });

  it("ordering emite os itens na ordem original, com espaço para o aluno", () => {
    const out = blockText(
      q({
        kind: "ordering",
        items: [
          { id: id(35), content: text("segundo"), position: 1 },
          { id: id(36), content: text("primeiro"), position: 0 },
        ],
      }),
    );
    expect(out).toContain("segundo");
    expect(out).toContain("primeiro");
    // ordem original preservada (sem sort — o sort seria o gabarito)
    expect(out.indexOf("segundo")).toBeLessThan(out.indexOf("primeiro"));
  });

  it("table emite todas as células", () => {
    const out = blockText(
      q({
        kind: "table",
        rows: [
          [text("Animal"), text("Som")],
          [text("gato"), text("mia")],
        ],
      }),
    );
    for (const cell of ["Animal", "Som", "gato", "mia"]) expect(out).toContain(cell);
  });

  it("stem com blocos não-parágrafo (imagem, fórmula) não é descartado", () => {
    const out = blockText(
      q({ kind: "open" }, {
        stem: [
          { id: id(40), type: "paragraph", content: text("observe:") },
          { id: id(41), type: "blockMath", latex: "a^2" },
        ],
      }),
    );
    expect(out).toContain("observe:");
    expect(out).toContain("a^2");
  });
});

/**
 * Contrato de paridade — espelha `render/pdf/parity.test.ts`.
 *
 * Todo Block.type e todo QuestionAnswer.kind precisa produzir conteúdo no .docx
 * OU estar declarado como omissão consciente. Sem isso, acrescentar um kind novo
 * volta a perder conteúdo em silêncio, que é exatamente o B15.
 */
const BLOCK_TYPES: Block["type"][] = [
  "heading",
  "paragraph",
  "blockMath",
  "image",
  "scaffolding",
  "divider",
  "question",
];

const ANSWER_KINDS: QuestionAnswer["kind"][] = [
  "open",
  "multipleChoice",
  "trueFalse",
  "checkbox",
  "matching",
  "ordering",
  "fillBlank",
  "table",
];

/**
 * `fillBlank` não tem resposta separada a exibir — as lacunas vivem inline no
 * enunciado. É a MESMA decisão do PDF (PdfAnswer devolve uma View vazia), não
 * uma omissão acidental.
 */
const KINDS_WITHOUT_ANSWER_BLOCK: QuestionAnswer["kind"][] = ["fillBlank"];

function sampleAnswer(kind: QuestionAnswer["kind"]): QuestionAnswer {
  switch (kind) {
    case "open":
      return { kind: "open", answerLines: 1 };
    case "multipleChoice":
      return { kind: "multipleChoice", alternatives: [{ id: id(70), content: text("alt"), correct: true }] };
    case "trueFalse":
      return { kind: "trueFalse", items: [{ id: id(71), content: text("afirmação"), value: true }] };
    case "checkbox":
      return { kind: "checkbox", items: [{ id: id(72), content: text("item"), checked: false }] };
    case "matching":
      return { kind: "matching", pairs: [{ id: id(73), left: text("esq"), right: text("dir") }] };
    case "ordering":
      return { kind: "ordering", items: [{ id: id(74), content: text("passo"), position: 0 }] };
    case "fillBlank":
      return { kind: "fillBlank", gaps: [{ id: id(75), answer: "resposta" }] };
    case "table":
      return { kind: "table", rows: [[text("célula")]] };
  }
}

function sampleBlock(type: Block["type"]): Block {
  switch (type) {
    case "heading":
      return { id: id(80), type: "heading", level: 1, content: text("título") };
    case "paragraph":
      return { id: id(81), type: "paragraph", content: text("parágrafo") };
    case "blockMath":
      return { id: id(82), type: "blockMath", latex: "x^2" };
    case "image":
      return { id: id(83), type: "image", src: "https://e.com/a.png", alt: "figura" };
    case "scaffolding":
      return { id: id(84), type: "scaffolding", items: ["passo"] };
    case "divider":
      return { id: id(85), type: "divider" };
    case "question":
      return {
        id: id(86),
        type: "question",
        stem: [{ id: id(87), type: "paragraph", content: text("pergunta") }],
        answer: { kind: "open" },
      };
  }
}

describe("B15 · paridade docx", () => {
  it.each(BLOCK_TYPES)("bloco %s produz conteúdo no docx", (type) => {
    const out = blockToDocxParagraphs(sampleBlock(type), 1);
    expect(out.length).toBeGreaterThan(0);
    // divider não tem texto de conteúdo, mas desenha a linha
    if (type !== "divider") expect(docxText(out).trim().length).toBeGreaterThan(0);
  });

  it.each(ANSWER_KINDS)("resposta %s aparece no docx", (kind) => {
    const before = blockToDocxParagraphs(
      { id: id(88), type: "question", stem: [], answer: { kind: "open", answerLines: 1 } },
      1,
    ).length;
    const out = blockToDocxParagraphs(
      { id: id(89), type: "question", stem: [], answer: sampleAnswer(kind) },
      1,
    );
    if (KINDS_WITHOUT_ANSWER_BLOCK.includes(kind)) {
      // documentado: nada a renderizar além do stem + spacer
      expect(out).toHaveLength(2);
      return;
    }
    expect(out.length).toBeGreaterThanOrEqual(before);
    expect(docxText(out).trim().length).toBeGreaterThan(0);
  });
});

describe("B15 · casos de borda dos mappers", () => {
  it("heading nível 2 mapeia para HEADING_2", () => {
    expect(
      blockToDocxParagraphs({ id: id(100), type: "heading", level: 2, content: text("H2") }, 1),
    ).toHaveLength(1);
  });

  it("imagem sem alt ainda deixa uma marcação genérica", () => {
    const out = blockText({ id: id(101), type: "image", src: "https://e.com/a.png", alt: "" });
    expect(out).toContain("[Imagem]");
  });

  it("imagem com alt só de espaços cai na marcação genérica", () => {
    const out = blockText({ id: id(102), type: "image", src: "https://e.com/a.png", alt: "   " });
    expect(out).toContain("[Imagem]");
  });

  it("tabela sem linhas não produz tabela vazia", () => {
    const out = blockToDocxParagraphs(
      { id: id(103), type: "question", stem: [], answer: { kind: "table", rows: [] } },
      1,
    );
    // stem + spacer, sem tabela
    expect(out).toHaveLength(2);
  });

  it("enunciado com position 'above' vem ANTES do número da questão", () => {
    const out = blockText(
      q({ kind: "open", answerLines: 1 }, {
        enunciado: text("leia antes"),
        enunciadoPosition: "above",
        stem: [{ id: id(104), type: "paragraph", content: text("pergunta") }],
      }),
    );
    expect(out.indexOf("leia antes")).toBeLessThan(out.indexOf("pergunta"));
  });

  it("stem que começa com bloco não-parágrafo mantém número e conteúdo", () => {
    const out = blockText(
      q({ kind: "open", answerLines: 1 }, {
        stem: [{ id: id(105), type: "blockMath", latex: "y=2x" }],
      }),
    );
    expect(out).toContain("1.");
    expect(out).toContain("y=2x");
  });
});

describe("docxExportWarnings", () => {
  const doc = (blocks: Block[]): CanonicalDocument => ({ schemaVersion: 1, blocks });

  it("documento limpo não gera aviso nenhum", () => {
    expect(
      docxExportWarnings(doc([{ id: id(110), type: "paragraph", content: text("oi") }])),
    ).toEqual([]);
  });

  it("avisa sobre imagem, inclusive dentro do stem de uma questão", () => {
    const warnings = docxExportWarnings(
      doc([
        {
          id: id(111),
          type: "question",
          stem: [{ id: id(112), type: "image", src: "https://e.com/a.png", alt: "f" }],
          answer: { kind: "open" },
        },
      ]),
    );
    expect(warnings.join(" ")).toMatch(/imagens não são embutidas/i);
  });

  it("avisa sobre math de bloco e math inline", () => {
    expect(
      docxExportWarnings(doc([{ id: id(113), type: "blockMath", latex: "x" }])).join(" "),
    ).toMatch(/fórmulas/i);
    expect(
      docxExportWarnings(
        doc([
          {
            id: id(114),
            type: "paragraph",
            content: [{ type: "text", text: "a" }, { type: "inlineMath", latex: "x" }],
          },
        ]),
      ).join(" "),
    ).toMatch(/fórmulas/i);
  });

  it("avisa sobre fonte de acessibilidade, mas não sobre as clássicas", () => {
    const clean = doc([{ id: id(115), type: "paragraph", content: text("oi") }]);
    expect(docxExportWarnings(clean, { fontFamily: "opendyslexic" }).join(" ")).toMatch(
      /OpenDyslexic/,
    );
    expect(docxExportWarnings(clean, { fontFamily: "serif" })).toEqual([]);
    expect(docxExportWarnings(clean, { fontFamily: "fonte-legada-qualquer" })).toEqual([]);
    expect(docxExportWarnings(clean, {})).toEqual([]);
  });

  /**
   * O aviso olhava só `paragraph`/`heading`. Mas `inlineMath` cabe em TODO campo
   * RichText — alternativa, enunciado, instrução, par de associação, célula de
   * tabela, legenda. Nesses casos o LaTeX ia para o arquivo e o professor não
   * era avisado, que é exatamente o silêncio que o B15 existe para acabar.
   */
  describe("math fora de paragraph/heading", () => {
    const math: Inline[] = [{ type: "inlineMath", latex: "\\frac{1}{2}" }];
    const question = (over: Partial<Extract<Block, { type: "question" }>>): Block => ({
      id: id(120),
      type: "question",
      stem: [{ id: id(121), type: "paragraph", content: text("enunciado") }],
      answer: { kind: "open" },
      ...over,
    });

    const cases: [string, Block][] = [
      ["alternativa de múltipla escolha", question({
        answer: {
          kind: "multipleChoice",
          alternatives: [{ id: id(122), content: math, correct: true }],
        },
      })],
      ["enunciado da questão", question({ enunciado: math })],
      ["instrução da questão", question({ instruction: math })],
      ["item de verdadeiro/falso", question({
        answer: { kind: "trueFalse", items: [{ id: id(123), content: math, value: true }] },
      })],
      ["item de checkbox", question({
        answer: { kind: "checkbox", items: [{ id: id(124), content: math, checked: false }] },
      })],
      ["item de ordenação", question({
        answer: { kind: "ordering", items: [{ id: id(125), content: math, position: 0 }] },
      })],
      ["par de associação", question({
        answer: {
          kind: "matching",
          pairs: [{ id: id(126), left: math, right: text("dir") }],
        },
      })],
      ["célula de tabela", question({
        answer: { kind: "table", rows: [[math]] },
      })],
      ["legenda de imagem", {
        id: id(127), type: "image", src: "https://e.com/a.png", alt: "f", caption: math,
      }],
    ];

    it.each(cases)("avisa sobre fórmula em %s", (_label, block) => {
      expect(docxExportWarnings(doc([block])).join(" ")).toMatch(/fórmulas/i);
    });

    it("acha math aninhada no stem de uma questão", () => {
      expect(
        docxExportWarnings(
          doc([question({ stem: [{ id: id(128), type: "blockMath", latex: "x" }] })]),
        ).join(" "),
      ).toMatch(/fórmulas/i);
    });

    it("percorre todo tipo de bloco e resposta sem inventar aviso de fórmula", () => {
      const warnings = docxExportWarnings(
        doc([
          { id: id(130), type: "heading", level: 1, content: text("Título") },
          { id: id(131), type: "scaffolding", items: ["passo"] },
          { id: id(132), type: "divider" },
          question({
            answer: { kind: "fillBlank", gaps: [{ id: id(133), answer: "resposta" }] },
          }),
        ]),
      );
      expect(warnings.join(" ")).not.toMatch(/fórmulas/i);
    });

    it("não inventa aviso quando não há math em campo nenhum", () => {
      expect(
        docxExportWarnings(
          doc([
            question({
              enunciado: text("sem math"),
              instruction: text("leia"),
              answer: {
                kind: "matching",
                pairs: [{ id: id(129), left: text("a"), right: text("b") }],
              },
            }),
          ]),
        ),
      ).toEqual([]);
    });
  });
});

/**
 * O estilo de run do documento (fonte + corpo de acessibilidade escolhidos em
 * "Aparência") morava dentro de `downloadDocx`, que é `v8 ignore` — ou seja, a
 * correção central do B15 não tinha teste nenhum. Extraído para poder ser
 * verificado sem empacotar um .docx de verdade.
 */
describe("documentRunStyle", () => {
  it("sem pageStyle, não impõe estilo nenhum", () => {
    expect(documentRunStyle()).toEqual({});
    expect(documentRunStyle({})).toEqual({});
  });

  it("traduz o token de fonte para o nome que o Word entende", () => {
    expect(documentRunStyle({ fontFamily: "opendyslexic" })).toEqual({ font: "OpenDyslexic" });
    expect(documentRunStyle({ fontFamily: "serif" })).toEqual({ font: "Times New Roman" });
  });

  it("repassa fonte desconhecida sem traduzir (documento legado)", () => {
    expect(documentRunStyle({ fontFamily: "Comic Sans MS" })).toEqual({ font: "Comic Sans MS" });
  });

  it("converte o tamanho para meio-pontos, que é a unidade do docx", () => {
    expect(documentRunStyle({ fontSize: 14 })).toEqual({ size: 28 });
    expect(documentRunStyle({ fontSize: 10.5 })).toEqual({ size: 21 });
  });

  it("arredonda meio-ponto fracionário em vez de truncar", () => {
    expect(documentRunStyle({ fontSize: 12.3 })).toEqual({ size: 25 });
  });

  it("combina fonte e tamanho", () => {
    expect(documentRunStyle({ fontFamily: "lexend", fontSize: 16 })).toEqual({
      font: "Lexend",
      size: 32,
    });
  });
});

/**
 * Achado 0132 — o switch "Quebra de página por questão" chegava à prévia, ao PDF
 * e ao "Copiar" e sumia no Word: o .docx saía sem nenhum `<w:br w:type="page"/>`,
 * com a questão 2 colada no fim da questão 1. O mesmo valia para o
 * `style.pageBreakBefore` do nó canônico, que o PDF já honrava.
 */
describe("docxContentBlocks · quebra de página (achado 0132)", () => {
  const q = (n: number, style?: Block["style"]): Block => ({
    id: id(n),
    type: "question",
    stem: [{ id: id(n + 100), type: "paragraph", content: text(`questão ${n}`) }],
    answer: { kind: "open", answerLines: 1 },
    ...(style ? { style } : {}),
  });
  const doc = (blocks: Block[]): CanonicalDocument => ({ schemaVersion: 1, blocks });
  const hasPageBreak = (block: DocxBlock): boolean =>
    block instanceof Paragraph &&
    (block as unknown as { root: unknown[] }).root.some((child) => child instanceof PageBreak);

  it("sem o switch, nenhum bloco carrega quebra", () => {
    const blocks = docxContentBlocks(doc([q(1), q(2)]));
    expect(blocks.filter(hasPageBreak)).toHaveLength(0);
  });

  it("com o switch, quebra antes da segunda questão em diante (nunca antes da primeira)", () => {
    const blocks = docxContentBlocks(doc([q(1), q(2), q(3)]), {
      header: {},
      pageBreakPerQuestion: true,
    });
    // Uma quebra por questão a partir da segunda — a mesma derivação do PDF.
    expect(blocks.filter(hasPageBreak)).toHaveLength(2);
    expect(hasPageBreak(blocks[0])).toBe(false);
  });

  it("honra o style.pageBreakBefore do nó canônico mesmo com o switch desligado", () => {
    const blocks = docxContentBlocks(
      doc([
        { id: id(1), type: "paragraph", content: text("intro") },
        q(2, { pageBreakBefore: true }),
      ]),
    );
    expect(blocks.filter(hasPageBreak)).toHaveLength(1);
  });

  it("a quebra não desloca a numeração das questões", () => {
    const blocks = docxContentBlocks(doc([q(1), q(2)]), {
      header: {},
      pageBreakPerQuestion: true,
    });
    // O primeiro parágrafo do bloco quebrado continua sendo o "2. " da questão.
    const broken = blocks.find(hasPageBreak) as unknown as { root: { root?: unknown[] }[] };
    expect(JSON.stringify(broken.root)).toContain("2. ");
  });
});

describe("withPageBreak", () => {
  it("prende a quebra ao primeiro parágrafo do bloco, sem parágrafo vazio extra", () => {
    const paragraphs = [new Paragraph({ children: [new TextRun({ text: "a" })] })];
    const out = withPageBreak(paragraphs);
    expect(out).toHaveLength(1);
    expect((out[0] as unknown as { root: unknown[] }).root.some((c) => c instanceof PageBreak)).toBe(
      true,
    );
  });

  it("quando o bloco começa por uma tabela, insere um parágrafo só com a quebra", () => {
    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph({})] })] })],
    });
    const out = withPageBreak([table]);
    expect(out).toHaveLength(2);
    expect((out[0] as unknown as { root: unknown[] }).root.some((c) => c instanceof PageBreak)).toBe(
      true,
    );
    expect(out[1]).toBe(table);
  });
});
