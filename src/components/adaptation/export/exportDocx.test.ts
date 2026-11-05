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
  docxDocumentStyles,
  DOCX_CONTENT_WIDTH_TWIPS,
  buildDocxDocument,
  xmlSafe,
} from "./exportDocx";
import { DEFAULT_PANEL_SETTINGS } from "./panelSettings";
import { headerNeedsRelease, rowNeedsSplit, tableCellColumnPt } from "../render/pdf/tableRowFit";
import {
  HEADING_PT,
  PAGE_MARGIN_PT,
  RULE_COLOR,
  RULE_WIDTH_PT,
  pageTokensToPdf,
  ELEMENT_FONT_RATIOS,
  BASE_FONT_PT,
  TRUE_FALSE_MARKER_TEXT,
  ORDERING_MARKER_TEXT,
  ANSWER_ITEM_GAP_PT,
  TABLE_CELL_PADDING_PT,
  BASE_LINE_HEIGHT,
  ANSWER_LINE_COLOR,
  ANSWER_LINE_WIDTH_PT,
  questionNumberColumnPt,
  alternativeMarkerColumnPt,
  resolveElementFontSizes,
  scaffoldingStepColumnPt,
  SCAFFOLDING_PADDING_PT,
} from "../render/pageTokens";
import { FOOTER_COLOR, FOOTER_FONT_SIZE_PT, pdfFooterLabel } from "../render/footerLabel";
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

  it("sem título, usa o primeiro heading do documento (achado 0100)", () => {
    const comHeading = {
      schemaVersion: 1,
      blocks: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          type: "heading",
          level: 1,
          content: [{ type: "text", text: "Prova de Ciências" }],
        },
      ],
    } as CanonicalDocument;
    const semHeading = { schemaVersion: 1, blocks: [] } as CanonicalDocument;
    expect(docxFileName({ title: "" }, comHeading)).toBe("prova-de-ciencias.docx");
    expect(docxFileName({ title: "Outra" }, comHeading)).toBe("outra.docx");
    expect(docxFileName({}, semHeading)).toBe("atividade-adaptada.docx");
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

  it("mantém a linha de Professor(a) quando não há data", () => {
    // A linha é UMA só, com a parada de tabulação à direita reservando o lugar
    // da data (achado 0142). Preencher só um dos dois campos é o caso comum —
    // a prova vai com o nome do professor e a data escrita à mão na impressão.
    const paras = headerParagraphs({ teacher: "Prof. Alexandre" });
    expect(paras).toHaveLength(2); // a linha Professor(a)/Data + o separador
    expect(docxText(paras[0])).toContain("Professor(a): Prof. Alexandre");
    expect(docxText(paras[0])).not.toContain("Data:");
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
    expect(out).toContain("( ) V");
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
    // A caixa deixou de ser texto e virou borda de run (achado 0358); a
    // paridade com as outras superfícies é guardada por checkboxBoxParity.
    expect(out).not.toContain("[");
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

  it("0455 · matching sai em colunas: tabela sem bordas, elo de largura fixa no meio", () => {
    // Antes: um parágrafo por par (`Peixe  ↔  Rio`), e a seta e a coluna da
    // direita mudavam de x conforme o tamanho do termo da esquerda.
    const out = blockToDocxParagraphs(
      q({
        kind: "matching",
        pairs: [
          { id: id(34), left: text("Peixe"), right: text("Rio") },
          { id: id(37), left: text("Onça-pintada"), right: text("Floresta") },
        ],
      }),
      1,
    );
    const tables = out.filter((b) => b instanceof Table) as Table[];
    expect(tables).toHaveLength(1);
    const table = tables[0] as unknown as { root: unknown[] };
    const children = (n: unknown, key: string) =>
      ((n as { root: unknown[] }).root ?? []).filter(
        (c) => (c as { rootKey?: string }).rootKey === key,
      );

    // grade fixa de 3 colunas: esquerda e direita iguais, elo estreito no meio,
    // somando a largura útil da folha
    const grid = children(table, "w:tblGrid")[0];
    const widths = children(grid, "w:gridCol").map((n) =>
      Number(docxNodeAttrs(n, "w:gridCol")?.width),
    );
    expect(widths).toHaveLength(3);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(DOCX_CONTENT_WIDTH_TWIPS);
    expect(widths[0]).toBe(widths[2]);
    expect(widths[1]).toBeLessThan(widths[0] / 4);
    expect(docxNodeAttrs(table, "w:tblLayout")?.type).toBe("fixed");

    // sem moldura: é uma folha de associação, não uma tabela de dados
    const borders = children(children(table, "w:tblPr")[0], "w:tblBorders")[0];
    expect(borders).toBeDefined();
    for (const edge of (borders as { root: unknown[] }).root) {
      const key = (edge as { rootKey?: string }).rootKey;
      if (key === "_attr") continue;
      expect(docxNodeAttrs(edge, key!)?.style).toBe("none");
    }

    // cada par é uma linha com [esquerda, ↔, direita], cada um na sua célula
    const rows = children(table, "w:tr");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => children(r, "w:tc").map((c) =>
      // só a árvore XML: o TableCell também guarda `options.children`
      docxText((c as { root: unknown }).root),
    ))).toEqual([
      ["Peixe", "↔", "Rio"],
      ["Onça-pintada", "↔", "Floresta"],
    ]);
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

  it("0199 · o marcador de V/F do Word é o MESMO token das outras superfícies", () => {
    // O token não pode trazer espaço duplo: HTML (`white-space: normal`) e
    // `@react-pdf` colapsam espaço consecutivo, e o run do `docx` escreve o
    // texto literal — o espaço duplo dava ao Word um marcador mais largo, com
    // a afirmação começando noutro ponto.
    expect(TRUE_FALSE_MARKER_TEXT).not.toMatch(/ {2}/);
    const out = blockText(
      q({
        kind: "trueFalse",
        items: [{ id: id(37), content: text("O céu é azul."), value: true }],
      }),
    );
    expect(out).toContain(TRUE_FALSE_MARKER_TEXT);
    expect(out).not.toMatch(/\( {2}\)/);
  });

  it("0199 · o marcador de ordenação do Word é o MESMO token das outras superfícies", () => {
    const out = blockText(
      q({
        kind: "ordering",
        items: [{ id: id(38), content: text("passo"), position: 0 }],
      }),
    );
    expect(out).toContain(ORDERING_MARKER_TEXT);
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

  it("table marca o cabeçalho para repetir e protege a linha da quebra", () => {
    // Achado 0603: sem `tblHeader` o Word deixa a página seguinte com linhas de
    // dados órfãs, sem rótulo de coluna; sem `cantSplit` ele ainda parte a linha
    // ao meio da virada (mesmo sintoma do 0602 no lado do PDF).
    const table = blockToDocxParagraphs(
      q({
        kind: "table",
        rows: [
          [text("Animal"), text("Som")],
          [text("gato"), text("mia")],
        ],
      }),
      1,
    ).find((b) => b instanceof Table) as Table;
    const [header, body] = (table as unknown as { root: TableRow[] }).root.filter(
      (n) => (n as unknown as { rootKey?: string }).rootKey === "w:tr",
    );
    // `w:tblHeader`/`w:cantSplit` são tags sem atributo — basta existirem.
    const has = (node: unknown, rootKey: string): boolean => {
      if (Array.isArray(node)) return node.some((n) => has(n, rootKey));
      if (node === null || typeof node !== "object") return false;
      if ((node as { rootKey?: string }).rootKey === rootKey) return true;
      return Object.values(node as Record<string, unknown>).some((v) => has(v, rootKey));
    };
    expect(has(header, "w:tblHeader")).toBe(true);
    expect(has(header, "w:cantSplit")).toBe(true);
    // linha de dados: não é cabeçalho, mas também não se parte
    expect(has(body, "w:tblHeader")).toBe(false);
    expect(has(body, "w:cantSplit")).toBe(true);
  });

  describe("table alta: o mesmo contrato do PDF (N-U-009)", () => {
    const hasTag = (node: unknown, rootKey: string): boolean => {
      if (Array.isArray(node)) return node.some((n) => hasTag(n, rootKey));
      if (node === null || typeof node !== "object") return false;
      if ((node as { rootKey?: string }).rootKey === rootKey) return true;
      return Object.values(node as Record<string, unknown>).some((v) => hasTag(v, rootKey));
    };
    const rowsOf = (rows: Inline[][], bodyPt?: number) => {
      const table = blockToDocxParagraphs(q({ kind: "table", rows }), 1, undefined, false, bodyPt).find(
        (b) => b instanceof Table,
      ) as Table;
      return (table as unknown as { root: TableRow[] }).root.filter(
        (n) => (n as unknown as { rootKey?: string }).rootKey === "w:tr",
      );
    };
    const words = (n: number): Inline[] => text("palavra ".repeat(n).trim());

    it("cabeçalho que ocuparia boa parte da folha não repete (sem tblHeader) e a linha alta não ganha cantSplit", () => {
      const [header, body] = rowsOf([
        [words(100), words(100)],
        [words(100), words(100)],
      ]);
      expect(hasTag(header, "w:tblHeader")).toBe(false);
      expect(hasTag(header, "w:cantSplit")).toBe(true);
      expect(hasTag(body, "w:tblHeader")).toBe(false);
      expect(hasTag(body, "w:cantSplit")).toBe(true);
      const [tallHeader, tallBody] = rowsOf([
        [words(100), words(100)],
        [words(900), words(900)],
      ]);
      expect(hasTag(tallHeader, "w:tblHeader")).toBe(false);
      expect(hasTag(tallBody, "w:cantSplit")).toBe(false);
    });

    for (const cols of [2, 3, 4]) {
      it(`a fronteira é a do PDF, com ${cols} colunas: o cabeçalho solta onde headerNeedsRelease solta, a linha onde rowNeedsSplit fatia`, () => {
        const column = tableCellColumnPt(cols);
        const rowOf = (n: number) => Array.from({ length: cols }, () => words(n));
        const firstWhere = (fn: (row: Inline[][]) => boolean) => {
          for (let n = 1; ; n += 1) if (fn(rowOf(n))) return n;
        };
        const release = firstWhere((r) => headerNeedsRelease(r, 12, column));
        const split = firstWhere((r) => rowNeedsSplit(r, 12, column));
        expect(release).toBeGreaterThan(1);
        expect(split).toBeGreaterThan(release);
        const at = (n: number) => rowsOf([rowOf(n), rowOf(n)]);
        expect(hasTag(at(release - 1)[0], "w:tblHeader")).toBe(true);
        expect(hasTag(at(release)[0], "w:tblHeader")).toBe(false);
        expect(hasTag(at(split - 1)[1], "w:cantSplit")).toBe(true);
        expect(hasTag(at(split)[1], "w:cantSplit")).toBe(false);
      });
    }

    it("o corpo da fonte entra na conta: o mesmo texto a 24 pt solta o cabeçalho que a 12 pt repetia", () => {
      const rows = [[words(40), words(40)], [words(2), words(2)]];
      expect(hasTag(rowsOf(rows, 12)[0], "w:tblHeader")).toBe(true);
      expect(hasTag(rowsOf(rows, 24)[0], "w:tblHeader")).toBe(false);
    });
  });

  it("table declara a grade com a largura útil da página dividida pelas colunas", () => {
    // Achado 0605: sem `columnWidths` a lib emite `<w:gridCol w:w="100"/>` (1,76mm)
    // por coluna, uma grade que não descreve o próprio conteúdo.
    const table = blockToDocxParagraphs(
      q({
        kind: "table",
        rows: [
          [text("Animal"), text("Som")],
          [text("gato"), text("mia"), text("extra")],
        ],
      }),
      1,
    ).find((b) => b instanceof Table) as Table;
    const grid = (table as unknown as { root: unknown[] }).root.find(
      (n) => (n as { rootKey?: string }).rootKey === "w:tblGrid",
    ) as { root: unknown[] };
    const widths = grid.root
      .filter((n) => (n as { rootKey?: string }).rootKey === "w:gridCol")
      .map((n) => Number(docxNodeAttrs(n, "w:gridCol")?.width));
    // 3 colunas (a linha mais larga manda), somando a largura útil em twips.
    expect(widths).toHaveLength(3);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(DOCX_CONTENT_WIDTH_TWIPS);
    // divisão igual, a menos do resto que fecha a soma na última coluna
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    expect(widths.every((w) => w > 1000)).toBe(true);
  });

  it("table pinta a moldura com a tinta e a espessura de régua do documento (0522)", () => {
    // Achado 0522: sem `borders` a lib emite `<w:tblBorders>` single com
    // `w:color="auto"` (preto), enquanto o PDF e a tela usam a régua do documento.
    const table = blockToDocxParagraphs(
      q({ kind: "table", rows: [[text("A"), text("B")], [text("c"), text("d")]] }),
      1,
    ).find((b) => b instanceof Table) as unknown as { root: unknown[] };
    const tblPr = table.root.find(
      (n) => (n as { rootKey?: string }).rootKey === "w:tblPr",
    ) as { root: unknown[] };
    const borders = tblPr.root.find(
      (n) => (n as { rootKey?: string }).rootKey === "w:tblBorders",
    ) as { root: unknown[] };
    expect(borders).toBeDefined();
    const edges = borders.root
      .map((e) => (e as { rootKey?: string }).rootKey!)
      .filter((k) => k !== "_attr");
    expect(edges.sort()).toEqual(
      ["w:bottom", "w:insideH", "w:insideV", "w:left", "w:right", "w:top"].sort(),
    );
    for (const edge of borders.root) {
      const key = (edge as { rootKey?: string }).rootKey!;
      if (key === "_attr") continue;
      const attrs = docxNodeAttrs(edge, key);
      expect(attrs?.style).toBe("single");
      expect(attrs?.color).toBe(RULE_COLOR.slice(1));
      expect(attrs?.size).toBe(Math.round(RULE_WIDTH_PT * 8));
    }
  });

  it("table declara o recuo da célula de TABLE_CELL_PADDING_PT nos quatro lados", () => {
    // Achado 0268: sem `w:tblCellMar` o Word aplica o default dele (108 twips à
    // esquerda/direita, 0 em cima/embaixo) e a célula quebra uma palavra antes
    // da folha, da prévia e do PDF, que usam 3pt em todos os lados.
    const table = blockToDocxParagraphs(
      q({ kind: "table", rows: [[text("Substância"), text("Estado")]] }),
      1,
    ).find((b) => b instanceof Table) as unknown as { root: unknown[] };
    const tblPr = table.root.find(
      (n) => (n as { rootKey?: string }).rootKey === "w:tblPr",
    ) as { root: unknown[] };
    const cellMar = tblPr.root.find(
      (n) => (n as { rootKey?: string }).rootKey === "w:tblCellMar",
    );
    expect(cellMar).toBeDefined();
    const twips = Math.round(TABLE_CELL_PADDING_PT * 20);
    for (const side of ["w:top", "w:left", "w:bottom", "w:right"]) {
      expect(docxNodeAttrs(cellMar, side)).toMatchObject({ size: twips, type: "dxa" });
    }
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

describe("pauta da questão aberta no .docx (achado 0523)", () => {
  // stem vazio: [0] é o número da questão, [1..2] a pauta, o último o spacer.
  const lines = (style?: Block["style"]) =>
    blockToDocxParagraphs(
      {
        id: id(210),
        type: "question",
        stem: [],
        answer: { kind: "open", answerLines: 2 },
        ...(style ? { style } : {}),
      },
      1,
    ).slice(1, 3);

  it("não escreve a pauta como texto (60 '_' dependiam da fonte e quebravam em corpo grande)", () => {
    for (const line of [...lines(), ...lines({ fontSize: 28 } as Block["style"])]) {
      expect(docxText(line)).toBe("");
    }
  });

  it("desenha cada linha como borda inferior tracejada na tinta e espessura dos tokens da pauta", () => {
    for (const line of lines()) {
      expect(paragraphBorder(line, "w:bottom")).toEqual({
        style: "dashed",
        color: ANSWER_LINE_COLOR.slice(1),
        size: Math.round(ANSWER_LINE_WIDTH_PT * 8),
      });
    }
  });

  it("declara a borda between igual à bottom (achado 0526: parágrafos de borda idêntica viram um grupo e só a última linha era desenhada)", () => {
    for (const line of lines()) {
      expect(paragraphBorder(line, "w:between")).toEqual(paragraphBorder(line, "w:bottom"));
    }
  });
});

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

/**
 * Linhas de resposta no Word (achado 0454): nascem na margem, como o marcador
 * da tela, da prévia e do PDF (sem o recuo de 18 pt que o arquivo trazia), e
 * cada uma leva o vão `ANSWER_ITEM_GAP_PT` depois, o mesmo token do PDF. Sem o
 * vão as caixas do checkbox encostavam umas nas outras e viravam uma barra.
 */
const ROW_KINDS_0519 = ["multipleChoice", "trueFalse", "checkbox", "matching", "ordering"] as const;

describe("linhas de resposta do .docx (achado 0454)", () => {
  const ROW_KINDS = ["multipleChoice", "trueFalse", "checkbox", "matching", "ordering"] as const;

  it.each(ROW_KINDS)("%s: linha na margem, item único sem vão depois", (kind) => {
    const out = blockToDocxParagraphs(
      { id: id(90), type: "question", stem: [], answer: sampleAnswer(kind) },
      1,
    );
    const rows = out.filter((p) => docxText(p).trim().length > 0 && !/^\d+\.?$/.test(docxText(p).trim()));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // O marcador nasce na margem: sem recuo, ou (múltipla escolha, achado
      // 0524) com recuo pendente igual ao recuo, que devolve a 1ª linha a zero.
      const ind = docxNodeAttrs(row, "w:ind");
      if (kind === "multipleChoice") expect(ind?.left).toBe(ind?.hanging);
      else expect(ind).toBeUndefined();
      // Item único é o último: sem o vão entre itens (achado 0519); o vão dos
      // itens anteriores é coberto no describe do 0519.
      expect(docxNodeAttrs(row, "w:spacing")).toEqual({ after: 0 });
    }
  });
});

/**
 * Achado 0519: o vão entre itens vale só ENTRE itens, como o `rowStyle` do
 * `PdfAnswer` (achado 0707). A última linha levava `after` de 6 pt e o fecho da
 * questão somava o vão de bloco por cima: 18 pt no Word contra 12 pt no PDF.
 */
describe("última linha de resposta do .docx sem o vão entre itens (achado 0519)", () => {
  const twoItems = (kind: (typeof ROW_KINDS_0519)[number]): QuestionAnswer => {
    switch (kind) {
      case "multipleChoice":
        return {
          kind,
          alternatives: [
            { id: id(91), content: text("a1"), correct: true },
            { id: id(92), content: text("a2"), correct: false },
          ],
        };
      case "trueFalse":
        return {
          kind,
          items: [
            { id: id(91), content: text("t1"), value: true },
            { id: id(92), content: text("t2"), value: false },
          ],
        };
      case "checkbox":
        return {
          kind,
          items: [
            { id: id(91), content: text("c1"), checked: false },
            { id: id(92), content: text("c2"), checked: true },
          ],
        };
      case "matching":
        return {
          kind,
          pairs: [
            { id: id(91), left: text("e1"), right: text("d1") },
            { id: id(92), left: text("e2"), right: text("d2") },
          ],
        };
      case "ordering":
        return {
          kind,
          items: [
            { id: id(91), content: text("o1"), position: 0 },
            { id: id(92), content: text("o2"), position: 1 },
          ],
        };
    }
  };

  it.each(ROW_KINDS_0519)("%s: só as linhas antes da última levam o vão", (kind) => {
    const out = blockToDocxParagraphs(
      { id: id(93), type: "question", stem: [], answer: twoItems(kind) },
      1,
    );
    const gap = { after: Math.round(ANSWER_ITEM_GAP_PT * 20) };
    const spacingOf = (needle: string) => {
      const holder = out.find((p) => docxText(p).includes(needle))!;
      if (kind !== "matching") return docxNodeAttrs(holder, "w:spacing");
      // Na associação as linhas são linhas da tabela: procura a célula do termo.
      const rows: unknown[] = [];
      const walk = (o: unknown): void => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (o === null || typeof o !== "object") return;
        if ((o as { rootKey?: string }).rootKey === "w:tr") rows.push(o);
        else Object.values(o as Record<string, unknown>).forEach(walk);
      };
      walk(holder);
      const row = rows.find((r) => docxText(r).includes(needle));
      return docxNodeAttrs(row, "w:spacing");
    };
    const [first, last] =
      kind === "matching" ? ["e1", "e2"] : kind === "multipleChoice" ? ["a1", "a2"]
        : kind === "trueFalse" ? ["t1", "t2"] : kind === "checkbox" ? ["c1", "c2"] : ["o1", "o2"];
    expect(spacingOf(first)).toEqual(gap);
    expect(spacingOf(last)).toEqual({ after: 0 });
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
    // O primeiro parágrafo do bloco quebrado continua sendo o "2." da questão
    // (seguido de tab desde o achado 0524, que pôs o número em coluna).
    const broken = blocks.find(hasPageBreak) as unknown as { root: { root?: unknown[] }[] };
    expect(JSON.stringify(broken.root)).toContain('"2."');
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
    // px → twips (1px = 0,75pt; 1pt = 20 twips): 16px = 240 twips. A linha sai
    // do corpo do bloco, 18pt x 1,4 = 504 twips (achado 0518).
    expect(docxNodeAttrs(paragraph, "w:spacing")).toEqual({
      after: 240,
      line: 504,
      lineRule: "atLeast",
    });
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
    // O rótulo leva só a linha do corpo de legenda dele (achado 0518), sem vão.
    expect(docxNodeAttrs(label, "w:spacing")).not.toHaveProperty("after");
    expect(docxNodeAttrs(passo, "w:spacing")).toBeUndefined();

    // Sem passos, o rótulo é o último (e único) parágrafo do bloco.
    const [soRotulo] = blockToDocxParagraphs(
      { id: id(140), type: "scaffolding", items: [], style },
      1,
    );
    expect(docxNodeAttrs(soRotulo, "w:spacing")).toMatchObject({ after: 240 });

    // A legenda é o último parágrafo do bloco de imagem; sem ela, é a marcação.
    const [marcacao, legenda] = blockToDocxParagraphs(
      { id: id(141), type: "image", src: "https://e.com/a.png", caption: text("fig"), style },
      1,
    ) as [unknown, unknown];
    expect(docxNodeAttrs(marcacao, "w:spacing")).toBeUndefined();
    expect(docxNodeAttrs(legenda, "w:spacing")).toMatchObject({ after: 240 });
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
    expect(docxText(docxFooter(header))).toBe("Prova · Escola X · Página 1 de 1");
  });

  it("descarta título e escola em branco, sem separador solto", () => {
    expect(docxText(docxFooter({ title: "  ", school: "" }))).toBe("Página 1 de 1");
  });

  // Achado 0525: o campo saía como begin/instr/separate/end num run só, sem run
  // de resultado; quem resolve o campo (LibreOffice) desenhava o número no corpo
  // do documento (12pt, tinta de corpo), e não nos 8pt cinza do rodapé.
  it("emite o número de cada campo num run de resultado com o corpo e a cor do rodapé", () => {
    type RunInfo = { fld: string[]; text: string; sz: unknown; color: unknown };
    const runs: RunInfo[] = [];
    const attrOf = (n: { root?: unknown }): Record<string, { value?: unknown }> => {
      const a = Array.isArray(n.root)
        ? (n.root.find((c) => (c as { rootKey?: string }).rootKey === "_attr") as
            | { root?: Record<string, { value?: unknown }> }
            | undefined)
        : undefined;
      return a?.root ?? {};
    };
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o === null || typeof o !== "object") return;
      const n = o as { rootKey?: string; root?: unknown };
      if (n.rootKey === "w:r" && Array.isArray(n.root)) {
        const props = docxRunProps(n);
        const types: string[] = [];
        const collect = (c: unknown): void => {
          if (Array.isArray(c)) return c.forEach(collect);
          if (c === null || typeof c !== "object") return;
          const m = c as { rootKey?: string; root?: unknown };
          if (m.rootKey === "w:fldChar") {
            const attrs = attrOf(m) as Record<string, unknown>;
            const t = Object.values(attrs).find(
              (v) => (v as { key?: string })?.key === "w:fldCharType",
            ) as { value?: string } | undefined;
            types.push(t?.value ?? String((attrs as { type?: unknown }).type));
          }
          Object.values(m).forEach(collect);
        };
        collect(n.root);
        runs.push({
          fld: types,
          text: docxText(n),
          sz: props.find((p) => p.key === "w:sz")?.val,
          color: props.find((p) => p.key === "w:color")?.val,
        });
        return;
      }
      Object.values(o as Record<string, unknown>).forEach(walk);
    };
    walk(docxFooter({}));

    const separates = runs
      .map((r, i) => (r.fld.includes("separate") ? i : -1))
      .filter((i) => i >= 0);
    expect(separates).toHaveLength(2);
    for (const i of separates) {
      expect(runs[i].fld).not.toContain("end");
      const result = runs[i + 1];
      expect(result.text).toMatch(/\d/);
      expect(result.sz).toBe(Math.round(FOOTER_FONT_SIZE_PT * 2));
      expect(String(result.color).toUpperCase()).toBe(FOOTER_COLOR.slice(1).toUpperCase());
      expect(runs[i + 2].fld).toContain("end");
    }
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

  /**
   * Achado 0192: sem `header.title` (o campo do Exportar nasce vazio, com o
   * título do documento só como placeholder), o `.docx` caía direto no genérico
   * enquanto imprimia o heading na primeira linha do papel. A cadeia passa a
   * ser a MESMA que a tela sugere: header → heading do documento → genérico.
   */
  it("sem título no cabeçalho, deriva do heading do documento", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          type: "heading",
          level: 2,
          content: [{ type: "text", text: "Prova de Ciências - 5o ano" }],
        },
      ],
    };
    expect(documentMetadata({}, doc).title).toBe("Prova de Ciências - 5o ano");
    expect(documentMetadata({ title: "   " }, doc).title).toBe("Prova de Ciências - 5o ano");
    expect(documentMetadata({ title: "Nome dado" }, doc).title).toBe("Nome dado");
  });

  it("sem título e sem heading, usa o mesmo rótulo do PDF", () => {
    expect(documentMetadata({}).title).toBe("Atividade adaptada");
    expect(documentMetadata({ title: "   " }).title).toBe("Atividade adaptada");
    expect(documentMetadata({}, { schemaVersion: 1, blocks: [] }).title).toBe("Atividade adaptada");
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

describe("Word imprime a fórmula, nunca o texto alternativo (achado 0803)", () => {
  it("inlineMath com alt sai como LaTeX costurado, em Courier New", () => {
    const runs = richTextToRuns([
      { type: "text", text: "vale " },
      { type: "inlineMath", latex: "x^2 + 1", alt: "x ao quadrado mais 1" },
    ]);
    expect(docxText(runs)).toContain("x^2\u00a0+\u00a01");
    expect(docxText(runs)).not.toContain("ao quadrado");
    expect(docxNodeAttrs(runs[1], "w:rFonts")).toMatchObject({ ascii: "Courier New" });
  });

  it("blockMath com alt sai como LaTeX costurado, em Courier New", () => {
    const block = {
      id: id(220),
      type: "blockMath",
      latex: "a^2 + b^2 = c^2",
      alt: "teorema de pitagoras",
    } as const;
    expect(blockText(block)).toContain("a^2\u00a0+\u00a0b^2\u00a0=\u00a0c^2");
    expect(blockText(block)).not.toContain("pitagoras");
    expect(docxNodeAttrs(blockToDocxParagraphs(block, 1), "w:rFonts")).toMatchObject({
      ascii: "Courier New",
    });
  });

  it("sem alt continua saindo o LaTeX costurado", () => {
    expect(blockText({ id: id(221), type: "blockMath", latex: "\\frac{1}{2} = 0.5" })).toContain(
      "\\frac{1}{2}\u00a0=\u00a00.5",
    );
  });

  it("documento cujas fórmulas TODAS têm alt ainda ganha o aviso de monoespaçada", () => {
    const warnings = docxExportWarnings(
      {
        schemaVersion: 1,
        blocks: [{ id: id(232), type: "blockMath", latex: "x", alt: "xis" }],
      } as CanonicalDocument,
      { fontFamily: "opendyslexic" },
    );
    expect(warnings.join(" ")).toMatch(/monoespaçada/i);
  });
});

/**
 * 0415 — os runs de fórmula saem com `w:ascii="Courier New"`, ignorando a fonte
 * do documento, e o diálogo do Word só falava do LaTeX.
 */
describe("aviso de tipografia da fórmula no Word (0415)", () => {
  const doc = (blocks: Block[]): CanonicalDocument => ({ schemaVersion: 1, blocks });

  it("avisa que a fórmula não segue a fonte nem o corpo do documento", () => {
    expect(
      docxExportWarnings(doc([{ id: id(140), type: "blockMath", latex: "x" }]), {
        fontFamily: "opendyslexic",
      }).join(" "),
    ).toMatch(/monoespaçada/i);
  });

  it("documento sem fórmula não ganha o aviso", () => {
    expect(
      docxExportWarnings(doc([{ id: id(141), type: "paragraph", content: text("oi") }]), {
        fontFamily: "opendyslexic",
      }).join(" "),
    ).not.toMatch(/monoespaçada/i);
  });
});

/**
 * Achado 0269 — o Word saía em entrelinha simples (`<w:pPrDefault/>` vazio) e
 * sem o vão entre as partes da questão e entre os blocos, contra os 1,4 de
 * `BASE_LINE_HEIGHT` e o `blockSpacing` do documento que o PDF e as telas usam.
 */
describe("0269 · entrelinha e vão entre blocos no Word", () => {
  const para = (n: number, t: string): Block => ({ id: id(n), type: "paragraph", content: text(t) });
  const docOf = (blocks: Block[]): CanonicalDocument => ({ schemaVersion: 1, blocks });

  it("o estilo padrão do documento declara a entrelinha do corpo (12pt x 1,4 = 336 twips)", () => {
    const styles = docxDocumentStyles();
    expect(styles.default.document.paragraph.spacing.line).toBe(336);
    expect(styles.default.document.run).toEqual(documentRunStyle());
    expect(docxDocumentStyles({ fontSize: 16 }).default.document.run).toEqual(
      documentRunStyle({ fontSize: 16 }),
    );
  });

  it("bloco de topo sem `spacingAfter` fecha com o `blockSpacing` do documento", () => {
    const [semPageStyle] = docxContentBlocks(docOf([para(1, "a")]));
    // Default 16px = 12pt = 240 twips.
    expect(docxNodeAttrs(semPageStyle, "w:spacing")).toEqual({ after: 240 });
    const [comPageStyle] = docxContentBlocks(docOf([para(2, "b")]), undefined, { blockSpacing: 24 });
    // 24px = 18pt = 360 twips.
    expect(docxNodeAttrs(comPageStyle, "w:spacing")).toEqual({ after: 360 });
  });

  it("o `spacingAfter` do bloco continua vencendo o vão do documento", () => {
    const [p] = docxContentBlocks(
      docOf([{ ...para(3, "c"), style: { spacingAfter: 8 } } as Block]),
      undefined,
      { blockSpacing: 24 },
    );
    expect(docxNodeAttrs(p, "w:spacing")).toEqual({ after: 120 });
  });

  it("enunciado, instrução e stem saem separados como no PDF, e a questão fecha com o vão do documento", () => {
    const question: Block = {
      id: id(10),
      type: "question",
      stem: [para(11, "primeiro"), para(12, "segundo")],
      enunciado: text("Leia com atenção."),
      instruction: text("Escreva nas células vazias."),
      answer: { kind: "open", answerLines: 1 },
    };
    const blocks = docxContentBlocks(docOf([question]), undefined, { blockSpacing: 24 });
    const byText = (t: string) => blocks.find((b) => docxText(b).includes(t));
    // Stem: 6pt (QUESTION_INNER_GAP_PT) = 120 twips entre os blocos do enunciado.
    expect(docxNodeAttrs(byText("primeiro"), "w:spacing")).toEqual({ after: 120 });
    expect(docxNodeAttrs(byText("segundo"), "w:spacing")).toEqual({ after: 120 });
    // Enunciado e instrução: o mesmo vão interno de 6pt (achado 0270) = 120 twips.
    expect(docxNodeAttrs(byText("Leia com"), "w:spacing")).toEqual({ after: 120 });
    // A instrução mede a linha pelo corpo menor dela, 10,5pt x 1,4 (achado 0518).
    expect(docxNodeAttrs(byText("Escreva nas"), "w:spacing")).toEqual({
      after: 120,
      line: 294,
      lineRule: "atLeast",
    });
    // O parágrafo que fecha a questão mede EXATAMENTE o vão do documento.
    const closing = blocks[blocks.length - 1];
    expect(docxText(closing)).toBe("");
    expect(docxNodeAttrs(closing, "w:spacing")).toEqual({ line: 360, lineRule: "exact", after: 0 });
  });

  it("o primeiro parágrafo do stem com `spacingAfter` próprio leva ele no parágrafo do número", () => {
    const [numbered] = blockToDocxParagraphs(
      {
        id: id(30),
        type: "question",
        stem: [{ ...para(31, "y"), style: { spacingAfter: 24 } } as Block],
        answer: { kind: "open", answerLines: 1 },
      },
      1,
    );
    expect(docxNodeAttrs(numbered, "w:spacing")).toEqual({ after: 360 });
  });

  it("a questão com `spacingAfter` próprio fecha com ele", () => {
    const blocks = blockToDocxParagraphs(
      {
        id: id(20),
        type: "question",
        stem: [para(21, "x")],
        answer: { kind: "open", answerLines: 1 },
        style: { spacingAfter: 8 },
      },
      1,
    );
    expect(docxNodeAttrs(blocks[blocks.length - 1], "w:spacing")).toEqual({
      line: 120,
      lineRule: "exact",
      after: 0,
    });
  });
});

describe("0271 · a questão não se parte na virada do Word", () => {
  const hasTag = (node: unknown, rootKey: string): boolean => {
    if (Array.isArray(node)) return node.some((n) => hasTag(n, rootKey));
    if (node === null || typeof node !== "object") return false;
    if ((node as { rootKey?: string }).rootKey === rootKey) return true;
    return Object.values(node as Record<string, unknown>).some((v) => hasTag(v, rootKey));
  };

  it("todo parágrafo da questão, menos o de fecho, anda com o seguinte e não parte as linhas", () => {
    const out = blockToDocxParagraphs(
      q(
        {
          kind: "multipleChoice",
          alternatives: [
            { id: id(92), content: text("A energia do Sol"), correct: true },
            { id: id(93), content: text("O vento"), correct: false },
          ],
        } as QuestionAnswer,
        {
          stem: [
            { id: id(91), type: "paragraph", content: text("primeiro do stem") },
            { id: id(94), type: "paragraph", content: text("segundo do stem") },
          ],
          enunciado: text("Leia o texto."),
          instruction: text("Marque a correta."),
        } as Partial<Block>,
      ),
      1,
    );
    const closing = out[out.length - 1];
    const body = out.slice(0, -1);
    expect(body.length).toBeGreaterThanOrEqual(6);
    for (const p of body) {
      expect(hasTag(p, "w:keepNext")).toBe(true);
      expect(hasTag(p, "w:keepLines")).toBe(true);
    }
    // O fecho não se prende à questão seguinte: só a questão é a unidade.
    expect(hasTag(closing, "w:keepNext")).toBe(false);
  });

  it("1109 · a tabela só prende o cabeçalho à 1ª linha; as linhas de dados não se encadeiam", () => {
    // Com keepNext em toda célula a tabela inteira virava um bloco indivisível:
    // a questão-tabela maior que uma folha era empurrada inteira para a seguinte.
    const out = blockToDocxParagraphs(
      q(
        {
          kind: "table",
          rows: [
            [text("Etapa"), text("O que fazer")],
            [text("1"), text("ler")],
            [text("2"), text("grifar")],
            [text("3"), text("responder")],
          ],
        } as QuestionAnswer,
        { instruction: text("Complete a tabela.") } as Partial<Block>,
      ),
      1,
    );
    const table = out.find((b) => b instanceof Table) as Table;
    const [header, ...body] = (table as unknown as { root: TableRow[] }).root.filter(
      (n) => (n as unknown as { rootKey?: string }).rootKey === "w:tr",
    );
    // O cabeçalho anda com a 1ª linha de dados (e o enunciado/instrução, antes da
    // tabela, continua preso a ele).
    expect(hasTag(header, "w:keepNext")).toBe(true);
    expect(body).toHaveLength(3);
    for (const row of body) {
      expect(hasTag(row, "w:keepNext")).toBe(false);
      // a linha continua inteira pela própria tag da linha
      expect(hasTag(row, "w:cantSplit")).toBe(true);
    }
    const before = out.slice(0, out.indexOf(table));
    for (const p of before) expect(hasTag(p, "w:keepNext")).toBe(true);
  });

  it("bloco solto fora de questão não ganha keepNext", () => {
    const out = blockToDocxParagraphs(
      { id: id(95), type: "paragraph", content: text("texto de apoio") },
      1,
    );
    expect(hasTag(out, "w:keepNext")).toBe(false);
  });

  it("0392 · o título de seção anda com o bloco que encabeça", () => {
    // O `Heading2` que a lib grava em styles.xml não tem keepNext; sem ele no
    // parágrafo, o Microsoft Word deixa o título sozinho no pé da folha.
    for (const level of [1, 2, 3] as const) {
      const out = blockToDocxParagraphs(
        { id: id(96), type: "heading", level, content: text("Missão 2") },
        1,
      );
      expect(hasTag(out, "w:keepNext")).toBe(true);
    }
  });
});

/**
 * Achado 0518 — correção do 0269: `lineRule="auto"` multiplica a entrelinha
 * SIMPLES da fonte (1,149 em na Arial), não o corpo. A linha do Word saía 15%
 * mais alta que no PDF e nas telas, que medem `corpo x BASE_LINE_HEIGHT`. A
 * altura vai absoluta (twips, `atLeast` para não cortar fórmula inline), e
 * calculada pelo corpo de cada parágrafo, como a razão que o PDF repete.
 */
describe("0518 · entrelinha absoluta do Word, corpo x 1,4 como no PDF", () => {
  /** Altura de linha do PDF para um corpo em meios-pontos, em twips. */
  const lineTwips = (halfPoints: number) => Math.round((halfPoints / 2) * BASE_LINE_HEIGHT * 20);
  const atLeast = (halfPoints: number) => ({ line: lineTwips(halfPoints), lineRule: "atLeast" });

  it("o estilo padrão declara a altura absoluta do corpo, não um múltiplo da métrica da fonte", () => {
    expect(docxDocumentStyles().default.document.paragraph).toEqual({
      spacing: atLeast(BASE_FONT_PT * 2),
    });
    // Corpo escolhido no "Formato": 16pt x 1,4 = 22,4pt = 448 twips.
    expect(docxDocumentStyles({ fontSize: 16 }).default.document.paragraph).toEqual({
      spacing: { line: 448, lineRule: "atLeast" },
    });
  });

  it("o título mede a linha pelo próprio corpo", () => {
    const [h] = blockToDocxParagraphs(
      { id: id(518), type: "heading", level: 1, content: text("Título") } as Block,
      1,
    );
    expect(docxNodeAttrs(h, "w:spacing")).toMatchObject(atLeast(HEADING_PT[1] * 2));
  });

  it("a instrução e a legenda medem a linha pelo corpo menor delas", () => {
    const blocks = blockToDocxParagraphs(
      {
        id: id(519),
        type: "question",
        stem: [{ id: id(520), type: "paragraph", content: text("x") }],
        instruction: text("Marque uma."),
        answer: { kind: "open", answerLines: 1 },
      },
      1,
    );
    const instr = blocks.find((b) => docxText(b).includes("Marque uma."));
    expect(docxNodeAttrs(instr, "w:spacing")).toEqual({ ...atLeast(21), after: 120 });

    const [, legenda] = blockToDocxParagraphs(
      { id: id(521), type: "image", src: "https://e.com/a.png", caption: text("Fig") },
      1,
    ) as [unknown, unknown];
    const caption = Math.round(ELEMENT_FONT_RATIOS.caption * BASE_FONT_PT * 2);
    expect(docxNodeAttrs(legenda, "w:spacing")).toMatchObject(atLeast(caption));
  });

  it("o corpo do bloco (`style.fontSize`) vale para a linha de todo parágrafo dele", () => {
    const blocks = blockToDocxParagraphs(
      {
        id: id(522),
        type: "question",
        stem: [{ id: id(523), type: "paragraph", content: text("enunciado") }],
        answer: {
          kind: "multipleChoice",
          alternatives: [
            { id: id(524), content: text("alt A"), correct: true },
            { id: id(525), content: text("alt B"), correct: false },
          ],
        },
        style: { fontSize: 24 }, // px → 18pt → 36 meios-pontos
      } as Block,
      1,
    );
    expect(docxNodeAttrs(blocks[0], "w:spacing")).toMatchObject(atLeast(36));
    const alt = blocks.find((b) => docxText(b).includes("alt A"));
    expect(docxNodeAttrs(alt, "w:spacing")).toMatchObject(atLeast(36));
    const [p] = blockToDocxParagraphs(
      { id: id(526), type: "paragraph", content: text("p"), style: { fontSize: 24 } } as Block,
      1,
    );
    expect(docxNodeAttrs(p, "w:spacing")).toEqual({ ...atLeast(36), after: 240 });
  });

  it("o parágrafo no corpo do documento herda a linha do estilo padrão (sem `line` próprio)", () => {
    const [p] = blockToDocxParagraphs({ id: id(527), type: "paragraph", content: text("p") }, 1);
    expect(docxNodeAttrs(p, "w:spacing")).toEqual({ after: 240 });
  });

  it("as linhas do cabeçalho medem pelo próprio corpo", () => {
    const [title, school, meta] = headerParagraphs({
      title: "Prova",
      school: "Escola",
      teacher: "Ana",
      date: "",
    } as Parameters<typeof headerParagraphs>[0]);
    expect(docxNodeAttrs(title, "w:spacing")).toMatchObject(atLeast(36));
    expect(docxNodeAttrs(school, "w:spacing")).toMatchObject(atLeast(22));
    expect(docxNodeAttrs(meta, "w:spacing")).toMatchObject(atLeast(20));
  });
});

/**
 * Achado 0524: número da questão e marcador da alternativa em COLUNA no Word,
 * como no PDF, na prévia e no Revisar (achados 0175, 0182, 0340). O parágrafo
 * recua a coluna inteira (`left`) e devolve a 1ª linha à margem (`hanging`); um
 * tab leva o texto ao início da coluna, então a 2ª linha alinha com o texto e
 * não volta para baixo do número/marcador. A largura é a mesma das outras
 * superfícies, medida no corpo do documento.
 */
describe("coluna do número e do marcador no .docx (achado 0524)", () => {
  const twips = (pt: number) => Math.round(pt * 20);
  const hasTab = (node: unknown) => JSON.stringify(node).includes('"rootKey":"w:tab"');
  const mcQuestion: Block = {
    id: id(240),
    type: "question",
    stem: [{ id: id(241), type: "paragraph", content: text("Leia o texto") }],
    answer: {
      kind: "multipleChoice",
      alternatives: [
        { id: id(242), content: text("A energia do Sol"), correct: true },
        { id: id(243), content: text("A energia da Lua"), correct: false },
      ],
    },
  };

  it("enunciado numerado: recuo pendente da largura de questionNumberColumnPt e tab após o número", () => {
    const [numbered] = blockToDocxParagraphs(mcQuestion, 1);
    const col = twips(questionNumberColumnPt("1", BASE_FONT_PT));
    expect(docxNodeAttrs(numbered, "w:ind")).toEqual({ left: col, hanging: col });
    expect(hasTab(numbered)).toBe(true);
    expect(docxText(numbered)).toBe("1.Leia o texto");
  });

  it("alternativa: recuo pendente da largura de alternativeMarkerColumnPt e tab após o marcador", () => {
    const out = blockToDocxParagraphs(mcQuestion, 1);
    const rows = out.filter((p) => /^[ab]\)/.test(docxText(p)));
    expect(rows).toHaveLength(2);
    const col = twips(alternativeMarkerColumnPt(BASE_FONT_PT));
    for (const row of rows) {
      expect(docxNodeAttrs(row, "w:ind")).toEqual({ left: col, hanging: col });
      expect(hasTab(row)).toBe(true);
    }
    expect(docxText(rows[0])).toBe("a)A energia do Sol");
  });

  it("a coluna acompanha o corpo do documento escolhido no Formato", () => {
    const doc: CanonicalDocument = { blocks: [mcQuestion] } as CanonicalDocument;
    const out = docxContentBlocks(doc, undefined, { fontSize: 24 } as never);
    const [numbered] = out;
    const col = twips(questionNumberColumnPt("1", 24));
    expect(docxNodeAttrs(numbered, "w:ind")).toEqual({ left: col, hanging: col });
    const alt = out.find((p) => /^a\)/.test(docxText(p)));
    const altCol = twips(alternativeMarkerColumnPt(24));
    expect(docxNodeAttrs(alt, "w:ind")).toEqual({ left: altCol, hanging: altCol });
  });

  it("corpo próprio do bloco vence o do documento na medida da coluna", () => {
    const sized: Block = { ...mcQuestion, style: { fontSize: 32 } } as Block;
    const [numbered] = blockToDocxParagraphs(sized, 1);
    const col = twips(questionNumberColumnPt("1", 24));
    expect(docxNodeAttrs(numbered, "w:ind")).toEqual({ left: col, hanging: col });
  });
});

/**
 * Achado 0527: o "Tamanho do texto" do Formato escalava só o corpo do Word
 * (`docDefaults`). Título, instrução, rótulo APOIO e legenda ficavam em corpo
 * fixo: a 21pt de corpo o título saía em 18pt, MENOR que o enunciado. As outras
 * superfícies resolvem os quatro por `resolveElementFontSizes` sobre o corpo.
 */
describe("0527 · título, instrução, APOIO e legenda do Word acompanham o corpo do documento", () => {
  const BODY_PT = 21;
  const sizes = resolveElementFontSizes({
    fontFamily: undefined,
    fontSize: BODY_PT,
    blockSpacing: 16,
  });
  const half = (pt: number) => Math.round(pt * 2);
  const sz = (node: unknown) =>
    docxRunProps(node)
      .filter((p) => p.key === "w:sz")
      .map((p) => p.val);
  const contentFor = (block: Block) =>
    docxContentBlocks({ blocks: [block] } as CanonicalDocument, undefined, {
      fontSize: BODY_PT,
    } as never);

  it.each([1, 2, 3] as const)("título nível %i escala pelo corpo e nunca fica menor que ele", (level) => {
    const [h] = contentFor({ id: id(527), type: "heading", level, content: text("Prova") } as Block);
    const expected = half(sizes[`heading${level}`]);
    expect(sz(h)).toContain(expected);
    expect(expected).toBeGreaterThan(BODY_PT * 2);
  });

  it("instrução da questão escala pelo corpo", () => {
    const out = contentFor({
      id: id(528),
      type: "question",
      stem: [{ id: id(529), type: "paragraph", content: text("Enunciado") }],
      instruction: text("Marque a alternativa correta."),
      answer: { kind: "open", answerLines: 1 },
    } as Block);
    const instr = out.find((b) => docxText(b).includes("Marque a alternativa"));
    expect(sz(instr)).toContain(half(sizes.instruction));
  });

  it("rótulo APOIO e legenda escalam pelo corpo", () => {
    const [label] = contentFor({
      id: id(530),
      type: "scaffolding",
      items: ["passo"],
    } as Block);
    expect(sz(label)).toContain(half(sizes.caption));
    const [, legenda] = contentFor({
      id: id(531),
      type: "image",
      src: "https://e.com/a.png",
      caption: text("Fig"),
    } as Block);
    expect(sz(legenda)).toContain(half(sizes.caption));
  });
});

/**
 * Achado 0528 — `\n` dentro do `text` de um run ia cru para `<w:t>`, e o Word
 * o lê como espaço: a "Tabela de Preços" (uma linha por fruta na folha, na
 * prévia e no PDF) virava um parágrafo corrido. Cada `\n` tem que virar
 * `<w:br/>`, com a mesma formatação do run.
 */
describe("0528 · quebra de linha dentro do run vira <w:br/> no Word", () => {
  const countKey = (node: unknown, key: string): number => {
    let n = 0;
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o === null || typeof o !== "object") return;
      if ((o as { rootKey?: string }).rootKey === key) n += 1;
      Object.values(o as Record<string, unknown>).forEach(walk);
    };
    walk(node);
    return n;
  };

  it("cada \\n vira uma quebra e nenhum \\n sobra no texto", () => {
    const runs = richTextToRuns([
      { type: "text", text: "\n• Maçã: R$ 2,50\n• Banana: R$ 1,20", marks: ["bold"], color: "#DC2626" },
    ]);
    expect(docxText(runs)).not.toContain("\n");
    expect(docxText(runs)).toBe("• Maçã: R$ 2,50• Banana: R$ 1,20");
    expect(countKey(runs, "w:br")).toBe(2);
    // A formatação do run vale para toda linha, não só a primeira.
    expect(runs).toHaveLength(3);
    for (const run of runs) {
      expect(docxRunProps(run).some((p) => p.key === "w:color" && p.val === "DC2626")).toBe(true);
      expect(countKey(run, "w:b")).toBeGreaterThan(0);
    }
  });

  it("texto sem \\n continua um run só, sem quebra", () => {
    const runs = richTextToRuns([{ type: "text", text: "linha única" }]);
    expect(runs).toHaveLength(1);
    expect(countKey(runs, "w:br")).toBe(0);
  });

  it("vale para o parágrafo inteiro exportado", () => {
    const paragraphs = blockToDocxParagraphs(
      { id: id(528), type: "paragraph", content: text("Tabela:\nMaçã\nBanana") },
      1,
    );
    expect(countKey(paragraphs, "w:br")).toBe(2);
    expect(paragraphs.map(docxText).join("")).toBe("Tabela:MaçãBanana");
  });
});

/**
 * Achado 0529: no Word só o 1º parágrafo da questão entrava na coluna do texto
 * (0524). O resto do enunciado e a caixa do APOIO voltavam à margem, sob o
 * número, e os passos do APOIO não tinham coluna do ordinal nem respiro dentro
 * da moldura. No PDF todo o enunciado fica em `paddingLeft: numberColumn`, a
 * caixa tem `SCAFFOLDING_PADDING_PT` e cada passo a coluna do ordinal.
 */
describe("0529 · resto do enunciado e APOIO na coluna da questão no Word", () => {
  const twips = (pt: number) => Math.round(pt * 20);
  const hasTab = (node: unknown) => JSON.stringify(node).includes('"rootKey":"w:tab"');
  const pad = twips(SCAFFOLDING_PADDING_PT);
  const step = twips(scaffoldingStepColumnPt("1", BASE_FONT_PT));
  const question: Block = {
    id: id(5290),
    type: "question",
    stem: [
      { id: id(5291), type: "paragraph", content: text("Leia o texto") },
      { id: id(5292), type: "paragraph", content: text("Banco de palavras: sol, chuva") },
      { id: id(5293), type: "scaffolding", items: ["Pense nas etapas", "Responda"] },
    ],
    answer: { kind: "open", answerLines: 1 },
  };

  it("parágrafos do enunciado depois do primeiro recuam a coluna do número", () => {
    const out = blockToDocxParagraphs(question, 2);
    const col = twips(questionNumberColumnPt("2", BASE_FONT_PT));
    const banco = out.find((p) => docxText(p).startsWith("Banco de palavras"));
    expect(docxNodeAttrs(banco, "w:ind")).toEqual({ left: col });
  });

  it("a caixa do APOIO dentro da questão começa na coluna do texto, com respiro interno", () => {
    const out = blockToDocxParagraphs(question, 2);
    const col = twips(questionNumberColumnPt("2", BASE_FONT_PT));
    const label = out.find((p) => docxText(p) === "APOIO");
    const passo = out.find((p) => docxText(p).endsWith("Pense nas etapas"));
    for (const p of [label, passo]) {
      expect(docxNodeAttrs(p, "w:ind")).toEqual({ left: col + pad + step, hanging: step, right: pad });
    }
  });

  it("cada passo do APOIO usa a coluna do ordinal com tab, e a moldura afasta o texto", () => {
    const [label, passo] = blockToDocxParagraphs(
      { id: id(5294), type: "scaffolding", items: ["Pense nas etapas", "Responda"] },
      1,
    );
    expect(docxNodeAttrs(passo, "w:ind")).toEqual({ left: pad + step, hanging: step, right: pad });
    expect(docxNodeAttrs(label, "w:ind")).toEqual({ left: pad + step, hanging: step, right: pad });
    expect(hasTab(passo)).toBe(true);
    expect(docxText(passo)).toBe("1.Pense nas etapas");
    expect(docxNodeAttrs(passo, "w:left")).toMatchObject({ space: Math.round(SCAFFOLDING_PADDING_PT) });
  });

  it("questão aninhada no enunciado soma a coluna da questão de fora", () => {
    const nested: Block = {
      ...question,
      stem: [
        { id: id(5295), type: "paragraph", content: text("Leia") },
        {
          id: id(5296),
          type: "question",
          stem: [{ id: id(5297), type: "paragraph", content: text("Sub") }],
          answer: { kind: "open", answerLines: 1 },
        },
      ],
    } as Block;
    const out = blockToDocxParagraphs(nested, 2);
    const outer = twips(questionNumberColumnPt("2", BASE_FONT_PT));
    const inner = twips(questionNumberColumnPt("1", BASE_FONT_PT));
    const sub = out.find((p) => docxText(p) === "1.Sub");
    expect(docxNodeAttrs(sub, "w:ind")).toEqual({ left: outer + inner, hanging: inner });
  });
});

describe("Word quebra a fórmula longa num espaço do LaTeX, nunca no meio do comando (achado 0390)", () => {
  // A fórmula da questão 5 da adaptação A: 74 caracteres, mais larga que a
  // coluna útil em Courier New 12pt (10300 twips / 144 twips = 71 caracteres).
  const LONGA =
    "0,7 \\quad ; \\quad \\frac{1}{2} \\quad ; \\quad 0,25 \\quad ; \\quad \\frac{3}{4}";

  /** Cada `<w:t>` do nó, separado: no bloco, uma linha da fórmula por run. */
  function runTexts(node: unknown): string[] {
    const parts: string[] = [];
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o === null || typeof o !== "object") return;
      const n = o as { rootKey?: string; root?: unknown };
      if (n.rootKey === "w:t" && Array.isArray(n.root)) {
        parts.push(n.root.filter((p) => typeof p === "string").join(""));
      }
      Object.values(o as Record<string, unknown>).forEach(walk);
    };
    walk(node);
    return parts;
  }

  /** Quantas quebras de linha (`<w:br/>`) o nó carrega. */
  function breaks(node: unknown): number {
    let count = 0;
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o === null || typeof o !== "object") return;
      if ((o as { rootKey?: string }).rootKey === "w:br") count += 1;
      Object.values(o as Record<string, unknown>).forEach(walk);
    };
    walk(node);
    return count;
  }

  it("blockMath longo sai em linhas equilibradas que cabem na coluna, partidas num espaço", () => {
    expect(LONGA.length).toBe(74);
    const out = blockToDocxParagraphs({ id: id(390), type: "blockMath", latex: LONGA }, 1);
    const lines = runTexts(out);
    expect(lines.length).toBe(2);
    expect(breaks(out)).toBe(1);
    // Nada se perde: as linhas, reunidas por um espaço, são a fórmula inteira.
    expect(lines.join(" ").replace(/\u00a0/g, " ")).toBe(LONGA);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(71);
      // Dentro da linha não sobra ponto de quebra para o Word inventar outro.
      expect(line).not.toContain(" ");
      expect(line.endsWith("\\")).toBe(false);
    }
    // Equilibradas, como no PDF (achado 0435): nenhuma satura a coluna.
    expect(Math.abs(lines[0].length - lines[1].length)).toBeLessThanOrEqual(6);
  });

  it("blockMath curto continua um só átomo, sem quebra", () => {
    const out = blockToDocxParagraphs({ id: id(391), type: "blockMath", latex: "x^2 + 1" }, 1);
    expect(runTexts(out)).toEqual(["x^2 + 1"]);
    expect(breaks(out)).toBe(0);
  });

  it("o teto acompanha o corpo do documento: a 24pt a mesma fórmula curta-média quebra", () => {
    // 40 caracteres cabem a 12pt (71) mas não a 24pt (10300 / 288 = 35).
    const media = "a + b + c + d + e + f + g + h + i + j +";
    expect(runTexts(blockToDocxParagraphs({ id: id(392), type: "blockMath", latex: media }, 1)))
      .toHaveLength(1);
    expect(
      runTexts(blockToDocxParagraphs({ id: id(393), type: "blockMath", latex: media }, 1, undefined, false, 24))
        .length,
    ).toBeGreaterThan(1);
  });

  it("dentro do enunciado a coluna é mais estreita, e o teto desconta o recuo", () => {
    // 67 caracteres: cabem na coluna cheia (71), não numa coluna recuada 1440 twips (61).
    const latex = "a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p + q +";
    expect(latex.length).toBe(67);
    const block = { id: id(394), type: "blockMath", latex } as const;
    expect(runTexts(blockToDocxParagraphs(block, 1))).toHaveLength(1);
    expect(runTexts(blockToDocxParagraphs(block, 1, undefined, false, BASE_FONT_PT, 1440)).length)
      .toBeGreaterThan(1);
  });

  it("inlineMath mais larga que a coluna volta quebrável nos espaços, em vez de átomo sem teto", () => {
    const runs = richTextToRuns([{ type: "inlineMath", latex: LONGA }]);
    expect(docxText(runs)).toBe(LONGA);
  });

  it("inlineMath que cabe continua costurada", () => {
    const runs = richTextToRuns([{ type: "inlineMath", latex: "x^2 + 1" }]);
    expect(docxText(runs)).toBe("x^2 + 1");
  });
});

// C-13: a control character in text or formula made `document.xml` invalid XML, and Word refused the file.
describe("buildDocxDocument never writes invalid XML (C-13)", () => {
  const FF = "\u000C";
  const BS = "\u0008";
  const VT = "\u000B";
  const NUL = "\u0000";
  const SOH = "\u0001";
  const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

  const dirty: CanonicalDocument = {
    schemaVersion: 1,
    blocks: [
      { id: "00000000-0000-4000-8000-000000000001", type: "heading", level: 1, content: [{ type: "text", text: `Prova${FF}de${NUL}Mat` }] },
      { id: "00000000-0000-4000-8000-000000000002", type: "paragraph", content: [{ type: "text", text: `a${BS}b${VT}c` }, { type: "inlineMath", latex: `x${BS}+${SOH}y` }] },
      { id: "00000000-0000-4000-8000-000000000003", type: "blockMath", latex: `\\frac{1}{2}${FF}${BS}${SOH}` },
      {
        id: "00000000-0000-4000-8000-000000000004",
        type: "question",
        stem: [{ id: "00000000-0000-4000-8000-000000000005", type: "paragraph", content: [{ type: "text", text: `Q${NUL}1` }] }],
        answer: {
          kind: "multipleChoice",
          alternatives: [{ id: "00000000-0000-4000-8000-000000000006", content: [{ type: "text", text: `alt${FF}A` }], correct: true }],
        },
      },
      { id: "00000000-0000-4000-8000-000000000007", type: "scaffolding", items: [`passo${BS}1`] },
    ],
  };

  async function documentXml(document: CanonicalDocument, header = {}): Promise<string> {
    const { Packer } = await import("docx");
    const { default: JSZip } = await import("jszip");
    const settings = { ...DEFAULT_PANEL_SETTINGS, header };
    const buffer = await Packer.toBuffer(buildDocxDocument(document, settings));
    const zip = await JSZip.loadAsync(buffer);
    return await zip.file("word/document.xml")!.async("string");
  }

  it("strips control characters from text and formulas, keeping the rest of the text", async () => {
    const xml = await documentXml(dirty);
    expect(xml).not.toMatch(XML_INVALID);
    expect(xml).toContain("Prova de");
    expect(xml).toContain("Mat");
    expect(xml).toContain("a");
    expect(xml).toContain("\\frac{1}{2}");
    expect(xml).toContain("passo");
  });

  it("also cleans the header fields", async () => {
    const xml = await documentXml(dirty, { title: `Titulo${FF}X`, school: `Escola${BS}Y` });
    expect(xml).not.toMatch(XML_INVALID);
    expect(xml).toContain("Titulo");
    expect(xml).toContain("Escola");
  });

  it("leaves a clean document byte-identical in its text", async () => {
    const clean: CanonicalDocument = { schemaVersion: 1, blocks: [{ id: "00000000-0000-4000-8000-000000000001", type: "paragraph", content: [{ type: "text", text: "Olá, mundo\ncom quebra" }] }] };
    const xml = await documentXml(clean);
    expect(xml).toContain("Olá, mundo");
    expect(xml).toContain("com quebra");
  });

  it("xmlSafe turns form feed and vertical tab into a space and drops the rest, in any nested string", () => {
    expect(xmlSafe(`a${FF}b${VT}c${NUL}d${BS}e`)).toBe("a b cde");
    expect(xmlSafe({ n: 1, ok: true, nil: null, list: [`x${SOH}`, { deep: `y${FF}` }] })).toEqual({ n: 1, ok: true, nil: null, list: ["x", { deep: "y " }] });
    const same = { a: "limpo" };
    expect(xmlSafe(same)).toBe(same);
  });
});
