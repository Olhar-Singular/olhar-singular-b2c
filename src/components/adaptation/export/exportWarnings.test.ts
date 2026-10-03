import { describe, it, expect } from "vitest";
import { copyExportWarnings, MATH_LOSS_WARNING, pdfExportWarnings } from "./exportWarnings";
import { docxExportWarnings } from "./exportDocx";
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
    const warnings = copyExportWarnings(
      doc([{ id: id(1), type: "image", src: "https://exemplo.com/figura.png", alt: "figura" }]),
    );
    expect(warnings.join(" ")).not.toMatch(/leitor de tela/i);
  });
});

// ---------------------------------------------------------------------------
// 0377 — o aviso do "Copiar" listava só a fórmula e calava a imagem (que vira
// "[Imagem]"), a tabela (que vira linhas com "|") e a formatação (negrito, cor,
// tamanho), todas desenhadas na prévia e perdidas no texto copiado.
// ---------------------------------------------------------------------------

describe("copyExportWarnings: perdas além da fórmula (0377)", () => {
  const tableQuestion = (): CanonicalDocument["blocks"][number] => ({
    id: id(10),
    type: "question",
    number: 1,
    stem: [{ id: id(11), type: "paragraph", content: [{ type: "text", text: "Complete" }] }],
    answer: {
      kind: "table",
      rows: [
        [[{ type: "text", text: "Planeta" }], [{ type: "text", text: "Posicao" }]],
        [[{ type: "text", text: "Terra" }], [{ type: "text", text: "3" }]],
      ],
    },
  } as CanonicalDocument["blocks"][number]);

  it("avisa que a imagem vira a marcação [Imagem]", () => {
    const warnings = copyExportWarnings(
      doc([{ id: id(1), type: "image", src: "https://exemplo.com/figura.png", alt: "figura" }]),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/\[Imagem\]/);
  });

  it("avisa que a tabela vira linhas separadas por |", () => {
    const warnings = copyExportWarnings(doc([tableQuestion()]));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/tabela/i);
    expect(warnings[0]).toMatch(/\|/);
  });

  it.each([
    ["negrito", { type: "text", text: "Negrito", marks: ["bold"] }],
    ["cor", { type: "text", text: "vermelho", color: "#DC2626" }],
    ["tamanho", { type: "text", text: "grande", fontSize: 20 }],
  ])("avisa que a formatação (%s) não vai", (_label, inline) => {
    const warnings = copyExportWarnings(
      doc([{ id: id(1), type: "paragraph", content: [inline] } as CanonicalDocument["blocks"][number]]),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/negrito/i);
  });

  it("acha formatação dentro de uma célula de tabela também", () => {
    const question = tableQuestion() as Extract<CanonicalDocument["blocks"][number], { type: "question" }>;
    if (question.answer.kind !== "table") throw new Error("fixture");
    question.answer.rows[0][0] = [{ type: "text", text: "Planeta", marks: ["italic"] }];
    const warnings = copyExportWarnings(doc([question]));
    expect(warnings).toHaveLength(2);
    expect(warnings[1]).toMatch(/negrito/i);
  });

  it("lista todas as perdas juntas, a fórmula primeiro", () => {
    const warnings = copyExportWarnings(
      doc([
        {
          id: id(1),
          type: "paragraph",
          content: [
            { type: "text", text: "Negrito", marks: ["bold"] },
            { type: "inlineMath", latex: "x^2" },
          ],
        },
        { id: id(2), type: "image", src: "https://exemplo.com/figura.png", alt: "" },
        tableQuestion(),
      ]),
    );
    expect(warnings).toHaveLength(4);
    expect(warnings[0]).toBe(MATH_LOSS_WARNING);
  });

  it("texto sem marca, sem imagem e sem tabela segue sem aviso", () => {
    expect(
      copyExportWarnings(
        doc([{ id: id(1), type: "paragraph", content: [{ type: "text", text: "olá", marks: [] }] }]),
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

// ---------------------------------------------------------------------------
// 0444 — as fontes built-in do PDF só carregam a CP1252. Um caractere de fora
// dela (uma seta, um sinal de diferente, um emoji) não estoura: sai trocado por
// outro glifo, calado. O professor precisa saber ANTES de baixar o arquivo.
// ---------------------------------------------------------------------------

describe("aviso de caractere fora da CP1252 (0444)", () => {
  const withText = (text: string) =>
    doc([{ id: id(1), type: "paragraph", content: [{ type: "text", text }] }]);

  it("lista o caractere que a fonte padrão não tem", () => {
    const warning = pdfExportWarnings(withText("Se 3 → 9, então 4 → ?")).join(" ");
    expect(warning).toMatch(/→/);
    expect(warning).toMatch(/acentuad|CP1252|fonte/i);
  });

  it("não repete o mesmo caractere duas vezes", () => {
    const warning = pdfExportWarnings(withText("≠ ≠ ≠")).join(" ");
    expect(warning.match(/≠/g)).toHaveLength(1);
  });

  it("acento, cedilha e travessão passam: estão na CP1252", () => {
    expect(pdfExportWarnings(withText("Cão – ações “aspas” e reticências…"))).toEqual([]);
  });

  it("varre o texto das respostas, não só o dos parágrafos", () => {
    const warning = pdfExportWarnings(
      doc([
        {
          id: id(1),
          type: "question",
          number: 1,
          stem: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "Relacione" }] }],
          answer: {
            kind: "matching",
            pairs: [
              {
                id: id(3),
                left: [{ type: "text", text: "Peixe ✓" }],
                right: [{ type: "text", text: "Rio" }],
              },
            ],
          },
        },
      ]),
    ).join(" ");
    expect(warning).toMatch(/✓/);
  });

  it("fonte de acessibilidade embutida não recebe o aviso da CP1252", () => {
    expect(
      pdfExportWarnings(withText("Se 3 → 9"), { fontFamily: "opendyslexic" }).join(" "),
    ).not.toMatch(/→/);
  });

  it("uma fonte clássica cai numa built-in e recebe o aviso", () => {
    expect(pdfExportWarnings(withText("Se 3 → 9"), { fontFamily: "georgia" }).join(" ")).toMatch(
      /→/,
    );
  });

  it("o Word não herda o aviso: a fonte é resolvida na máquina de quem abre", () => {
    expect(copyExportWarnings(withText("Se 3 → 9"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 0803 — os arquivos imprimem o LaTeX mesmo quando o nó tem `alt` (texto
// alternativo), como o "Copiar". O aviso é um só para as três saídas.
// ---------------------------------------------------------------------------

describe("aviso de perda da fórmula com texto alternativo (0803)", () => {
  const comAlt = doc([
    { id: id(1), type: "blockMath", latex: "a^2 + b^2 = c^2", alt: "teorema de pitágoras" },
    {
      id: id(2),
      type: "paragraph",
      content: [{ type: "inlineMath", latex: "E = mc^2", alt: "E igual a m c ao quadrado" }],
    },
  ]);

  it("PDF, Word e Copiar avisam do LaTeX cru e não falam em descrição", () => {
    for (const warnings of [pdfExportWarnings(comAlt), docxExportWarnings(comAlt)]) {
      expect(warnings).toContain(MATH_LOSS_WARNING);
      expect(warnings.join(" ")).not.toMatch(/descrição/i);
    }
    expect(copyExportWarnings(comAlt)).toEqual([MATH_LOSS_WARNING]);
  });

  it("fórmula com alt mantém o aviso de monoespaçada", () => {
    expect(pdfExportWarnings(comAlt, { fontFamily: "opendyslexic" }).join(" ")).toMatch(
      /monoespaçada/i,
    );
  });
});

describe("aviso de item vazio nas respostas (1105)", () => {
  const stem = (n: number) => [
    { id: id(n), type: "paragraph" as const, content: [{ type: "text" as const, text: "q" }] },
  ];
  const filled = (text: string) => [{ type: "text" as const, text }];

  it("item de V/F sem conteúdo gera o aviso, no PDF e no Word, com o número da questão", () => {
    const document = doc([
      {
        id: id(1),
        type: "question",
        stem: stem(2),
        answer: {
          kind: "trueFalse",
          items: [
            { id: id(3), content: filled("A Terra gira."), value: true },
            { id: id(4), content: [], value: false },
          ],
        },
      },
    ]);
    const expected = "A questão 1 tem um item vazio: ele sai como um marcador sem texto na folha.";
    expect(pdfExportWarnings(document)).toContain(expected);
    expect(docxExportWarnings(document)).toContain(expected);
  });

  it("cobre caixas, ordenação e o lado vazio de um par; respeita o número autoral e só espaço conta como vazio", () => {
    const document = doc([
      {
        id: id(1),
        type: "question",
        stem: stem(2),
        answer: {
          kind: "checkbox",
          items: [{ id: id(3), content: filled("   "), checked: false }],
        },
      },
      {
        id: id(4),
        type: "question",
        customNumber: "B2",
        stem: stem(5),
        answer: {
          kind: "matching",
          pairs: [{ id: id(6), left: filled("Urso"), right: [] }],
        },
      },
      {
        id: id(7),
        type: "question",
        stem: stem(8),
        answer: {
          kind: "ordering",
          items: [
            { id: id(9), content: [], position: 0 },
            { id: id(10), content: [], position: 1 },
          ],
        },
      },
    ]);
    const warnings = pdfExportWarnings(document);
    expect(warnings).toContain(
      "As questões 1, B2 e 3 têm itens vazios: eles saem como marcadores sem texto na folha.",
    );
  });

  it("aninhada no enunciado conta, e fórmula sozinha não é item vazio", () => {
    const document = doc([
      {
        id: id(1),
        type: "question",
        stem: [
          {
            id: id(2),
            type: "question",
            stem: stem(3),
            answer: { kind: "checkbox", items: [{ id: id(4), content: [], checked: true }] },
          },
        ],
        answer: {
          kind: "trueFalse",
          items: [{ id: id(5), content: [{ type: "inlineMath", latex: "x" }], value: true }],
        },
      },
    ]);
    expect(docxExportWarnings(document).filter((w) => /vazio/.test(w))).toEqual([
      "A questão 1 tem um item vazio: ele sai como um marcador sem texto na folha.",
    ]);
  });

  it("documento com todos os itens preenchidos e respostas de outros tipos não avisa", () => {
    const document = doc([
      {
        id: id(1),
        type: "question",
        stem: stem(2),
        answer: { kind: "trueFalse", items: [{ id: id(3), content: filled("ok"), value: true }] },
      },
      { id: id(4), type: "question", stem: stem(5), answer: { kind: "open" } },
    ]);
    expect(pdfExportWarnings(document)).toEqual([]);
    expect(docxExportWarnings(document)).toEqual([]);
  });
});
