import { describe, it, expect } from "vitest";
import { sizeGapBlanks, blankFor } from "./gapWidthGuard";
import type { AdaptationResult, Block, RichText } from "../../../src/lib/adaptation/canonical/schema";

const t = (text: string): RichText => [{ type: "text", text }];

function result(blocks: Block[]): AdaptationResult {
  return {
    schemaVersion: 1,
    document: { schemaVersion: 1, blocks },
    strategies_applied: [],
    pedagogical_justification: "",
    implementation_tips: [],
  };
}

function fillBlank(stem: Block[], answers: string[]): Block {
  return {
    id: "q1",
    type: "question",
    stem,
    answer: {
      kind: "fillBlank",
      gaps: answers.map((answer, i) => ({ id: `g${i}`, answer })),
    },
  };
}

const para = (id: string, text: string): Block => ({ id, type: "paragraph", content: t(text) });

function stemText(out: AdaptationResult, block = 0, line = 0): string {
  const q = out.document.blocks[block] as Extract<Block, { type: "question" }>;
  const p = q.stem[line] as Extract<Block, { type: "paragraph" }>;
  return p.content.map((n) => (n.type === "text" ? n.text : "")).join("");
}

describe("blankFor", () => {
  it("grows the blank with the expected answer", () => {
    expect(blankFor("condensacao").length).toBeGreaterThan(blankFor("chuva").length);
  });

  it("keeps a generous floor for very short answers", () => {
    expect(blankFor("eu").length).toBe(6);
  });

  it("caps runaway answers", () => {
    expect(blankFor("a".repeat(200)).length).toBe(40);
  });

  it("builds the blank out of underscores only", () => {
    expect(blankFor("chuva")).toMatch(/^_+$/);
  });
});

describe("sizeGapBlanks", () => {
  it("sizes each blank by the answer it has to hold", () => {
    const out = sizeGapBlanks(
      result([
        fillBlank([para("p", "A agua vira gas pela ___ e volta pela ___ .")], [
          "evaporacao",
          "condensacao",
        ]),
      ]),
    );
    expect(stemText(out)).toBe(
      `A agua vira gas pela ${blankFor("evaporacao")} e volta pela ${blankFor("condensacao")} .`,
    );
  });

  it("walks blanks across several stem paragraphs and text nodes", () => {
    const out = sizeGapBlanks(
      result([
        fillBlank(
          [
            {
              id: "p1",
              type: "paragraph",
              content: [
                { type: "text", text: "Um ___ e " },
                { type: "text", text: "dois ___ ", marks: ["bold"] },
              ],
            },
            para("p2", "tres ___"),
          ],
          ["chuva", "condensacao", "evaporacao"],
        ),
      ]),
    );
    expect(stemText(out, 0, 0)).toBe(`Um ${blankFor("chuva")} e dois ${blankFor("condensacao")} `);
    expect(stemText(out, 0, 1)).toBe(`tres ${blankFor("evaporacao")}`);
  });

  it("leaves the stem untouched when blanks and gaps do not line up", () => {
    const out = sizeGapBlanks(
      result([fillBlank([para("p", "Só uma ___ aqui.")], ["chuva", "neve"])]),
    );
    expect(stemText(out)).toBe("Só uma ___ aqui.");
  });

  it("leaves a gap with an empty answer at its original width", () => {
    const out = sizeGapBlanks(result([fillBlank([para("p", "a ___ b ___")], ["", "chuva"])]));
    expect(stemText(out)).toBe(`a ___ b ${blankFor("chuva")}`);
  });

  it("ignores single underscores inside words", () => {
    const out = sizeGapBlanks(result([fillBlank([para("p", "x_1 vale ___")], ["dois"])]));
    expect(stemText(out)).toBe(`x_1 vale ${blankFor("dois")}`);
  });

  it("preserves inlineMath nodes and marks", () => {
    const out = sizeGapBlanks(
      result([
        fillBlank(
          [
            {
              id: "p",
              type: "paragraph",
              content: [
                { type: "text", text: "vale ___", marks: ["bold"] },
                { type: "inlineMath", latex: "x^2" },
              ],
            },
          ],
          ["dois"],
        ),
      ]),
    );
    const q = out.document.blocks[0] as Extract<Block, { type: "question" }>;
    const p = q.stem[0] as Extract<Block, { type: "paragraph" }>;
    expect(p.content[0]).toEqual({ type: "text", text: `vale ${blankFor("dois")}`, marks: ["bold"] });
    expect(p.content[1]).toEqual({ type: "inlineMath", latex: "x^2" });
  });

  it("sizes blanks inside a nested question stem", () => {
    const inner = fillBlank([para("p", "cai como ___")], ["chuva"]);
    const out = sizeGapBlanks(
      result([
        {
          id: "outer",
          type: "question",
          stem: [inner],
          answer: { kind: "open", answerLines: 3 },
        },
      ]),
    );
    const outer = out.document.blocks[0] as Extract<Block, { type: "question" }>;
    const nested = outer.stem[0] as Extract<Block, { type: "question" }>;
    const p = nested.stem[0] as Extract<Block, { type: "paragraph" }>;
    expect(p.content.map((n) => (n.type === "text" ? n.text : "")).join("")).toBe(
      `cai como ${blankFor("chuva")}`,
    );
  });

  it("leaves questions of other kinds and plain blocks alone", () => {
    const out = sizeGapBlanks(
      result([
        { id: "p", type: "paragraph", content: t("texto ___ solto") },
        {
          id: "q",
          type: "question",
          stem: [para("s", "Escreva ___ aqui")],
          answer: { kind: "open", answerLines: 3 },
        },
        { id: "d", type: "divider" },
      ]),
    );
    const p0 = out.document.blocks[0] as Extract<Block, { type: "paragraph" }>;
    expect(p0.content).toEqual(t("texto ___ solto"));
    expect(stemText(out, 1)).toBe("Escreva ___ aqui");
    expect(out.document.blocks[2]).toEqual({ id: "d", type: "divider" });
  });

  it("counts blanks across stem lines that have none", () => {
    const out = sizeGapBlanks(
      result([
        fillBlank([para("p1", "Complete a frase abaixo."), para("p2", "cai como ___")], ["chuva"]),
      ]),
    );
    expect(stemText(out, 0, 0)).toBe("Complete a frase abaixo.");
    expect(stemText(out, 0, 1)).toBe(`cai como ${blankFor("chuva")}`);
  });

  it("keeps a divider inside the stem untouched", () => {
    const out = sizeGapBlanks(
      result([
        fillBlank([{ id: "d", type: "divider" }, para("p", "cai como ___")], ["chuva"]),
      ]),
    );
    const q = out.document.blocks[0] as Extract<Block, { type: "question" }>;
    expect(q.stem[0]).toEqual({ id: "d", type: "divider" });
    expect(stemText(out, 0, 1)).toBe(`cai como ${blankFor("chuva")}`);
  });

  it("does not count the blanks of a question nested in the stem", () => {
    const out = sizeGapBlanks(
      result([
        fillBlank(
          [
            para("p", "cai como ___"),
            {
              id: "sub",
              type: "question",
              stem: [para("sp", "e escreva ___ aqui")],
              answer: { kind: "open", answerLines: 3 },
            },
          ],
          ["chuva"],
        ),
      ]),
    );
    expect(stemText(out, 0, 0)).toBe(`cai como ${blankFor("chuva")}`);
    const q = out.document.blocks[0] as Extract<Block, { type: "question" }>;
    const sub = q.stem[1] as Extract<Block, { type: "question" }>;
    const sp = sub.stem[0] as Extract<Block, { type: "paragraph" }>;
    expect(sp.content).toEqual(t("e escreva ___ aqui"));
  });

  it("is idempotent", () => {
    const once = sizeGapBlanks(
      result([fillBlank([para("p", "vira ___ e volta")], ["condensacao"])]),
    );
    expect(sizeGapBlanks(once)).toEqual(once);
  });

  it("keeps a fillBlank question whose stem has no blanks and no gaps untouched", () => {
    const out = sizeGapBlanks(result([fillBlank([para("p", "sem lacuna")], [])]));
    expect(stemText(out)).toBe("sem lacuna");
  });
});
