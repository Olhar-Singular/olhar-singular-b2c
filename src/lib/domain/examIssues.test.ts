import { describe, it, expect } from "vitest";
import { UNREAD_FORMULA, UNREAD_IMAGE } from "./unreadMarker";
import {
  findInputProblems,
  describeInputProblems,
  describeExtractionIssues,
  adaptationNoticeCopy,
  parseExtractionIssues,
  type ExtractionIssue,
} from "./examIssues";

describe("findInputProblems: o que o arquivo já mostra antes de qualquer cobrança", () => {
  it("aponta a questão de cada marcador de 'não lida' e de cada lacuna", () => {
    const text = [
      "9º ano: sistema, raiz",
      "1) Resolva o sistema:",
      `2) Calcule ${UNREAD_FORMULA}.`,
      "3) Simplifique .",
      "4) Calcule .",
      "5) Um triângulo tem 6 cm e 8 cm.",
      `6) Veja ${UNREAD_IMAGE} e responda.`,
    ].join("\n");
    expect(findInputProblems(text)).toEqual([
      { question: "2", kind: "unread", excerpt: `2) Calcule ${UNREAD_FORMULA}.` },
      { question: "3", kind: "gap", excerpt: "3) Simplifique ." },
      { question: "4", kind: "gap", excerpt: "4) Calcule ." },
      { question: "6", kind: "unread", excerpt: `6) Veja ${UNREAD_IMAGE} e responda.` },
    ]);
  });

  it("marcador em linha de alternativa usa a questão em curso; sem questão ainda, fica sem número", () => {
    const text = `${UNREAD_OBJECT_LINE}\n3) Escolha:\n(a) ${UNREAD_FORMULA}\n(b) 2`;
    const found = findInputProblems(text);
    expect(found.map((p) => p.question)).toEqual([null, "3"]);
  });

  it("'Questão 7' e 'Q7' também numeram; trecho longo é cortado", () => {
    const long = `Questão 7 - Calcule ${UNREAD_FORMULA} ${"a".repeat(200)}`;
    const [problem] = findInputProblems(long);
    expect(problem.question).toBe("7");
    expect(problem.excerpt.length).toBeLessThanOrEqual(81);
    expect(problem.excerpt.endsWith("…")).toBe(true);
  });

  it("texto limpo não tem problema", () => {
    expect(findInputProblems("1) Quanto é 2 + 2?\n2) Resolva:\na) 3")).toEqual([]);
  });
});

const UNREAD_OBJECT_LINE = "Prova com [objeto não lido] solto";

describe("describeInputProblems", () => {
  it("escreve em português, uma frase por problema", () => {
    expect(
      describeInputProblems([
        { question: "2", kind: "unread", excerpt: "x" },
        { question: "4", kind: "gap", excerpt: "x" },
        { question: null, kind: "unread", excerpt: "x" },
        { question: null, kind: "gap", excerpt: "x" },
      ]),
    ).toEqual([
      "Questão 2: tem uma parte que o arquivo não deixou ler (fórmula ou figura).",
      "Questão 4: parece estar sem a conta ou a expressão.",
      "Um trecho do arquivo tem uma parte que não deu para ler (fórmula ou figura).",
      "parece estar sem a conta ou a expressão.",
    ]);
  });
});

describe("describeExtractionIssues", () => {
  it("diz, por questão, o que olhar, sem tom de acusação nem travessão", () => {
    const issues: ExtractionIssue[] = [
      { question: 1, kind: "invented", items: ["x+y=5", "x-y=1"] },
      { question: 2, kind: "unread", items: [UNREAD_FORMULA] },
      { question: 3, kind: "gap", items: ["Calcule ."] },
      { question: null, kind: "lost_marker", items: [] },
    ];
    const lines = describeExtractionIssues(issues);
    expect(lines).toEqual([
      "Questão 1: tem valores que não aparecem no arquivo enviado (x+y=5, x-y=1). Compare com o original.",
      "Questão 2: tem uma parte que não deu para ler (fórmula ou figura). Complete na revisão.",
      "Questão 3: parece estar sem a conta ou a expressão. Compare com o original.",
      "Uma parte que não deu para ler foi completada pela leitura. Compare todas as contas com o original.",
    ]);
    expect(lines.join(" ")).not.toContain("—");
  });

  it("corta a lista de valores longos", () => {
    const [line] = describeExtractionIssues([
      { question: 5, kind: "invented", items: ["1", "2", "3", "4", "5", "6", "7", "8"] },
    ]);
    expect(line).toContain("(1, 2, 3, 4, 5 e mais 3)");
  });
});

describe("parseExtractionIssues: a resposta da função, validada", () => {
  it("aceita só a forma esperada e descarta o resto", () => {
    expect(
      parseExtractionIssues([
        { question: 1, kind: "invented", items: ["7+9"] },
        { question: null, kind: "lost_marker", items: [] },
        { question: "1", kind: "invented", items: [] },
        { question: 2, kind: "outro", items: [] },
        { question: 3, kind: "gap", items: [4] },
        null,
        "x",
      ]),
    ).toEqual([
      { question: 1, kind: "invented", items: ["7+9"] },
      { question: null, kind: "lost_marker", items: [] },
    ]);
  });

  it("resposta sem issues (função antiga) vira lista vazia", () => {
    expect(parseExtractionIssues(undefined)).toEqual([]);
    expect(parseExtractionIssues({})).toEqual([]);
  });
});

describe("describeExtractionIssues com a numeração da folha (F5, lote 5b)", () => {
  const issue = { question: 2, kind: "unread" as const, items: ["[fórmula não lida]"] };

  it("usa o número que a folha imprime quando ela ainda tem as questões da leitura", () => {
    const [line] = describeExtractionIssues([{ ...issue, of: 3 }], { labels: ["1", "7", "3"] });
    expect(line).toMatch(/^Questão 7: /);
  });

  it("sem o campo `of` (resposta antiga) mantém a posição", () => {
    expect(describeExtractionIssues([issue], { labels: ["1", "2"] })[0]).toMatch(/^Questão 2: /);
  });

  it("se a IA dividiu ou fundiu questões, aponta pelo começo do texto, não por um número errado", () => {
    const [withExcerpt, bare] = describeExtractionIssues(
      [
        { ...issue, of: 2, excerpt: "Calcule a área" },
        { ...issue, of: 2 },
      ],
      { labels: ["1", "2", "3", "4", "5"] },
    );
    expect(withExcerpt).toMatch(/^A questão "Calcule a área": /);
    expect(bare).toMatch(/^Uma questão: /);
  });

  it("apontamento sem questão (marcador perdido) não leva rótulo", () => {
    expect(describeExtractionIssues([{ question: null, kind: "lost_marker", items: [] }], { labels: ["1"] })[0]).toMatch(/^Uma parte/);
  });

  it("rótulo ausente na folha cai na posição", () => {
    expect(describeExtractionIssues([{ ...issue, question: 5, of: 1 }], { labels: ["1"] })).toHaveLength(1);
  });
});

describe("avisos da adaptação (C-04)", () => {
  it("diz que a atividade enviada não trazia os números, pelo número que a folha imprime", () => {
    const [line] = describeExtractionIssues(
      [{ question: 3, kind: "new_value", items: ["10", "8"], of: 4 }],
      { labels: ["1", "2", "5", "6"] },
    );
    expect(line).toBe(
      "Questão 5: tem números que a atividade enviada não trazia (10, 8). Se a questão depende de uma figura ou gráfico, a IA pode ter inventado os dados: compare com o original.",
    );
  });

  it("avisa quando a IA tirou uma parte que não deu para ler", () => {
    expect(describeExtractionIssues([{ question: null, kind: "marker_dropped", items: [] }])[0]).toMatch(
      /^A IA tirou uma parte que não deu para ler/,
    );
  });

  it("aceita os dois tipos novos vindos do servidor", () => {
    const issues = [
      { question: 1, kind: "new_value", items: ["3"] },
      { question: null, kind: "marker_dropped", items: [] },
    ];
    expect(parseExtractionIssues({ issues })).toEqual(issues);
  });
});

describe("fórmula que não pôde ser mostrada (C-10)", () => {
  it("diz qual questão tem a fórmula e que se corrige direto na folha", () => {
    const [line] = describeExtractionIssues(
      [{ question: 2, kind: "invalid_latex", items: ["9 - 4 = ___"], of: 3 }],
      { labels: ["1", "2", "3"] },
    );
    expect(line).toBe(
      "Questão 2: tem uma fórmula que não foi possível mostrar (9 - 4 = ___). Corrija direto na folha antes de exportar.",
    );
    expect(line).not.toContain("—");
  });

  it("aceita o tipo vindo do servidor", () => {
    const issues = [{ question: 1, kind: "invalid_latex", items: ["x"] }];
    expect(parseExtractionIssues({ issues })).toEqual(issues);
  });
});

describe("fração que perdeu o agrupamento (N-I-001)", () => {
  it("diz a questão e a fração, ou só a fração quando não há questão", () => {
    const [withQuestion] = describeExtractionIssues([{ question: 1, kind: "fraction", items: ["(2 x + 1)/3"], of: 2 }], { labels: ["1", "2"] });
    expect(withQuestion).toBe(
      "Questão 1: tem uma fração que pode ter perdido o agrupamento ((2 x + 1)/3). Compare com o original: o numerador e o denominador precisam ser os do arquivo.",
    );
    const [bare] = describeExtractionIssues([{ question: null, kind: "fraction", items: ["(2 x + 1)/3"] }]);
    expect(bare).toMatch(/^Uma fração do arquivo pode ter perdido o agrupamento/);
    expect(parseExtractionIssues({ issues: [{ question: 1, kind: "fraction", items: ["x"] }] })).toHaveLength(1);
  });
});

describe("adaptationNoticeCopy (L9BC-6)", () => {
  it("fala de números só quando todo aviso é de número novo", () => {
    const copy = adaptationNoticeCopy([{ question: 1, kind: "new_value", items: ["10"] }]);
    expect(copy.title).toBe("Confira estes números com a atividade original");
    expect(copy.hint).toMatch(/números que a atividade não trazia/);
  });

  it("usa um texto neutro quando algum aviso é de outro tipo", () => {
    for (const kind of ["invalid_latex", "fraction", "answer_key", "marker_dropped", "unread"] as const) {
      const copy = adaptationNoticeCopy([{ question: 1, kind, items: [] }]);
      expect(copy.title).toBe("Confira estes trechos com a atividade original");
      expect(copy.hint).not.toMatch(/números/);
    }
    expect(adaptationNoticeCopy([{ question: 1, kind: "new_value", items: ["10"] }, { question: 2, kind: "fraction", items: [] }]).title).toMatch(/trechos/);
  });

  it("lista vazia: o texto de número (o aviso nem aparece)", () => {
    expect(adaptationNoticeCopy([]).title).toMatch(/números/);
  });
});

describe("gabarito reservado (F6-1)", () => {
  it("diz que a questão não foi resolvida e que o gabarito precisa ser marcado", () => {
    const [line] = describeExtractionIssues([{ question: 2, kind: "answer_key", items: [], of: 3 }], { labels: ["1", "2", "3"] });
    expect(line).toBe(
      "Questão 2: tem uma parte que não deu para ler, então o gabarito dela é só um espaço reservado: a questão não foi resolvida. Complete a parte que falta e marque a resposta certa.",
    );
    expect(parseExtractionIssues({ issues: [{ question: 1, kind: "answer_key", items: [] }] })).toHaveLength(1);
  });
});
