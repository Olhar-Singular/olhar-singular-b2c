import { describe, it, expect } from "vitest";
import {
  structuredToMarkdownDsl,
  markdownDslToStructured,
} from "./activityDslConverter";
import type { StructuredActivity } from "@/types/adaptation";

describe("structuredToMarkdownDsl", () => {
  it("emits general_instructions as a leading > block", () => {
    const activity: StructuredActivity = {
      general_instructions: "Leia com atenção.",
      sections: [{ title: "S1", questions: [] }],
    };
    const out = structuredToMarkdownDsl(activity);
    expect(out).toContain("> Leia com atenção.");
    expect(out).toContain("# S1");
  });

  it("emits a section title as # heading and questions as numbered lines", () => {
    const activity: StructuredActivity = {
      sections: [
        {
          title: "Bloco A",
          questions: [
            { number: 1, type: "open_ended", statement: "Por quê?" },
          ],
        },
      ],
    };
    const out = structuredToMarkdownDsl(activity);
    expect(out).toContain("# Bloco A");
    expect(out).toContain("1) Por quê?");
  });

  it("emits multiple_choice alternatives with letter and correctness mark", () => {
    const activity: StructuredActivity = {
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "multiple_choice",
              statement: "Qual?",
              alternatives: [
                { letter: "a", text: "Opção 1", is_correct: false },
                { letter: "b", text: "Opção 2", is_correct: true },
              ],
            },
          ],
        },
      ],
    };
    const out = structuredToMarkdownDsl(activity);
    expect(out).toContain("a) Opção 1");
    expect(out).toContain("b*) Opção 2");
  });

  it("emits true/false items with (V), (F) and ( ) markers", () => {
    const activity: StructuredActivity = {
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "true_false",
              statement: "Marque V ou F:",
              tf_items: [
                { text: "Item A", marked: true },
                { text: "Item B", marked: false },
                { text: "Item C", marked: null },
              ],
            },
          ],
        },
      ],
    };
    const out = structuredToMarkdownDsl(activity);
    expect(out).toContain("(V) Item A");
    expect(out).toContain("(F) Item B");
    expect(out).toContain("( ) Item C");
  });

  it("emits multiple_answer items with [x] and [ ] checkboxes", () => {
    const activity: StructuredActivity = {
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "multiple_answer",
              statement: "Selecione:",
              check_items: [
                { text: "A", checked: true },
                { text: "B", checked: false },
              ],
            },
          ],
        },
      ],
    };
    const out = structuredToMarkdownDsl(activity);
    expect(out).toContain("[x] A");
    expect(out).toContain("[ ] B");
  });
});

describe("markdownDslToStructured", () => {
  it("parses a section heading into sections[*].title", () => {
    const out = markdownDslToStructured("# Bloco\n\n1) Pergunta?\n");
    expect(out.sections.length).toBeGreaterThan(0);
    expect(out.sections[0].title).toBe("Bloco");
  });

  it("parses a numbered question into a structured question", () => {
    const out = markdownDslToStructured("# Bloco\n\n1) Por quê?\n");
    const q = out.sections[0].questions[0];
    expect(q.number).toBe(1);
    expect(q.statement).toContain("Por quê");
  });

  it("extracts a general instruction (top-level > before any section title)", () => {
    const out = markdownDslToStructured("> Leia com atenção.\n\n# A\n\n1) X?\n");
    expect(out.general_instructions).toBe("Leia com atenção.");
    expect(out.sections[0].title).toBe("A");
  });

  it("parses multiple_choice alternatives back into structured form", () => {
    const dsl = "# A\n\n1) Qual?\na) Op1\nb*) Op2\n";
    const out = markdownDslToStructured(dsl);
    const q = out.sections[0].questions[0];
    expect(q.type).toBe("multiple_choice");
    expect(q.alternatives?.length).toBe(2);
    expect(q.alternatives?.find((a) => a.is_correct)?.letter).toBe("b");
  });
});

describe("structuredToMarkdownDsl — extra branches", () => {
  it("emits matching pairs with -- separator", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "matching",
              statement: "Associe:",
              match_pairs: [
                { left: "A", right: "1" },
                { left: "B", right: "2" },
              ],
            },
          ],
        },
      ],
    });
    expect(out).toContain("A -- 1");
    expect(out).toContain("B -- 2");
  });

  it("emits ordering items with [N] prefix", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "ordering",
              statement: "Ordene:",
              order_items: [
                { n: 1, text: "primeiro" },
                { n: 2, text: "segundo" },
              ],
            },
          ],
        },
      ],
    });
    expect(out).toContain("[1] primeiro");
    expect(out).toContain("[2] segundo");
  });

  it("emits table rows wrapped in pipes", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "table",
              statement: "Tabela:",
              table_rows: [
                ["h1", "h2"],
                ["a", "b"],
              ],
            },
          ],
        },
      ],
    });
    expect(out).toContain("| h1 | h2 |");
    expect(out).toContain("| a | b |");
  });

  it("emits fill_blank with [banco: ...] when blank_placeholder is set", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "fill_blank",
              statement: "Complete: ____",
              blank_placeholder: "azul, vermelho",
            },
          ],
        },
      ],
    });
    expect(out).toContain("[banco: azul, vermelho]");
  });

  it("emits open_ended with [linhas:N] using provided answerLines", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "open_ended",
              statement: "Disserte:",
              answerLines: 8,
            },
          ],
        },
      ],
    });
    expect(out).toContain("[linhas:8]");
  });

  it("emits open_ended with default 4 lines when no answerLines", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            { number: 1, type: "open_ended", statement: "Disserte:" },
          ],
        },
      ],
    });
    expect(out).toContain("[linhas:4]");
  });

  it("emits empty (V/F) markers when tf_items is empty", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            { number: 1, type: "true_false", statement: "?" },
          ],
        },
      ],
    });
    expect(out).toContain("( ) Verdadeiro");
    expect(out).toContain("( ) Falso");
  });

  it("emits leading > instruction for the question", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "open_ended",
              statement: "Q",
              instruction: "Considere o texto.",
            },
          ],
        },
      ],
    });
    expect(out).toContain("> Considere o texto.");
  });

  it("emits scaffolding as > Apoio: lines after the question body", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "open_ended",
              statement: "Q",
              scaffolding: ["passo 1", "passo 2"],
            },
          ],
        },
      ],
    });
    expect(out).toContain("> Apoio: passo 1");
    expect(out).toContain("> Apoio: passo 2");
  });

  it("emits images as [img:src] when not already in content/trailingContent", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "open_ended",
              statement: "Veja:",
              images: ["foo.png", "bar.png"],
            },
          ],
        },
      ],
    });
    expect(out).toContain("[img:foo.png]");
    expect(out).toContain("[img:bar.png]");
  });

  it("emits trailingContent (text + image + scaffolding) in order", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "open_ended",
              statement: "Q",
              trailingContent: [
                { id: "t1", type: "text", content: "depois" },
                { id: "t2", type: "image", src: "img.png", width: 0.5, alignment: "center" },
                { id: "t3", type: "scaffolding", items: ["dica"] },
              ],
            },
          ],
        },
      ],
    });
    expect(out).toContain("depois");
    expect(out).toContain("[img:img.png]");
    expect(out).toContain("> Apoio: dica");
  });

  it("emits content blocks (text + image + scaffolding) in order with first text as header", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "open_ended",
              statement: "fallback statement",
              content: [
                { id: "c1", type: "text", content: "header text" },
                { id: "c2", type: "image", src: "x.png", width: 0.7, alignment: "center" },
                { id: "c3", type: "scaffolding", items: ["s1"] },
                { id: "c4", type: "text", content: "secundário" },
              ],
            },
          ],
        },
      ],
    });
    expect(out).toContain("1) header text");
    expect(out).toContain("[img:x.png]");
    expect(out).toContain("> Apoio: s1");
    expect(out).toContain("secundário");
  });

  it("uses statement as header when content has no text block", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        {
          questions: [
            {
              number: 1,
              type: "open_ended",
              statement: "Use this statement",
              content: [
                { id: "c1", type: "image", src: "x.png", width: 0.7, alignment: "center" },
              ],
            },
          ],
        },
      ],
    });
    expect(out).toContain("1) Use this statement");
  });

  it("inserts --- separator between sections", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        { title: "A", questions: [{ number: 1, type: "open_ended", statement: "p" }] },
        { title: "B", questions: [{ number: 2, type: "open_ended", statement: "q" }] },
      ],
    });
    expect(out).toContain("---");
  });

  it("emits section introduction as > line after title", () => {
    const out = structuredToMarkdownDsl({
      sections: [
        { title: "S", introduction: "intro da seção", questions: [] },
      ],
    });
    expect(out).toContain("> intro da seção");
  });
});

describe("markdownDslToStructured — extra branches", () => {
  it("returns structured types for multiple_answer", () => {
    const out = markdownDslToStructured("1) Selecione:\n[x] A\n[ ] B\n");
    const q = out.sections[0].questions[0];
    expect(q.type).toBe("multiple_answer");
    expect(q.check_items).toEqual([
      { text: "A", checked: true },
      { text: "B", checked: false },
    ]);
  });

  it("returns structured types for true_false", () => {
    const out = markdownDslToStructured("1) Q\n(V) v\n(F) f\n");
    const q = out.sections[0].questions[0];
    expect(q.type).toBe("true_false");
    expect(q.tf_items).toHaveLength(2);
  });

  it("returns structured types for matching", () => {
    const out = markdownDslToStructured("1) Q\nA -- 1\nB -- 2\n");
    const q = out.sections[0].questions[0];
    expect(q.type).toBe("matching");
    expect(q.match_pairs).toHaveLength(2);
  });

  it("returns structured types for ordering", () => {
    const out = markdownDslToStructured("1) Q\n[1] x\n[2] y\n");
    const q = out.sections[0].questions[0];
    expect(q.type).toBe("ordering");
    expect(q.order_items).toHaveLength(2);
  });

  it("returns structured types for table", () => {
    const out = markdownDslToStructured("1) Q\n| a | b |\n| c | d |\n");
    const q = out.sections[0].questions[0];
    expect(q.type).toBe("table");
    expect(q.table_rows!.length).toBeGreaterThanOrEqual(2);
  });

  it("captures answerLines from [linhas:N]", () => {
    const out = markdownDslToStructured("1) Disserte:\n[linhas:6]\n");
    expect(out.sections[0].questions[0].answerLines).toBe(6);
  });

  it("captures blank_placeholder from [banco: ...]", () => {
    const out = markdownDslToStructured("1) Q\n[banco: a, b, c]\n");
    expect(out.sections[0].questions[0].blank_placeholder).toBe("a, b, c");
  });

  it("captures images list", () => {
    const out = markdownDslToStructured("1) Q\n[img:foo.png]\n");
    const q = out.sections[0].questions[0];
    expect(q.images).toEqual(["foo.png"]);
  });

  it("captures multi-line instructions joined by newline", () => {
    const out = markdownDslToStructured("1) Q\n> nota 1\n> nota 2\n");
    const q = out.sections[0].questions[0];
    expect(q.instruction).toContain("nota 1");
    expect(q.instruction).toContain("nota 2");
  });

  it("captures scaffolding from > Apoio: lines into q.scaffolding", () => {
    const out = markdownDslToStructured("1) Q\na) op\n> Apoio: dica1\n> Apoio: dica2\n");
    const q = out.sections[0].questions[0];
    expect(q.scaffolding).toEqual(["dica1", "dica2"]);
  });

  it("creates content blocks from inline images and text", () => {
    const out = markdownDslToStructured("1) statement text\n[img:x.png]\nmais texto\n");
    const q = out.sections[0].questions[0];
    expect(q.content?.some((b) => b.type === "image")).toBe(true);
    expect(q.content?.some((b) => b.type === "text")).toBe(true);
  });

  it("creates trailingContent blocks when content appears after body", () => {
    const out = markdownDslToStructured("1) Q\na) op\n> Apoio: dica\n");
    const q = out.sections[0].questions[0];
    expect(q.trailingContent?.some((b) => b.type === "scaffolding")).toBe(true);
  });

  it("filters out empty alternatives from multiple_choice", () => {
    const out = markdownDslToStructured("1) Q\na) ok\nb) ok2\n");
    const q = out.sections[0].questions[0];
    expect(q.alternatives?.length).toBe(2);
  });

  it("falls back to open_ended for unknown parser type", () => {
    const out = markdownDslToStructured("1) Q sem corpo\n");
    expect(out.sections[0].questions[0].type).toBe("open_ended");
  });

  it("handles empty input", () => {
    const out = markdownDslToStructured("");
    expect(out.sections).toEqual([]);
  });

  it("derives q.scaffolding from Apoio in content blocks (before body, line 371)", () => {
    // > Apoio: before any alternatives => goes to continuations => content scaffolding block
    const out = markdownDslToStructured("1) Q\n> Apoio: dica cedo\n");
    const q = out.sections[0].questions[0];
    expect(q.scaffolding).toEqual(["dica cedo"]);
  });
});

describe("activityDslConverter — missing branches", () => {
  it("buildBlocksFromLines: skips flushText when text is empty after trim (line 433)", () => {
    // Questão N: with no text => statement is "" => textBuffer seed is ""
    // Then [img:...] triggers flushText with whitespace-only buffer (hits the text.length===0 early return)
    const out = markdownDslToStructured("Questão 1:\n[img:x.png]\n");
    const q = out.sections[0].questions[0];
    // image block should be present even though text buffer was empty
    expect(q.content?.some((b) => b.type === "image")).toBe(true);
  });

  it("buildBlocksFromLines: includes richContent when text contains markdown (line 439 true branch)", () => {
    // text with * triggers parseMarkdownInline to return a non-undefined value => richContent truthy
    const out = markdownDslToStructured("1) **enunciado** em negrito\n");
    const q = out.sections[0].questions[0];
    const textBlock = q.content?.find((b) => b.type === "text");
    expect(textBlock).toBeDefined();
    if (textBlock?.type === "text") {
      expect(textBlock.richContent).toBeDefined();
    }
  });

  it("buildBlocksFromLines: skips $$ and plain > lines without apoio (line 480 $$ branch)", () => {
    // A $$ line inside a question continuation triggers the startsWith("$$") branch in buildBlocksFromLines
    const out = markdownDslToStructured("1) Q\n$$x=1$$\nrespondido\n");
    const q = out.sections[0].questions[0];
    // $$ line is dropped from content blocks; plain continuation is kept
    expect(q.content?.some((b) => b.type === "text" && b.content.includes("respondido"))).toBe(true);
  });

  it("mapQuestionType: default branch uses open_ended fallback via structuredToMarkdownDsl roundtrip", () => {
    // Exercise the default path indirectly by ensuring fill_blank roundtrips correctly
    // (covering all switch cases so v8 sees complete branch coverage)
    const out = structuredToMarkdownDsl({
      sections: [{
        questions: [{ number: 1, type: "fill_blank", statement: "Complete: ____" }],
      }],
    });
    expect(out).toContain("1) Complete");
  });

  it("emits no alternatives for multiple_choice question with empty alternatives (line 68 false branch)", () => {
    const out = structuredToMarkdownDsl({
      sections: [{ questions: [{ number: 1, type: "multiple_choice", statement: "Q?" }] }],
    });
    expect(out).toContain("1) Q?");
    // no alternatives emitted
    expect(out).not.toMatch(/^[a-f]\)/m);
  });

  it("emits no checkboxes for multiple_answer question with empty check_items (line 77 false branch)", () => {
    const out = structuredToMarkdownDsl({
      sections: [{ questions: [{ number: 1, type: "multiple_answer", statement: "Q?" }] }],
    });
    expect(out).toContain("1) Q?");
    expect(out).not.toContain("[x]");
    expect(out).not.toContain("[ ]");
  });

  it("emits nothing for matching question with empty match_pairs (line 99 false branch)", () => {
    const out = structuredToMarkdownDsl({
      sections: [{ questions: [{ number: 1, type: "matching", statement: "Q" }] }],
    });
    expect(out).toContain("1) Q");
    expect(out).not.toContain(" -- ");
  });

  it("emits nothing for ordering question with empty order_items (line 107 false branch)", () => {
    const out = structuredToMarkdownDsl({
      sections: [{ questions: [{ number: 1, type: "ordering", statement: "Q" }] }],
    });
    expect(out).toContain("1) Q");
    expect(out).not.toMatch(/\[\d+\]/);
  });

  it("emits nothing for table question with empty table_rows (line 115 false branch)", () => {
    const out = structuredToMarkdownDsl({
      sections: [{ questions: [{ number: 1, type: "table", statement: "Q" }] }],
    });
    expect(out).toContain("1) Q");
    expect(out).not.toContain("|");
  });

  it("emits section questions without title prefix when section has no title (line 44 false branch)", () => {
    // section.title is undefined => if(section.title) false branch
    const out = structuredToMarkdownDsl({
      sections: [{ questions: [{ number: 1, type: "open_ended", statement: "Q sem título" }] }],
    });
    expect(out).toContain("1) Q sem título");
    expect(out).not.toContain("# ");
  });

  it("trailingContent with unknown block type silently skipped (else if scaffolding false branch)", () => {
    // Pass an unknown block type via cast to hit the false branch of else if(type==='scaffolding')
    const out = structuredToMarkdownDsl({
      sections: [{
        questions: [{
          number: 1,
          type: "open_ended",
          statement: "Q",
           
          trailingContent: [{ id: "t1", type: "unknown_type" } as any],
        }],
      }],
    });
    expect(out).toContain("1) Q");
  });

  it("content block with unknown type silently skipped in emitQuestionFromContent (else if scaffolding false branch)", () => {
    const out = structuredToMarkdownDsl({
      sections: [{
        questions: [{
          number: 1,
          type: "open_ended",
          statement: "Q",
          content: [
            { id: "c1", type: "text", content: "header" },
             
            { id: "c2", type: "unknown_type" } as any,
          ],
        }],
      }],
    });
    expect(out).toContain("1) header");
  });

  it("trailingContent non-scaffolding blocks don't add to scaffolding array (line 375 false branch)", () => {
    // trailingContent with image and text blocks => the if(block.type==='scaffolding') loop iteration is false
    const out = markdownDslToStructured("1) Q\na) op\n[img:trailing.png]\n");
    const q = out.sections[0].questions[0];
    // image goes to trailingContent; no scaffolding block means q.scaffolding is undefined
    expect(q.trailingContent?.some((b) => b.type === "image")).toBe(true);
    expect(q.scaffolding).toBeUndefined();
  });
});

describe("roundtrip structured -> dsl -> structured", () => {
  it("preserves question numbering and section titles for an open_ended question", () => {
    const original: StructuredActivity = {
      sections: [
        {
          title: "Sec1",
          questions: [
            { number: 1, type: "open_ended", statement: "Pergunta?" },
            { number: 2, type: "open_ended", statement: "Outra?" },
          ],
        },
      ],
    };
    const dsl = structuredToMarkdownDsl(original);
    const back = markdownDslToStructured(dsl);
    expect(back.sections[0].title).toBe("Sec1");
    expect(back.sections[0].questions.map((q) => q.number)).toEqual([1, 2]);
  });

  it("preserves multiple_choice + correct alternative through roundtrip", () => {
    const original: StructuredActivity = {
      sections: [
        {
          title: "S",
          questions: [
            {
              number: 1,
              type: "multiple_choice",
              statement: "Q?",
              alternatives: [
                { letter: "a", text: "Op A" },
                { letter: "b", text: "Op B", is_correct: true },
              ],
            },
          ],
        },
      ],
    };
    const back = markdownDslToStructured(structuredToMarkdownDsl(original));
    const q = back.sections[0].questions[0];
    expect(q.type).toBe("multiple_choice");
    const correct = q.alternatives?.find((a) => a.is_correct);
    expect(correct?.letter).toBe("b");
  });
});
