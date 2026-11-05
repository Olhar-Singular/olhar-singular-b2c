import { describe, it, expect } from "vitest";
import { copyExportWarnings, MATH_LOSS_WARNING, mathPreviewNotice, pdfExportWarnings } from "./exportWarnings";
import { docxExportWarnings } from "./exportDocx";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { FONT_FAMILY_TOKENS } from "@/lib/adaptation/canonical/fontFamily";

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
// 0444 + C-01 — o caractere que a folha mostra tem que ser o que o arquivo
// imprime. Desde o lote 4 toda família do PDF tem uma fonte de SÍMBOLOS como
// segunda opção (`fontStack.ts`), então a matemática escolar não é mais motivo
// de aviso. Continua sendo o que NENHUMA fonte do arquivo desenha (dingbat `✏`,
// emoji, cirílico, CJK): sai em branco ou trocado, calado, e a professora
// precisa saber ANTES de baixar.
// ---------------------------------------------------------------------------

describe("aviso de caractere sem desenho em nenhuma fonte do PDF (0444, C-01)", () => {
  const withText = (text: string) =>
    doc([{ id: id(1), type: "paragraph", content: [{ type: "text", text }] }]);
  const families = [undefined, ...FONT_FAMILY_TOKENS];

  it("lista o caractere que nenhuma fonte do PDF tem", () => {
    const warning = pdfExportWarnings(withText("Marque ✏ e ⚠ e 😀")).join(" ");
    expect(warning).toMatch(/✏/);
    expect(warning).toMatch(/⚠/);
    expect(warning).toMatch(/😀/);
    expect(warning).toMatch(/nenhuma fonte do PDF/i);
  });

  it("não lista o que a fonte de símbolos ganhou: ✓ ✔ ✗ ✘ ★ ☆ ♥ ♦ ♠ ♣ ⟶ ⟹ ⌀ ⩽ ⩾ ☐ ☑", () => {
    expect(pdfExportWarnings(withText("✓ ✔ ✗ ✘ ★ ☆ ♥ ♦ ♠ ♣ ⟵ ⟶ ⟷ ⟸ ⟹ ⟺ ⌀ ⩽ ⩾ ☐ ☑"))).toEqual([]);
  });

  it("não lista o que é invisível: controle, largura zero, marca bidi, hífen opcional (B1)", () => {
    const invisible = "a\u200Bb\u200Cc\u200Dd\u2060e\uFEFFf\u200Eg\u200Fh\u202Ai\u202Cj\u2066k\u2069l\u00ADm\u0007n\u0000o";
    expect(pdfExportWarnings(withText(invisible))).toEqual([]);
  });

  it("não lista acento combinante: o decomposto do macOS é composto antes de imprimir (B1)", () => {
    expect(pdfExportWarnings(withText("e\u0301 a\u0303 c\u0327 o\u0302 A\u0301"))).toEqual([]);
    // sem forma composta, a marca solta também não é alarme
    expect(pdfExportWarnings(withText("x\u0304 y\u0302"))).toEqual([]);
  });

  it("varre o cabeçalho do Exportar: título, escola e professor (M1)", () => {
    const base = withText("texto comum");
    const warning = pdfExportWarnings(base, undefined, {
      title: "Prova ✏",
      school: "Escola 😀",
      teacher: "Prof. Ж",
    }).join(" ");
    expect(warning).toMatch(/✏/);
    expect(warning).toMatch(/😀/);
    expect(warning).toMatch(/Ж/);
    // cabeçalho sem problema não acrescenta aviso
    expect(pdfExportWarnings(base, undefined, { title: "Prova ✓ ★", date: "2026-11-03" })).toEqual([]);
  });

  it("varre o enunciado da questão, que a folha imprime (M2, C-19)", () => {
    const warning = pdfExportWarnings(
      doc([
        {
          id: id(1),
          type: "question",
          stem: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "Corpo" }] }],
          enunciado: [{ type: "text", text: "Leia ✏ com atenção" }],
          answer: { kind: "open" },
        } as never,
      ]),
    ).join(" ");
    expect(warning).toMatch(/✏/);
  });

  it("não manda mais trocar de família: nenhuma família resolve o que o arquivo não tem", () => {
    const warning = pdfExportWarnings(withText("✏")).join(" ");
    expect(warning).not.toMatch(/acessibilidade/);
  });

  it("não repete o mesmo caractere duas vezes", () => {
    const warning = pdfExportWarnings(withText("✏ ✏ ✏")).join(" ");
    expect(warning.match(/✏/g)).toHaveLength(1);
  });

  it("símbolo de matemática, grego e acento passam em TODA família (a fonte de símbolos cobre)", () => {
    const text = "x ≤ y → z ≠ √9 ∈ ℝ, α Ω, a₀ xⁿ ½ ² € Cão – ações “aspas” e reticências… ł";
    for (const family of families) {
      // (Lexend ainda avisa do itálico: é outro aviso, e este é só sobre caractere.)
      expect(
        pdfExportWarnings(withText(text), { fontFamily: family }).join(" "),
        String(family),
      ).not.toMatch(/nenhuma fonte/i);
    }
  });

  it("o aviso vale para TODA família, inclusive as de acessibilidade", () => {
    for (const family of families) {
      expect(
        pdfExportWarnings(withText("✏"), { fontFamily: family }).join(" "),
        String(family),
      ).toMatch(/✏/);
    }
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
                left: [{ type: "text", text: "Peixe ✏" }],
                right: [{ type: "text", text: "Rio" }],
              },
            ],
          },
        },
      ]),
    ).join(" ");
    expect(warning).toMatch(/✏/);
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

// ---------------------------------------------------------------------------
// Lote 5b (F5): o marcador "não lido" que sobrou no documento sai impresso na prova.
// PDF, Word e Copiar avisam antes de baixar.
// ---------------------------------------------------------------------------

describe("aviso de marcador 'não lido' que sobrou no documento (F5)", () => {
  const withMarker = (text: string) =>
    doc([{ id: id(1), type: "paragraph", content: [{ type: "text", text }] }]);
  const question = (answerText: string) =>
    doc([
      {
        id: id(1),
        type: "question",
        stem: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "Calcule" }] }],
        answer: {
          kind: "multipleChoice",
          alternatives: [{ id: id(3), content: [{ type: "text", text: answerText }], correct: false }],
        },
      } as never,
    ]);

  it("PDF, Word e Copiar avisam, com o texto do marcador", () => {
    const d = withMarker("Calcule [fórmula não lida] agora");
    for (const warnings of [pdfExportWarnings(d), docxExportWarnings(d), copyExportWarnings(d)]) {
      const text = warnings.join(" ");
      expect(text).toMatch(/\[fórmula não lida\]/);
      expect(text).toMatch(/impr/i);
    }
  });

  it("acha o marcador na alternativa e conta quantos são", () => {
    const text = pdfExportWarnings(question("[imagem não lida] e [objeto não lido]")).join(" ");
    expect(text).toMatch(/2 trechos/);
  });

  it("documento sem marcador não ganha aviso", () => {
    expect(pdfExportWarnings(withMarker("Calcule 2 + 2"))).toEqual([]);
    expect(docxExportWarnings(withMarker("Calcule 2 + 2"))).toEqual([]);
    expect(copyExportWarnings(withMarker("Calcule 2 + 2"))).toEqual([]);
  });

  it("um marcador só usa o singular, com tudo concordando (N-U-002)", () => {
    const [warning] = pdfExportWarnings(withMarker("[fórmula não lida]"));
    expect(warning).toBe(
      '1 trecho ainda diz "não lido" ([fórmula não lida]) e vai impresso na prova do jeito que está. ' +
        "Complete ou apague antes de exportar.",
    );
  });

  it("vários marcadores usam o plural em todas as palavras", () => {
    const [warning] = pdfExportWarnings(question("[imagem não lida] e [objeto não lido]"));
    expect(warning).toBe(
      '2 trechos ainda dizem "não lido" ([imagem não lida], [objeto não lido]) e vão impressos na prova do jeito que estão. ' +
        "Complete ou apague antes de exportar.",
    );
  });
});

describe("mathPreviewNotice (C-35): o aviso na prévia, antes do clique", () => {
  const para = (n: number, text: string) => ({ id: id(n), type: "paragraph" as const, content: [{ type: "text" as const, text }] });

  it("não há aviso num documento sem fórmula", () => {
    expect(mathPreviewNotice(doc([para(1, "olá")]))).toBeNull();
  });

  it("mostra o exemplo do próprio documento: a primeira fórmula, como sai no arquivo", () => {
    const notice = mathPreviewNotice(
      doc([para(1, "antes"), { id: id(2), type: "blockMath", latex: "\\frac{1}{2}" }, { id: id(3), type: "blockMath", latex: "x^2" }]),
    );
    expect(notice?.example).toBe("\\frac{1}{2}");
    expect(notice?.text).toMatch(/PDF/);
    expect(notice?.text).toMatch(/Word/);
    expect(notice?.text).toMatch(/copiar/i);
    expect(notice?.text).toMatch(/texto LaTeX/);
    expect(notice?.hasAlt).toBe(false);
    expect(notice?.altText).toBeNull();
  });

  // N-U-007: "a primeira fórmula" é a primeira que a professora vê na folha, não a primeira que a varredura acha.
  describe("a primeira fórmula é a da ordem da folha (N-U-007)", () => {
    const math = (latex: string) => [{ type: "inlineMath" as const, latex }];
    const stemWith = (latex: string) => ({ id: id(2), type: "paragraph" as const, content: [{ type: "text" as const, text: "Resolva " }, ...math(latex)] });
    const alternatives = { kind: "multipleChoice" as const, alternatives: [{ id: id(3), content: math("x = 3"), correct: true }] };

    it("o enunciado (stem) vem antes das alternativas", () => {
      const notice = mathPreviewNotice(doc([{ id: id(1), type: "question", stem: [stemWith("2x - 6 = 0")], answer: alternatives }]));
      expect(notice?.example).toBe("2x - 6 = 0");
    });

    it("o campo enunciado abaixo do stem (padrão) vem depois do stem e antes das alternativas", () => {
      const notice = mathPreviewNotice(
        doc([{ id: id(1), type: "question", stem: [stemWith("a + 1")], enunciado: math("b + 2"), answer: alternatives }]),
      );
      expect(notice?.example).toBe("a + 1");
    });

    it("o campo enunciado ACIMA do stem vem primeiro", () => {
      const notice = mathPreviewNotice(
        doc([
          { id: id(1), type: "question", stem: [stemWith("a + 1")], enunciado: math("b + 2"), enunciadoPosition: "above", answer: alternatives },
        ]),
      );
      expect(notice?.example).toBe("b + 2");
    });

    it("só o enunciado tem fórmula: vem antes da instrução e das alternativas", () => {
      const notice = mathPreviewNotice(
        doc([
          {
            id: id(1),
            type: "question",
            stem: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "Sem fórmula" }] }],
            enunciado: math("e = 1"),
            instruction: math("i = 2"),
            answer: alternatives,
          },
        ]),
      );
      expect(notice?.example).toBe("e = 1");
    });

    it("a instrução vem antes das alternativas e depois do stem", () => {
      const notice = mathPreviewNotice(
        doc([
          {
            id: id(1),
            type: "question",
            stem: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "Sem fórmula" }] }],
            instruction: math("i = 2"),
            answer: alternatives,
          },
        ]),
      );
      expect(notice?.example).toBe("i = 2");
    });

    it("uma questão com fórmula só nas alternativas, depois de um parágrafo com fórmula, segue a ordem do documento", () => {
      const notice = mathPreviewNotice(
        doc([stemWith("p = 1"), { id: id(1), type: "question", stem: [{ id: id(4), type: "paragraph", content: [{ type: "text", text: "q" }] }], answer: alternatives }]),
      );
      expect(notice?.example).toBe("p = 1");
    });

    it("a fórmula em bloco dentro do stem conta na ordem, e a de bloco de fora também", () => {
      const notice = mathPreviewNotice(
        doc([
          {
            id: id(1),
            type: "question",
            stem: [{ id: id(2), type: "blockMath", latex: "s = 9" }],
            answer: alternatives,
          },
        ]),
      );
      expect(notice?.example).toBe("s = 9");
    });
  });

  it("acha a fórmula inline dentro de uma alternativa de questão, em ordem de documento", () => {
    const notice = mathPreviewNotice(
      doc([
        {
          id: id(1),
          type: "question",
          stem: [para(2, "q")],
          answer: { kind: "multipleChoice", alternatives: [{ id: id(3), content: [{ type: "inlineMath", latex: "a+b" }], correct: true }] },
        },
        { id: id(4), type: "blockMath", latex: "z" },
      ]),
    );
    expect(notice?.example).toBe("a+b");
  });

  it("encurta o exemplo quando a fórmula é longa, sem cortar no meio de um comando", () => {
    const long = "\\frac{" + "1234567890".repeat(10) + "}{2}";
    const example = mathPreviewNotice(doc([{ id: id(1), type: "blockMath", latex: long }]))!.example;
    expect(example.length).toBeLessThanOrEqual(41);
    expect(example.endsWith("…")).toBe(true);
  });

  it("diz a verdade sobre a descrição (alt): ela NÃO sai no arquivo, só o código", () => {
    const withAlt = mathPreviewNotice(doc([{ id: id(1), type: "blockMath", latex: "\\frac{1}{2}", alt: "um meio" }]));
    expect(withAlt?.hasAlt).toBe(true);
    expect(withAlt?.altText).toMatch(/descrição[^.]*não sai/i);
    expect(withAlt?.altText).toMatch(/só o código/);
  });

  it("vê a descrição de uma fórmula inline também", () => {
    const notice = mathPreviewNotice(
      doc([{ id: id(1), type: "paragraph", content: [{ type: "inlineMath", latex: "x", alt: "xis" }] }]),
    );
    expect(notice?.hasAlt).toBe(true);
  });

  it("não contradiz o diálogo: o aviso do clique segue sendo o mesmo texto", () => {
    expect(MATH_LOSS_WARNING).toMatch(/texto LaTeX/);
  });
});
