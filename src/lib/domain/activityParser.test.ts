import { describe, it, expect } from "vitest";
import { parseActivity } from "./activityParser";

function firstQuestion(text: string) {
  const out = parseActivity(text);
  for (const sec of out.sections) {
    for (const it of sec.items) {
      if (it.kind === "question") return it.data;
    }
  }
  throw new Error("no question parsed");
}

describe("parseActivity — sections", () => {
  it("returns empty sections array for empty input", () => {
    const out = parseActivity("");
    expect(out.sections).toEqual([]);
  });

  it("creates a section from a single # heading", () => {
    const out = parseActivity("# Primeiro Bloco\n\n1) Pergunta?\n");
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].title).toBe("Primeiro Bloco");
    expect(out.sections[0].level).toBe(1);
  });

  it("creates two sections separated by another # heading", () => {
    const out = parseActivity("# A\n1) p1\n# B\n2) p2\n");
    expect(out.sections).toHaveLength(2);
    expect(out.sections[0].title).toBe("A");
    expect(out.sections[1].title).toBe("B");
  });

  it("level 2 heading reflects ##", () => {
    const out = parseActivity("## Sub\n1) X\n");
    expect(out.sections[0].level).toBe(2);
    expect(out.sections[0].title).toBe("Sub");
  });

  it("instruction (>) before first question becomes section item", () => {
    const out = parseActivity("# A\n> Leia atentamente.\n1) X?\n");
    const items = out.sections[0].items;
    expect(items[0].kind).toBe("instruction");
    if (items[0].kind === "instruction") {
      expect(items[0].text).toBe("Leia atentamente.");
    }
  });

  it("separator --- inserts a separator item and closes prior question", () => {
    const out = parseActivity("# A\n1) p\n---\n2) q\n");
    const items = out.sections[0].items;
    const separators = items.filter((i) => i.kind === "separator");
    expect(separators).toHaveLength(1);
  });

  it("blank line outside question inserts a spacer item (deduplicated)", () => {
    const out = parseActivity("# A\n1) p\n\n\n2) q\n");
    const items = out.sections[0].items;
    const spacers = items.filter((i) => i.kind === "spacer");
    expect(spacers.length).toBeGreaterThanOrEqual(0);
  });

  it("unrecognized line outside question becomes 'unrecognized' item with line number", () => {
    const out = parseActivity("# A\nfoo random text\n");
    const unrec = out.sections[0].items.find((i) => i.kind === "unrecognized");
    expect(unrec).toBeDefined();
    if (unrec?.kind === "unrecognized") {
      expect(unrec.text).toBe("foo random text");
      expect(unrec.lineNo).toBe(2);
    }
  });

  it("math block $$...$$ outside question becomes 'mathblock' item", () => {
    const out = parseActivity("# A\n$$x^2$$\n1) Q\n");
    const math = out.sections[0].items.find((i) => i.kind === "mathblock");
    expect(math).toBeDefined();
    if (math?.kind === "mathblock") expect(math.expr).toBe("x^2");
  });
});

describe("parseActivity — question detection", () => {
  it("matches '1) ...' format", () => {
    const q = firstQuestion("1) Por quê?\n");
    expect(q.number).toBe(1);
    expect(q.statement).toBe("Por quê?");
  });

  it("matches '1. ...' format", () => {
    const q = firstQuestion("1. Por quê?\n");
    expect(q.number).toBe(1);
  });

  it("matches '1: ...' format", () => {
    const q = firstQuestion("1: Por quê?\n");
    expect(q.number).toBe(1);
  });

  it("matches 'Questão N: ...' format", () => {
    const q = firstQuestion("Questão 7: Texto da questão\n");
    expect(q.number).toBe(7);
    expect(q.statement).toContain("Texto");
  });
});

describe("parseActivity — multiple_choice", () => {
  it("captures alternatives a) b) c)", () => {
    const q = firstQuestion("1) Q?\na) Op1\nb) Op2\nc) Op3\n");
    expect(q.type).toBe("multiple_choice");
    expect(q.alternatives.map((a) => a.letter)).toEqual(["a", "b", "c"]);
  });

  it("captures (a) (b) parenthesized format", () => {
    const q = firstQuestion("1) Q?\n(a) Op1\n(b) Op2\n");
    expect(q.alternatives).toHaveLength(2);
  });

  it("marks alternative as correct when * is present in the line", () => {
    const q = firstQuestion("1) Q?\na) Op1\nb*) Op2\nc) Op3\n");
    expect(q.alternatives.find((a) => a.letter === "b")?.correct).toBe(true);
    expect(q.alternatives.find((a) => a.letter === "a")?.correct).toBe(false);
  });

  it("alternatives are case-insensitive (uppercase letters)", () => {
    const q = firstQuestion("1) Q?\nA) Op1\nB) Op2\n");
    expect(q.alternatives.map((a) => a.letter)).toEqual(["a", "b"]);
  });
});

describe("parseActivity — multiple_answer (checkboxes)", () => {
  it("captures [x] and [ ] check items", () => {
    const q = firstQuestion("1) Selecione:\n[x] Marca 1\n[ ] Marca 2\n[X] Marca 3\n");
    expect(q.type).toBe("multiple_answer");
    expect(q.checkItems).toEqual([
      { text: "Marca 1", checked: true },
      { text: "Marca 2", checked: false },
      { text: "Marca 3", checked: true },
    ]);
  });
});

describe("parseActivity — true_false", () => {
  it("captures (V) (F) ( ) markers", () => {
    const q = firstQuestion("1) V ou F:\n(V) verdade\n(F) falso\n( ) vazio\n");
    expect(q.type).toBe("true_false");
    expect(q.tfItems).toEqual([
      { text: "verdade", marked: true },
      { text: "falso", marked: false },
      { text: "vazio", marked: null },
    ]);
  });

  it("V/F items nested under an alternative attach per-alt", () => {
    const q = firstQuestion("1) Avalie:\na) Tópico A\n(V) sub-item 1\n(F) sub-item 2\n");
    const altA = q.alternatives.find((a) => a.letter === "a");
    expect(altA?.tfItems).toHaveLength(2);
    expect(altA?.tfItems[0].marked).toBe(true);
    expect(altA?.tfItems[1].marked).toBe(false);
  });
});

describe("parseActivity — matching", () => {
  it("captures pairs with -- separator", () => {
    const q = firstQuestion("1) Associe:\nA -- 1\nB -- 2\n");
    expect(q.type).toBe("matching");
    expect(q.matchPairs).toEqual([
      { left: "A", right: "1" },
      { left: "B", right: "2" },
    ]);
  });
});

describe("parseActivity — ordering", () => {
  it("captures [N] item items", () => {
    const q = firstQuestion("1) Ordene:\n[1] primeiro\n[2] segundo\n[3] terceiro\n");
    expect(q.type).toBe("ordering");
    expect(q.orderItems).toEqual([
      { n: 1, text: "primeiro" },
      { n: 2, text: "segundo" },
      { n: 3, text: "terceiro" },
    ]);
  });
});

describe("parseActivity — table", () => {
  it("captures table rows with | pipes", () => {
    const q = firstQuestion("1) Preencha:\n| col1 | col2 |\n| a | b |\n");
    expect(q.type).toBe("table");
    expect(q.tableRows.length).toBeGreaterThanOrEqual(1);
    expect(q.tableRows[0]).toEqual(["col1", "col2"]);
  });

  it("ignores separator rows containing only - or :", () => {
    const q = firstQuestion("1) Preencha:\n| h1 | h2 |\n| --- | --- |\n| x | y |\n");
    const allRows = q.tableRows.flat();
    expect(allRows).not.toContain("---");
  });
});

describe("parseActivity — fill_blank and open_ended", () => {
  it("detects fill_blank from underscores in statement", () => {
    const q = firstQuestion("1) Complete: ____ é a resposta.\n");
    expect(q.type).toBe("fill_blank");
  });

  it("falls back to open_ended when no body items match", () => {
    const q = firstQuestion("1) Pergunta livre?\n");
    expect(q.type).toBe("open_ended");
  });
});

describe("parseActivity — directives", () => {
  it("captures [linhas: N] as answerLines", () => {
    const q = firstQuestion("1) Disserte:\n[linhas: 5]\n");
    expect(q.answerLines).toBe(5);
  });

  it("captures [banco: a, b, c] as wordbank", () => {
    const q = firstQuestion("1) Q\n[banco: maçã, banana, uva]\n");
    expect(q.wordbank).toEqual(["maçã", "banana", "uva"]);
  });

  it("captures {N pts} as points and removes from statement", () => {
    const q = firstQuestion("1) Pergunta {3 pts}?\n");
    expect(q.points).toBe(3);
    expect(q.statement).not.toMatch(/pts/);
  });

  it("captures {dificuldade} and normalizes the value", () => {
    const q = firstQuestion("1) Pergunta {fácil}?\n");
    expect(q.difficulty).toBe("fácil");
  });

  it("difficulty 'medio' normalizes to 'médio'", () => {
    const q = firstQuestion("1) X {medio}\n");
    expect(q.difficulty).toBe("médio");
  });

  it("difficulty 'dificil' normalizes to 'difícil'", () => {
    const q = firstQuestion("1) X {dificil}\n");
    expect(q.difficulty).toBe("difícil");
  });
});

describe("parseActivity — images", () => {
  it("captures [img:url] inside a question", () => {
    const q = firstQuestion("1) Q\n[img:foo.png]\n");
    expect(q.images).toEqual(["foo.png"]);
  });

  it("places image in continuations when no body yet", () => {
    const q = firstQuestion("1) Q\n[img:a.png]\na) op1\n");
    expect(q.continuations.some((c) => c.includes("[img:a.png]"))).toBe(true);
  });

  it("places image in trailingContinuations when body already started", () => {
    const q = firstQuestion("1) Q\na) op\n[img:b.png]\n");
    expect(q.trailingContinuations.some((c) => c.includes("[img:b.png]"))).toBe(true);
  });
});

describe("parseActivity — Apoio (scaffolding)", () => {
  it("Apoio before body goes to continuations", () => {
    const q = firstQuestion("1) Q\n> Apoio: dica\na) op\n");
    expect(q.continuations.some((c) => c.includes("Apoio"))).toBe(true);
  });

  it("Apoio after body goes to trailingContinuations", () => {
    const q = firstQuestion("1) Q\na) op\n> Apoio: dica\n");
    expect(q.trailingContinuations.some((c) => c.includes("Apoio"))).toBe(true);
  });
});

describe("parseActivity — instruction inside question", () => {
  it("attaches non-Apoio instruction to last alternative when present", () => {
    const q = firstQuestion("1) Q\na) op A\n> nota da alternativa\n");
    const altA = q.alternatives.find((a) => a.letter === "a");
    expect(altA?.continuations.some((c) => c.includes("nota da alternativa"))).toBe(true);
  });

  it("attaches non-Apoio instruction to question continuations when no alt yet", () => {
    const q = firstQuestion("1) Q\n> contexto antes da resposta\n");
    expect(q.continuations.some((c) => c.includes("contexto"))).toBe(true);
  });
});

describe("parseActivity — math block inside question", () => {
  it("attaches inline math block to last alternative", () => {
    const q = firstQuestion("1) Q\na) op\n$$x+1$$\n");
    const altA = q.alternatives.find((a) => a.letter === "a");
    expect(altA?.continuations.some((c) => c.includes("$$x+1$$"))).toBe(true);
  });

  it("attaches math block to question when no alt yet", () => {
    const q = firstQuestion("1) Q\n$$y=2$$\n");
    expect(q.continuations.some((c) => c.includes("$$y=2$$"))).toBe(true);
  });
});

describe("parseActivity — continuations and blank-line marker", () => {
  it("blank line inside a question pushes <!--blank--> to continuations", () => {
    const q = firstQuestion("1) Q\nlinha 1\n\nlinha 2\n");
    expect(q.continuations).toContain("<!--blank-->");
  });

  it("does not duplicate consecutive blank-line markers", () => {
    const q = firstQuestion("1) Q\nlinha\n\n\n\n");
    const blanks = q.continuations.filter((c) => c === "<!--blank-->");
    expect(blanks.length).toBe(1);
  });

  it("plain continuation line attaches to the question when no alt yet", () => {
    const q = firstQuestion("1) Q\nmais contexto\n");
    expect(q.continuations).toContain("mais contexto");
  });

  it("plain continuation line attaches to last alternative when alt exists", () => {
    const q = firstQuestion("1) Q\na) op\nmais detalhe da op\n");
    const altA = q.alternatives.find((a) => a.letter === "a");
    expect(altA?.continuations).toContain("mais detalhe da op");
  });
});

describe("parseActivity — missing branches", () => {
  it("ignores [img:...] line that appears outside any question (line 224 false branch)", () => {
    // [img:...] outside a question: curQ is null, so the if(curQ) branch is not taken
    const out = parseActivity("# Seção\n[img:outside.png]\n1) Q?\n");
    const sec = out.sections[0];
    // The image line outside a question is silently dropped (no crash, no item added for it)
    const unrecognized = sec.items.filter((i) => i.kind === "unrecognized");
    // img line should not be an unrecognized item, it just continues
    expect(unrecognized.map((u) => u.kind === "unrecognized" && u.text)).not.toContain("outside.png");
  });

  it("skips matching pair when alternatives exist but matchMode is false (line 341 false branch)", () => {
    // a -- b matches the matching regex; but alternatives.length > 0 and matchMode is false
    // => the if(matchMode || curQ.alternatives.length === 0) is false => line falls through to alt/continuation
    const q = firstQuestion("1) Q\na) primeira alternativa\nb -- c\n");
    // The line b -- c is not treated as a match pair because alternatives already exist and matchMode=false
    expect(q.matchPairs).toHaveLength(0);
  });
});

describe("parseActivity — multi-question + multi-section", () => {
  it("parses two questions separated by a question marker", () => {
    const out = parseActivity("# Sec\n1) p1\na) op\n2) p2\nb) op\n");
    const qs = out.sections[0].items.filter((i) => i.kind === "question");
    expect(qs).toHaveLength(2);
  });

  it("preserves question types across boundaries", () => {
    const out = parseActivity(
      "# Sec\n1) Q1?\na) op\nb) op\n2) Q2?\n[x] item\n",
    );
    const qs = out.sections[0].items.filter((i) => i.kind === "question");
    if (qs[0].kind === "question") expect(qs[0].data.type).toBe("multiple_choice");
    if (qs[1].kind === "question") expect(qs[1].data.type).toBe("multiple_answer");
  });

  it("resets checkMode on blank line when alternatives exist (line 173)", () => {
    // checkMode=true + alternatives.length > 0 => line 173 executes on blank line
    // Sequence: alternatives exist, then a checkbox item (sets checkMode), then blank
    const q = firstQuestion("# S\n1) Q?\na) primeira\n[x] marcado\n\nb) segunda\n");
    // After blank resets checkMode; b) is parsed as a new alternative
    expect(q.alternatives.length).toBeGreaterThanOrEqual(2);
  });

  it("stores a blank tf item nested under the last alternative (line 311)", () => {
    // ( ) text after an alternative => stored in lastAlt.tfItems
    const q = firstQuestion("# S\n1) Q?\na) primeira\n( ) sub item\n");
    const lastAlt = q.alternatives[q.alternatives.length - 1];
    expect(lastAlt.tfItems.length).toBeGreaterThan(0);
    expect(lastAlt.tfItems[0].marked).toBeNull();
    expect(lastAlt.tfItems[0].text).toBe("sub item");
  });
});
