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
  documentMetadata,
  docxSectionProperties,
  docxFooter,
} from "./exportDocx";
import {
  HEADING_PT,
  PAGE_MARGIN_PT,
  RULE_COLOR,
  RULE_WIDTH_PT,
  pageTokensToPdf,
  ELEMENT_FONT_RATIOS,
  BASE_FONT_PT,
} from "../render/pageTokens";
import { pdfFooterLabel } from "../render/footerLabel";
import type {
  Block,
  Inline,
  QuestionAnswer,
  CanonicalDocument,
} from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const text = (t: string): Inline[] => [{ type: "text", text: t }];

/** Atributos do primeiro nó com esse `rootKey` (ex.: `w:jc`, `w:spacing`). */
function docxNodeAttrs(node: unknown, rootKey: string): Record<string, unknown> | undefined {
  let found: Record<string, unknown> | undefined;
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o === null || typeof o !== "object") return;
    const n = o as { rootKey?: string; root?: unknown };
    if (n.rootKey === rootKey && Array.isArray(n.root)) {
      const attr = n.root.find((c) => (c as { rootKey?: string }).rootKey === "_attr") as
        | { root?: Record<string, { value?: unknown }> }
        | undefined;
      if (attr?.root) {
        found ??= Object.fromEntries(
          Object.entries(attr.root)
            .filter(([, v]) => v?.value !== undefined)
            .map(([k, v]) => [k, v.value]),
        );
      }
    }
    Object.values(o as Record<string, unknown>).forEach(walk);
  };
  walk(node);
  return found;
}

/** Tinta do documento na forma que o docx aceita (hex cru, sem `#`). */
const DOCX_INK_HEX = pageTokensToPdf().color.replace("#", "");
const PT_BR = { value: "pt-BR" };

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
  it("um parágrafo por bloco do cabeçalho, mais o separador", () => {
    // Professor(a) e Data dividem UMA linha, como no PDF (achado 0142).
    expect(headerParagraphs({ title: "T", school: "E", teacher: "P", date: "D" })).toHaveLength(4);
  });

  // Achado 0426: o separador entre cabeçalho e conteúdo era emitido SEMPRE, então
  // com os campos em branco (o estado padrão do Passo 6) o .docx abria com um
  // parágrafo vazio no topo — o PDF e a prévia começam colados na margem.
  it("cabeçalho vazio → nenhum parágrafo, nem o separador", () => {
    expect(headerParagraphs({})).toHaveLength(0);
  });

  // Achado 0133: a data saía crua do `<input type="date">` (ISO) só no Word,
  // enquanto prévia, PDF e "Copiar" passam por `formatHeaderDateBR`.
  it("formata a data em dd/mm/aaaa como as outras saídas", () => {
    const paragraphs = headerParagraphs({ date: "2026-08-18" });
    expect(docxText(paragraphs[0])).toBe("Data: 18/08/2026");
  });

  it("data em formato livre passa intacta", () => {
    const paragraphs = headerParagraphs({ date: "18 de agosto" });
    expect(docxText(paragraphs[0])).toBe("Data: 18 de agosto");
  });

  it("o separador é o último parágrafo e não tem texto", () => {
    const paragraphs = headerParagraphs({ title: "T" });
    expect(paragraphs).toHaveLength(2);
    expect(docxText(paragraphs[0])).toBe("T");
    expect(docxText(paragraphs[1])).toBe("");
  });
});
// ---------------------------------------------------------------------------
// 0142 — o cabeçalho do Word espelha o do PDF
// ---------------------------------------------------------------------------
//
// O mesmo cabeçalho do Passo 6 virava dois desenhos: no PDF e na prévia, título
// centralizado em 18pt, escola abaixo, Professor(a)/Data nos extremos e uma
// régua; no Word, quatro linhas rotuladas à esquerda, inclusive um "Título:"
// impresso em cima do título. A referência é `PdfHeader` (AdaptationPdf.tsx).
describe("0142 · o cabeçalho do Word espelha o do PDF", () => {
  /** Valores dos nós com esse `rootKey`, já sem o invólucro `{key, value}`. */
  function vals(node: unknown, key: string): unknown[] {
    return docxRunProps(node)
      .filter((p) => p.key === key)
      .map((p) => (p.val && typeof p.val === "object" ? (p.val as { value?: unknown }).value : p.val));
  }
  /** Valor do primeiro nó com esse `rootKey` (ex.: `w:jc` → "center"). */
  const firstVal = (node: unknown, key: string): unknown => vals(node, key)[0];
  const full = () =>
    headerParagraphs({
      title: "Prova de Ciências",
      school: "Escola Municipal Teste",
      teacher: "Prof. Alexandre",
      date: "2026-08-22",
    });

  it("o título sai centralizado, em negrito e no corpo do PDF, sem o rótulo", () => {
    const title = full()[0];
    expect(docxText(title)).toBe("Prova de Ciências");
    expect(firstVal(title, "w:jc")).toBe("center");
    expect(firstVal(title, "w:sz")).toBe(36);
    expect(docxRunProps(title).some((p) => p.key === "w:b")).toBe(true);
  });

  it("a escola sai centralizada abaixo do título, a 11pt", () => {
    const school = full()[1];
    expect(docxText(school)).toBe("Escola Municipal Teste");
    expect(firstVal(school, "w:jc")).toBe("center");
    expect(firstVal(school, "w:sz")).toBe(22);
  });

  it("professor e data dividem UMA linha, a 10pt, com a data alinhada à direita", () => {
    const meta = full()[2];
    expect(docxText(meta)).toContain("Professor(a): Prof. Alexandre");
    expect(docxText(meta)).toContain("Data: 22/08/2026");
    expect(firstVal(meta, "w:sz")).toBe(20);
    // A data vai para o extremo oposto por uma parada de tabulação à direita,
    // que é como o Word faz o `space-between` do PDF.
    expect(vals(meta, "w:tab")).toContain("right");
    expect(vals(meta, "w:tab")).toContain(undefined);
  });

  it("a régua do cabeçalho é a borda inferior da linha Professor(a)/Data", () => {
    expect(paragraphBorder(full()[2], "w:bottom")).toEqual({
      style: "single",
      size: Math.round(RULE_WIDTH_PT * 8),
      color: "333333",
    });
  });

  it("só o título preenchido → ele mesmo carrega a régua", () => {
    const only = headerParagraphs({ title: "T" });
    expect(docxText(only[0])).toBe("T");
    expect(paragraphBorder(only[0], "w:bottom")).toBeDefined();
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
  it("inlineMath vira texto (LaTeX) em vez de sumir, com espaços inquebráveis (0425)", () => {
    const runs = richTextToRuns([
      { type: "text", text: "vale " },
      { type: "inlineMath", latex: "x^2 + 1" },
    ]);
    expect(docxText(runs)).toContain("x^2\u00a0+\u00a01");
  });

  it("blockMath emite a fórmula sem espaço quebrável (0425)", () => {
    expect(blockText({ id: id(20), type: "blockMath", latex: "\\frac{1}{2} = 0.5" })).toContain(
      "\\frac{1}{2}\u00a0=\u00a00.5",
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

/**
 * Atributos de uma das bordas (`w:pBdr` → `w:top`/`w:bottom`/…) de um parágrafo
 * docx, na forma `{ style, color, size }`.
 */
function paragraphBorder(node: unknown, side: string): Record<string, unknown> | undefined {
  let found: Record<string, unknown> | undefined;
  const attrs = (o: unknown): Record<string, unknown> | undefined => {
    const kids = (o as { root?: unknown[] }).root ?? [];
    for (const k of kids) {
      const n = k as { rootKey?: string; root?: Record<string, { key: string; value?: unknown }> };
      if (n.rootKey !== "_attr" || !n.root) continue;
      return Object.fromEntries(
        Object.entries(n.root)
          .filter(([, v]) => v?.value !== undefined)
          .map(([k2, v]) => [k2, v.value]),
      );
    }
    return undefined;
  };
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o === null || typeof o !== "object") return;
    const n = o as { rootKey?: string; root?: unknown[] };
    if (n.rootKey === "w:pBdr" && Array.isArray(n.root)) {
      for (const edge of n.root) {
        if ((edge as { rootKey?: string }).rootKey === side) found ??= attrs(edge);
      }
    }
    Object.values(o as Record<string, unknown>).forEach(walk);
  };
  walk(node);
  return found;
}

describe("divider no .docx (achado 0168)", () => {
  const divider = () => blockToDocxParagraphs({ id: id(200), type: "divider" }, 1)[0];

  it("não emite caracteres de desenho de caixa como texto", () => {
    // Antes saíam 40 U+2500: texto editável, reflowável, lido pelo leitor de
    // tela e dependente do glifo existir na fonte escolhida.
    expect(docxText(divider())).toBe("");
  });

  it("desenha a régua como borda do parágrafo, com a cor e a espessura do token de página", () => {
    expect(paragraphBorder(divider(), "w:bottom")).toEqual({
      style: "single",
      color: RULE_COLOR.slice(1),
      size: Math.round(RULE_WIDTH_PT * 8),
    });
  });
});

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
  /**
   * Achado 0332: documento sem `pageStyle` (o caso normal, ninguém grava nada
   * até abrir o popover "Formato") saía com `<w:rPrDefault/>` vazio, e o Word
   * aplicava o default DELE (Calibri 11pt/Aptos), enquanto o PDF e as telas
   * imprimiam Arial/Helvetica 12pt. O default resolvido do projeto vale para as
   * três superfícies.
   */
  it("sem pageStyle, cai no mesmo default das outras superfícies (Arial 12pt)", () => {
    expect(documentRunStyle()).toEqual({
      font: "Arial",
      size: 24,
      color: DOCX_INK_HEX,
      language: PT_BR,
    });
    expect(documentRunStyle({})).toEqual({
      font: "Arial",
      size: 24,
      color: DOCX_INK_HEX,
      language: PT_BR,
    });
  });

  it("traduz o token de fonte para o nome que o Word entende", () => {
    expect(documentRunStyle({ fontFamily: "opendyslexic" })).toEqual({
      font: "OpenDyslexic",
      size: 24,
      color: DOCX_INK_HEX,
      language: PT_BR,
    });
    expect(documentRunStyle({ fontFamily: "serif" })).toEqual({
      font: "Times New Roman",
      size: 24,
      color: DOCX_INK_HEX,
      language: PT_BR,
    });
  });

  it("repassa fonte desconhecida sem traduzir (documento legado)", () => {
    expect(documentRunStyle({ fontFamily: "Comic Sans MS" })).toEqual({
      font: "Comic Sans MS",
      size: 24,
      color: DOCX_INK_HEX,
      language: PT_BR,
    });
  });

  it("converte o tamanho para meio-pontos, que é a unidade do docx", () => {
    expect(documentRunStyle({ fontSize: 14 })).toEqual({
      font: "Arial",
      size: 28,
      color: DOCX_INK_HEX,
      language: PT_BR,
    });
    expect(documentRunStyle({ fontSize: 10.5 })).toEqual({
      font: "Arial",
      size: 21,
      color: DOCX_INK_HEX,
      language: PT_BR,
    });
  });

  it("arredonda meio-ponto fracionário em vez de truncar", () => {
    expect(documentRunStyle({ fontSize: 12.3 })).toEqual({
      font: "Arial",
      size: 25,
      color: DOCX_INK_HEX,
      language: PT_BR,
    });
  });

  it("combina fonte e tamanho", () => {
    expect(documentRunStyle({ fontFamily: "lexend", fontSize: 16 })).toEqual({
      font: "Lexend",
      size: 32,
      color: DOCX_INK_HEX,
      language: PT_BR,
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

/** Coleta os pares `{rootKey, val}` das propriedades de run do parágrafo. */
function docxRunProps(node: unknown): Array<{ key: string; val: unknown }> {
  const found: Array<{ key: string; val: unknown }> = [];
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o === null || typeof o !== "object") return;
    const n = o as { rootKey?: string; root?: unknown };
    if (typeof n.rootKey === "string") {
      // O valor de um nó (`<w:sz w:val="36"/>`) mora num filho `_attr`.
      const attr = Array.isArray(n.root)
        ? (n.root.find(
            (c) => (c as { rootKey?: string }).rootKey === "_attr",
          ) as { root?: { val?: unknown } } | undefined)
        : undefined;
      found.push({ key: n.rootKey, val: attr?.root?.val });
    }
    Object.values(o as Record<string, unknown>).forEach(walk);
  };
  walk(node);
  return found;
}

/**
 * Achado 0164 — o título saía azul (#2E74B5), 16pt e sem negrito no Word,
 * porque o parágrafo delegava tudo ao estilo `Heading1` da lib `docx`. Nas
 * outras três superfícies ele é negrito, no corpo de `HEADING_PT` e na tinta
 * do documento (`DEFAULT_INK`, desde o achado 0166).
 */
describe("0164 · título do Word com a tinta, o peso e o corpo das outras superfícies", () => {
  it.each([
    [1 as const, HEADING_PT[1] * 2],
    [2 as const, HEADING_PT[2] * 2],
    [3 as const, HEADING_PT[3] * 2],
  ])("heading nível %i sai negrito, na tinta do documento e em %i meios-pontos", (level, halfPoints) => {
    const [paragraph] = blockToDocxParagraphs(
      { id: id(164), type: "heading", level, content: text("Prova") },
      1,
    );
    const props = docxRunProps(paragraph);
    expect(props.some((p) => p.key === "w:b")).toBe(true);
    expect(props.some((p) => p.key === "w:color" && p.val === DOCX_INK_HEX)).toBe(true);
    expect(props.some((p) => p.key === "w:sz" && p.val === halfPoints)).toBe(true);
  });
});

/**
 * Achado 0166 — o `.docx` era a única das quatro superfícies fora do
 * `DEFAULT_INK`: o `docDefaults` saía sem `<w:color>` (corpo no preto do Word)
 * e o título vinha com `#000000` escrito à mão. A asserção é de IGUALDADE com
 * a tinta que o PDF emite, e não contra o literal `22201C` — um teste contra o
 * literal deixaria a próxima divergência passar, que é como esta nasceu.
 */
describe("0166 · o Word imprime na mesma tinta das outras superfícies", () => {
  /** A tinta do PDF em hex sem `#`, que é a forma que o docx aceita. */
  const inkHex = DOCX_INK_HEX;

  it("o docDefaults do documento carrega a tinta das outras superfícies", () => {
    expect(documentRunStyle().color).toBe(inkHex);
    expect(documentRunStyle({ fontFamily: "lexend", fontSize: 16 }).color).toBe(inkHex);
  });

  it("o título casa com o corpo, na tinta do documento", () => {
    const [paragraph] = blockToDocxParagraphs(
      { id: id(166), type: "heading", level: 1, content: text("Prova") },
      1,
    );
    const colors = docxRunProps(paragraph).filter((p) => p.key === "w:color");
    expect(colors.length).toBeGreaterThan(0);
    colors.forEach((p) => expect(p.val).toBe(inkHex));
  });
});

/**
 * Achado 0134 — o Word era a única saída que apagava a formatação escolhida
 * pela professora: a cor e o tamanho do run inline (`InlineText.color` /
 * `.fontSize`) nunca eram lidos, e `block.style` (`NodeStyle`: align, color,
 * fontSize, fontFamily, spacingAfter) não chegava ao arquivo — o PDF honra
 * tudo por `nodeStyleToPdf` e a tela por `nodeStyleToCss`.
 */
describe("0134 · o Word carrega a formatação por nó", () => {
  it("o run inline sai na cor e no corpo que a tela e o PDF mostram", () => {
    const runs = richTextToRuns([
      { type: "text", text: "Palavra em destaque", color: "#DC2626", fontSize: 18 },
    ]);
    const props = docxRunProps(runs[0]);
    expect(props.some((p) => p.key === "w:color" && p.val === "DC2626")).toBe(true);
    // fontSize inline é pt (como em `textRunStyle`/`marksToPdfStyle`): 18pt = 36 meios-pontos.
    expect(props.some((p) => p.key === "w:sz" && p.val === 36)).toBe(true);
  });

  it("cor fora da paleta do documento não vira propriedade de run", () => {
    const runs = richTextToRuns([{ type: "text", text: "x", color: "#123456" }]);
    expect(docxRunProps(runs[0]).some((p) => p.key === "w:color" && p.val === "123456")).toBe(false);
  });

  it("o `block.style` do parágrafo vira alinhamento, espaçamento e estilo de run", () => {
    const [paragraph] = blockToDocxParagraphs(
      {
        id: id(134),
        type: "paragraph",
        content: text("centralizado"),
        style: {
          align: "center",
          color: "#2563EB",
          fontSize: 24,
          fontFamily: "georgia",
          spacingAfter: 16,
        },
      },
      1,
    );
    expect(docxNodeAttrs(paragraph, "w:jc")).toEqual({ val: "center" });
    // px → twips (1px = 0,75pt; 1pt = 20 twips): 16px = 240 twips.
    expect(docxNodeAttrs(paragraph, "w:spacing")).toEqual({ after: 240 });
    const props = docxRunProps(paragraph);
    expect(props.some((p) => p.key === "w:color" && p.val === "2563EB")).toBe(true);
    // NodeStyle.fontSize é px (como em `nodeStyleToPdf`): 24px = 18pt = 36 meios-pontos.
    expect(props.some((p) => p.key === "w:sz" && p.val === 36)).toBe(true);
    expect(docxNodeAttrs(paragraph, "w:rFonts")).toMatchObject({ ascii: "Georgia" });
  });

  it("o espaçamento depois do bloco vai no ÚLTIMO parágrafo, não em cada um", () => {
    const style = { spacingAfter: 16 } as const;
    const [label, passo] = blockToDocxParagraphs(
      { id: id(139), type: "scaffolding", items: ["um", "dois"], style },
      1,
    ) as [unknown, unknown];
    expect(docxNodeAttrs(label, "w:spacing")).toBeUndefined();
    expect(docxNodeAttrs(passo, "w:spacing")).toBeUndefined();

    // Sem passos, o rótulo é o último (e único) parágrafo do bloco.
    const [soRotulo] = blockToDocxParagraphs(
      { id: id(140), type: "scaffolding", items: [], style },
      1,
    );
    expect(docxNodeAttrs(soRotulo, "w:spacing")).toEqual({ after: 240 });

    // A legenda é o último parágrafo do bloco de imagem; sem ela, é a marcação.
    const [marcacao, legenda] = blockToDocxParagraphs(
      { id: id(141), type: "image", src: "https://e.com/a.png", caption: text("fig"), style },
      1,
    ) as [unknown, unknown];
    expect(docxNodeAttrs(marcacao, "w:spacing")).toBeUndefined();
    expect(docxNodeAttrs(legenda, "w:spacing")).toEqual({ after: 240 });
    const [semLegenda] = blockToDocxParagraphs(
      { id: id(142), type: "image", src: "https://e.com/a.png", style },
      1,
    );
    expect(docxNodeAttrs(semLegenda, "w:spacing")).toEqual({ after: 240 });
  });

  it("o alinhamento do bloco vale para o heading e para a questão inteira", () => {
    const [heading] = blockToDocxParagraphs(
      { id: id(135), type: "heading", level: 1, content: text("T"), style: { align: "right" } },
      1,
    );
    expect(docxNodeAttrs(heading, "w:jc")).toEqual({ val: "right" });

    const question = blockToDocxParagraphs(
      {
        id: id(136),
        type: "question",
        stem: [{ id: id(137), type: "paragraph", content: text("pergunta") }],
        answer: { kind: "multipleChoice", alternatives: [{ id: id(138), content: text("a") }] },
        style: { align: "justify", color: "#16A34A" },
      },
      1,
    );
    question.forEach((p) => {
      if (p instanceof Paragraph) expect(docxNodeAttrs(p, "w:jc")).toEqual({ val: "both" });
    });
    expect(docxRunProps(question).some((p) => p.key === "w:color" && p.val === "16A34A")).toBe(true);
  });
});

/**
 * Achado 0331: a seção do .docx ia sem `properties`, então a margem era o
 * default da lib `docx` (1440 twips = 1 polegada = 72pt) contra os 40pt que o
 * PDF e as duas telas leem de `PAGE_MARGIN_PT`. Na mesma folha A4 isso deixa a
 * coluna do Word 12,4% mais estreita (451,28pt contra 515,28pt) e reflowa o
 * documento inteiro: o professor aprova a prévia e abre um arquivo com outras
 * quebras de linha e outra contagem de páginas.
 */
describe("docxSectionProperties", () => {
  it("deriva a margem da página de PAGE_MARGIN_PT, nos quatro lados", () => {
    const twips = Math.round(PAGE_MARGIN_PT * 20); // 1pt = 20 twips
    expect(docxSectionProperties()).toEqual({
      page: { margin: { top: twips, right: twips, bottom: twips, left: twips } },
    });
  });

  it("não usa a margem de 1 polegada que a lib docx aplica por default", () => {
    const { margin } = docxSectionProperties().page;
    Object.values(margin).forEach((side) => expect(side).not.toBe(1440));
  });
});

/**
 * Achado 0333: a legenda da imagem era o único texto secundário que o Word
 * imprimia no corpo do documento. A folha, a prévia e o PDF a desenham em
 * `ELEMENT_FONT_RATIOS.caption` (10pt no corpo padrão); o run da legenda saía
 * sem `<w:sz>` nenhum, do mesmo tamanho do enunciado, e a única pista de que
 * aquela linha é legenda sumia no arquivo aberto.
 */
describe("0333 · legenda da imagem no Word sai no corpo de legenda", () => {
  const captionHalfPoints = Math.round(ELEMENT_FONT_RATIOS.caption * BASE_FONT_PT * 2);

  it("emite a legenda no tamanho de elemento que as outras superfícies usam", () => {
    const [, legenda] = blockToDocxParagraphs(
      {
        id: id(333),
        type: "image",
        src: "https://e.com/a.png",
        alt: "figura",
        caption: text("Figura 1 - esquema largo de apoio"),
      },
      1,
    ) as [unknown, unknown];
    const props = docxRunProps(legenda);
    expect(props.some((p) => p.key === "w:sz" && p.val === captionHalfPoints)).toBe(true);
  });

  it("não carimba o tamanho de legenda por cima do que a professora escolheu no bloco", () => {
    const [, legenda] = blockToDocxParagraphs(
      {
        id: id(334),
        type: "image",
        src: "https://e.com/a.png",
        caption: text("Figura 1"),
        style: { fontSize: 24 }, // px → 18pt → 36 meios-pontos
      },
      1,
    ) as [unknown, unknown];
    const props = docxRunProps(legenda);
    expect(props.some((p) => p.key === "w:sz" && p.val === 36)).toBe(true);
    expect(props.some((p) => p.key === "w:sz" && p.val === captionHalfPoints)).toBe(false);
  });
});

// Achado 0334: a seção do .docx ia sem `footers`, então o Word era a única das
// três saídas sem rodapé — nem título/escola, nem "Página X de Y" — justamente
// na saída que o professor imprime em lote.
describe("docxFooter", () => {
  /** Instruções de campo (`w:instrText`) que o parágrafo emite. */
  const fieldInstructions = (node: unknown): string[] => {
    const parts: string[] = [];
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o === null || typeof o !== "object") return;
      const n = o as { rootKey?: string; root?: unknown };
      if (n.rootKey === "w:instrText" && Array.isArray(n.root)) {
        for (const p of n.root) if (typeof p === "string") parts.push(p);
      }
      Object.values(o as Record<string, unknown>).forEach(walk);
    };
    walk(node);
    return parts;
  };

  it("numera a página com os campos do Word, não com texto fixo", () => {
    const instructions = fieldInstructions(docxFooter({}));
    expect(instructions).toContain("PAGE");
    expect(instructions).toContain("NUMPAGES");
    expect(docxText(docxFooter({}))).toContain("Página ");
    expect(docxText(docxFooter({}))).toContain(" de ");
  });

  it("prefixa título e escola com o mesmo separador do PDF e da prévia", () => {
    // O texto é o mesmo do PDF/prévia; só os números saem daqui, porque no Word
    // quem os resolve é o campo, na hora de paginar.
    const header = { title: "Prova", school: "Escola X" };
    expect(pdfFooterLabel(header, 1, 2)).toBe("Prova · Escola X · Página 1 de 2");
    expect(docxText(docxFooter(header))).toBe("Prova · Escola X · Página  de ");
  });

  it("descarta título e escola em branco, sem separador solto", () => {
    expect(docxText(docxFooter({ title: "  ", school: "" }))).toBe("Página  de ");
  });
});

/**
 * Achado 0343: `ImageBlock.alignment` (o campo que os botões "Alinhar à
 * esquerda / Centralizar / Alinhar à direita" do chrome da imagem gravam) vive
 * FORA do `NodeStyle` e o `case "image"` do Word nunca o lia — a folha, a
 * prévia e o PDF alinhavam a figura e a legenda, e o .docx saía sem um `<w:jc>`
 * sequer.
 */
describe("0343 · alinhamento da imagem chega ao Word", () => {
  it("leva `alignment` do bloco para os dois parágrafos (marcação e legenda)", () => {
    const paragraphs = blockToDocxParagraphs(
      {
        id: id(343),
        type: "image",
        src: "https://e.com/a.png",
        alt: "figura larga de apoio",
        alignment: "right",
        caption: text("Figura 1 - esquema largo de apoio"),
      },
      1,
    );
    expect(paragraphs).toHaveLength(2);
    paragraphs.forEach((p) => expect(docxNodeAttrs(p, "w:jc")).toEqual({ val: "right" }));
  });

  it("centraliza a marcação mesmo sem legenda", () => {
    const [marcacao] = blockToDocxParagraphs(
      { id: id(344), type: "image", src: "https://e.com/a.png", alignment: "center" },
      1,
    );
    expect(docxNodeAttrs(marcacao, "w:jc")).toEqual({ val: "center" });
  });

  it("sem `alignment` segue sem `w:jc` (o default do Word já é à esquerda)", () => {
    const [marcacao] = blockToDocxParagraphs(
      { id: id(345), type: "image", src: "https://e.com/a.png" },
      1,
    );
    expect(docxNodeAttrs(marcacao, "w:jc")).toBeUndefined();
  });

  it("o alinhamento da imagem vence o `align` do NodeStyle, como no PDF", () => {
    const [marcacao] = blockToDocxParagraphs(
      {
        id: id(346),
        type: "image",
        src: "https://e.com/a.png",
        alignment: "right",
        style: { align: "left" },
      },
      1,
    );
    expect(docxNodeAttrs(marcacao, "w:jc")).toEqual({ val: "right" });
  });
});

describe("documentMetadata", () => {
  /**
   * Achado 0344: o `new Document(...)` ia sem nenhum metadado, então o `.docx`
   * saía assinado "Un-named" (o default da lib `docx`, texto VISÍVEL na janela
   * Propriedades do Word, na coluna Autor do Explorer e no card do Drive) e sem
   * `<dc:title>` — o mesmo defeito que a 0310 consertou no PDF.
   */
  it("grava o título do cabeçalho como título do documento", () => {
    expect(documentMetadata({ title: "  Prova de Ciências  " }).title).toBe("Prova de Ciências");
  });

  it("sem título no cabeçalho, usa o mesmo rótulo do PDF", () => {
    expect(documentMetadata({}).title).toBe("Atividade adaptada");
    expect(documentMetadata({ title: "   " }).title).toBe("Atividade adaptada");
  });

  it("assina com o professor do cabeçalho, nunca com o 'Un-named' da lib", () => {
    const meta = documentMetadata({ teacher: "  Ana Lima  " });
    expect(meta.creator).toBe("Ana Lima");
    expect(meta.lastModifiedBy).toBe("Ana Lima");
  });

  it("sem professor, assina com o nome do produto", () => {
    const meta = documentMetadata({});
    expect(meta.creator).toBe("Olhar Singular");
    expect(meta.lastModifiedBy).toBe("Olhar Singular");
    expect(JSON.stringify(meta)).not.toContain("Un-named");
  });

  it("descreve a origem do arquivo", () => {
    expect(documentMetadata({}).description).toBe(
      "Atividade adaptada no Olhar Singular.",
    );
  });
});

describe("documentRunStyle — idioma", () => {
  /**
   * Achado 0344: sem `w:lang` o Word trata o documento com o idioma da
   * instalação — corretor e hifenização erram o português inteiro e o leitor de
   * tela lê pt-BR com a pronúncia de outro idioma (WCAG 3.1.1). O PDF já sai
   * com `language="pt-BR"` (achado 0310).
   */
  it("marca o corpo inteiro como pt-BR", () => {
    expect(documentRunStyle().language).toEqual({ value: "pt-BR" });
    expect(documentRunStyle({ fontSize: 14 }).language).toEqual({ value: "pt-BR" });
  });
});

describe("Word imprime a descrição legível da fórmula (achado 0401)", () => {
  it("inlineMath com alt sai como texto legível, não como LaTeX", () => {
    const runs = richTextToRuns([
      { type: "text", text: "vale " },
      { type: "inlineMath", latex: "x^2 + 1", alt: "x ao quadrado mais 1" },
    ]);
    expect(docxText(runs)).toContain("x ao quadrado mais 1");
    expect(docxText(runs)).not.toContain("^");
  });

  it("blockMath com alt sai como texto legível", () => {
    expect(
      blockText({
        id: id(220),
        type: "blockMath",
        latex: "\\frac{1}{2} = 0.5",
        alt: "um meio igual a zero vírgula cinco",
      }),
    ).toContain("um meio igual a zero vírgula cinco");
  });

  it("sem alt continua saindo o LaTeX costurado", () => {
    expect(blockText({ id: id(221), type: "blockMath", latex: "\\frac{1}{2} = 0.5" })).toContain(
      "\\frac{1}{2}\u00a0=\u00a00.5",
    );
  });
});
