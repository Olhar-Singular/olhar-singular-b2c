import { describe, it, expect } from "vitest";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { QuestionAnswerSchema } from "@/lib/adaptation/canonical/schema";
import {
  setCorrectAlternative,
  addAlternative,
  removeAlternative,
  setAlternativeContent,
  setTrueFalseValue,
  setTrueFalseContent,
  toggleCheckbox,
  setCheckboxContent,
  setMatchingSide,
  addMatchingPair,
  removeMatchingPair,
  setOrderingContent,
  reorderOrdering,
  setGapAnswer,
  addGap,
  removeGap,
  setAnswerLines,
  setTableCell,
  changeAnswerKind,
} from "./answerOps";

const rt = (text: string): RichText => [{ type: "text", text }];

// Helpers -------------------------------------------------------------------

function text(t: string) {
  return [{ type: "text" as const, text: t }];
}

const mc: Extract<QuestionAnswer, { kind: "multipleChoice" }> = {
  kind: "multipleChoice",
  alternatives: [
    { id: "11111111-1111-4111-8111-111111111111", content: text("a"), correct: true },
    { id: "22222222-2222-4222-8222-222222222222", content: text("b"), correct: false },
  ],
};

const tf: Extract<QuestionAnswer, { kind: "trueFalse" }> = {
  kind: "trueFalse",
  items: [
    { id: "33333333-3333-4333-8333-333333333333", content: text("x"), value: true },
    { id: "44444444-4444-4444-8444-444444444444", content: text("y"), value: false },
  ],
};

const cb: Extract<QuestionAnswer, { kind: "checkbox" }> = {
  kind: "checkbox",
  items: [
    { id: "55555555-5555-4555-8555-555555555555", content: text("c1"), checked: false },
    { id: "66666666-6666-4666-8666-666666666666", content: text("c2"), checked: true },
  ],
};

const matching: Extract<QuestionAnswer, { kind: "matching" }> = {
  kind: "matching",
  pairs: [
    { id: "77777777-7777-4777-8777-777777777777", left: text("l1"), right: text("r1") },
    { id: "88888888-8888-4888-8888-888888888888", left: text("l2"), right: text("r2") },
  ],
};

const ordering: Extract<QuestionAnswer, { kind: "ordering" }> = {
  kind: "ordering",
  items: [
    { id: "99999999-9999-4999-8999-999999999999", content: text("o1"), position: 0 },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", content: text("o2"), position: 1 },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", content: text("o3"), position: 2 },
  ],
};

const fillBlank: Extract<QuestionAnswer, { kind: "fillBlank" }> = {
  kind: "fillBlank",
  gaps: [
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", answer: "g1" },
    { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", answer: "g2" },
  ],
};

const open: Extract<QuestionAnswer, { kind: "open" }> = {
  kind: "open",
  answerLines: 3,
};

const table: Extract<QuestionAnswer, { kind: "table" }> = {
  kind: "table",
  rows: [
    [text("a1"), text("b1")],
    [text("a2"), text("b2")],
  ],
};

// multipleChoice ------------------------------------------------------------

describe("setCorrectAlternative", () => {
  it("sets exactly one correct and clears the rest", () => {
    const next = setCorrectAlternative(mc, mc.alternatives[1].id);
    expect(next.alternatives[0].correct).toBe(false);
    expect(next.alternatives[1].correct).toBe(true);
  });

  it("returns the answer unchanged for non-multipleChoice", () => {
    expect(setCorrectAlternative(tf, "x")).toBe(tf);
  });

  it("does not mutate the original answer", () => {
    setCorrectAlternative(mc, mc.alternatives[1].id);
    expect(mc.alternatives[0].correct).toBe(true);
  });
});

describe("addAlternative", () => {
  it("appends a new non-correct alternative with a fresh id", () => {
    const next = addAlternative(mc, () => "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    expect(next.alternatives).toHaveLength(3);
    expect(next.alternatives[2]).toMatchObject({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      correct: false,
    });
  });

  it("returns unchanged for non-multipleChoice", () => {
    expect(addAlternative(tf)).toBe(tf);
  });
});

describe("removeAlternative", () => {
  it("removes the targeted alternative", () => {
    const next = removeAlternative(mc, mc.alternatives[1].id);
    expect(next.alternatives).toHaveLength(1);
    expect(next.alternatives[0].id).toBe(mc.alternatives[0].id);
  });

  it("keeps at least one alternative (no-op when only one remains)", () => {
    const single: Extract<QuestionAnswer, { kind: "multipleChoice" }> = {
      kind: "multipleChoice",
      alternatives: [mc.alternatives[0]],
    };
    expect(removeAlternative(single, single.alternatives[0].id)).toBe(single);
  });

  it("re-marks the first alternative correct if the removed one was correct", () => {
    const next = removeAlternative(mc, mc.alternatives[0].id);
    expect(next.alternatives).toHaveLength(1);
    expect(next.alternatives[0].correct).toBe(true);
  });

  it("keeps existing correct flag when removed alternative was not correct", () => {
    const next = removeAlternative(mc, mc.alternatives[1].id);
    expect(next.alternatives[0].correct).toBe(true);
  });

  it("returns unchanged for non-multipleChoice", () => {
    expect(removeAlternative(tf, "x")).toBe(tf);
  });
});

describe("setAlternativeContent", () => {
  it("replaces an alternative's content with the given RichText", () => {
    const next = setAlternativeContent(mc, mc.alternatives[0].id, rt("new"));
    expect(next.alternatives[0].content).toEqual([{ type: "text", text: "new" }]);
  });

  it("preserves marks + inlineMath in the RichText (no flattening)", () => {
    const rich: RichText = [
      { type: "text", text: "x = ", marks: ["bold"] },
      { type: "inlineMath", latex: "x^2" },
    ];
    const next = setAlternativeContent(mc, mc.alternatives[0].id, rich);
    expect(next.alternatives[0].content).toBe(rich);
  });

  it("sets content to empty array when given an empty RichText", () => {
    const next = setAlternativeContent(mc, mc.alternatives[0].id, []);
    expect(next.alternatives[0].content).toEqual([]);
  });

  it("leaves other alternatives untouched", () => {
    const next = setAlternativeContent(mc, mc.alternatives[0].id, rt("new"));
    expect(next.alternatives[1].content).toEqual(mc.alternatives[1].content);
  });

  it("returns unchanged for non-multipleChoice", () => {
    expect(setAlternativeContent(tf, "x", rt("n"))).toBe(tf);
  });
});

describe("content setters take RichText directly (no flattening)", () => {
  it("preserves the exact RichText (marks/inlineMath) across every content setter", () => {
    const tfRich: Extract<QuestionAnswer, { kind: "trueFalse" }> = {
      kind: "trueFalse",
      items: [{ id: "33333333-3333-4333-8333-333333333333", content: text("p"), value: true }],
    };
    const tfContent: RichText = [{ type: "text", text: "p", marks: ["italic"] }];
    const tfNext = setTrueFalseContent(tfRich, tfRich.items[0].id, tfContent);
    if (tfNext.kind !== "trueFalse") throw new Error("unexpected");
    expect(tfNext.items[0].content).toBe(tfContent);

    const cbRich: Extract<QuestionAnswer, { kind: "checkbox" }> = {
      kind: "checkbox",
      items: [{ id: "44444444-4444-4444-8444-444444444444", content: text("q"), checked: false }],
    };
    const cbContent: RichText = [{ type: "text", text: "q", marks: ["bold"] }, { type: "inlineMath", latex: "y" }];
    const cbNext = setCheckboxContent(cbRich, cbRich.items[0].id, cbContent);
    if (cbNext.kind !== "checkbox") throw new Error("unexpected");
    expect(cbNext.items[0].content).toBe(cbContent);

    const matchRich: Extract<QuestionAnswer, { kind: "matching" }> = {
      kind: "matching",
      pairs: [{ id: "55555555-5555-4555-8555-555555555555", left: text("L"), right: text("R") }],
    };
    const leftContent: RichText = [{ type: "text", text: "L", marks: ["bold"] }];
    const matchNext = setMatchingSide(matchRich, matchRich.pairs[0].id, "left", leftContent);
    if (matchNext.kind !== "matching") throw new Error("unexpected");
    expect(matchNext.pairs[0].left).toBe(leftContent);
    expect(matchNext.pairs[0].right).toEqual(matchRich.pairs[0].right);

    const ordRich: Extract<QuestionAnswer, { kind: "ordering" }> = {
      kind: "ordering",
      items: [{ id: "66666666-6666-4666-8666-666666666666", content: text("o"), position: 0 }],
    };
    const ordContent: RichText = [{ type: "text", text: "o", color: "#DC2626" }];
    const ordNext = setOrderingContent(ordRich, ordRich.items[0].id, ordContent);
    if (ordNext.kind !== "ordering") throw new Error("unexpected");
    expect(ordNext.items[0].content).toBe(ordContent);

    const tableRich: Extract<QuestionAnswer, { kind: "table" }> = {
      kind: "table",
      rows: [[text("c"), text("d")]],
    };
    const cellContent: RichText = [{ type: "text", text: "c", marks: ["strike"] }];
    const tableNext = setTableCell(tableRich, 0, 0, cellContent);
    if (tableNext.kind !== "table") throw new Error("unexpected");
    expect(tableNext.rows[0][0]).toBe(cellContent);
    expect(tableNext.rows[0][1]).toEqual(tableRich.rows[0][1]);
  });
});

// trueFalse -----------------------------------------------------------------

describe("setTrueFalseValue", () => {
  it("sets the value on the matching item", () => {
    const next = setTrueFalseValue(tf, tf.items[1].id, true);
    expect(next.items[1].value).toBe(true);
    expect(next.items[0].value).toBe(true);
  });

  it("returns unchanged for non-trueFalse", () => {
    expect(setTrueFalseValue(mc, "x", true)).toBe(mc);
  });
});

describe("setTrueFalseContent", () => {
  it("replaces the item content", () => {
    const next = setTrueFalseContent(tf, tf.items[0].id, rt("z"));
    expect(next.items[0].content).toEqual([{ type: "text", text: "z" }]);
  });

  it("returns unchanged for non-trueFalse", () => {
    expect(setTrueFalseContent(mc, "x", rt("z"))).toBe(mc);
  });
});

// checkbox ------------------------------------------------------------------

describe("toggleCheckbox", () => {
  it("flips the checked flag on the matching item", () => {
    const next = toggleCheckbox(cb, cb.items[0].id);
    expect(next.items[0].checked).toBe(true);
    expect(next.items[1].checked).toBe(true);
  });

  it("returns unchanged for non-checkbox", () => {
    expect(toggleCheckbox(mc, "x")).toBe(mc);
  });
});

describe("setCheckboxContent", () => {
  it("replaces the item content", () => {
    const next = setCheckboxContent(cb, cb.items[1].id, rt("z"));
    expect(next.items[1].content).toEqual([{ type: "text", text: "z" }]);
  });

  it("returns unchanged for non-checkbox", () => {
    expect(setCheckboxContent(mc, "x", rt("z"))).toBe(mc);
  });
});

// matching ------------------------------------------------------------------

describe("setMatchingSide", () => {
  it("updates the left side", () => {
    const next = setMatchingSide(matching, matching.pairs[0].id, "left", rt("L"));
    expect(next.pairs[0].left).toEqual([{ type: "text", text: "L" }]);
    expect(next.pairs[0].right).toEqual(matching.pairs[0].right);
  });

  it("updates the right side", () => {
    const next = setMatchingSide(matching, matching.pairs[1].id, "right", rt("R"));
    expect(next.pairs[1].right).toEqual([{ type: "text", text: "R" }]);
  });

  it("returns unchanged for non-matching", () => {
    expect(setMatchingSide(mc, "x", "left", rt("L"))).toBe(mc);
  });
});

describe("addMatchingPair", () => {
  it("appends an empty pair with a fresh id", () => {
    const next = addMatchingPair(matching, () => "ffffffff-ffff-4fff-8fff-ffffffffffff");
    expect(next.pairs).toHaveLength(3);
    expect(next.pairs[2]).toMatchObject({ id: "ffffffff-ffff-4fff-8fff-ffffffffffff", left: [], right: [] });
  });

  it("returns unchanged for non-matching", () => {
    expect(addMatchingPair(mc)).toBe(mc);
  });
});

describe("removeMatchingPair", () => {
  it("removes the targeted pair", () => {
    const next = removeMatchingPair(matching, matching.pairs[0].id);
    expect(next.pairs).toHaveLength(1);
    expect(next.pairs[0].id).toBe(matching.pairs[1].id);
  });

  it("keeps at least one pair", () => {
    const single: Extract<QuestionAnswer, { kind: "matching" }> = {
      kind: "matching",
      pairs: [matching.pairs[0]],
    };
    expect(removeMatchingPair(single, single.pairs[0].id)).toBe(single);
  });

  it("returns unchanged for non-matching", () => {
    expect(removeMatchingPair(mc, "x")).toBe(mc);
  });
});

// ordering ------------------------------------------------------------------

describe("setOrderingContent", () => {
  it("replaces the item content", () => {
    const next = setOrderingContent(ordering, ordering.items[0].id, rt("z"));
    expect(next.items[0].content).toEqual([{ type: "text", text: "z" }]);
  });

  it("returns unchanged for non-ordering", () => {
    expect(setOrderingContent(mc, "x", rt("z"))).toBe(mc);
  });
});

describe("reorderOrdering", () => {
  it("moves an item up and renumbers positions", () => {
    const next = reorderOrdering(ordering, 2, 0);
    expect(next.items.map((i) => i.id)).toEqual([
      ordering.items[2].id,
      ordering.items[0].id,
      ordering.items[1].id,
    ]);
    expect(next.items.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  it("moves an item down", () => {
    const next = reorderOrdering(ordering, 0, 2);
    expect(next.items.map((i) => i.id)).toEqual([
      ordering.items[1].id,
      ordering.items[2].id,
      ordering.items[0].id,
    ]);
  });

  it("returns unchanged when index out of range", () => {
    expect(reorderOrdering(ordering, 5, 0)).toBe(ordering);
    expect(reorderOrdering(ordering, 0, 9)).toBe(ordering);
  });

  it("returns unchanged for non-ordering", () => {
    expect(reorderOrdering(mc, 0, 1)).toBe(mc);
  });
});

// fillBlank -----------------------------------------------------------------

describe("setGapAnswer", () => {
  it("updates a gap's answer string", () => {
    const next = setGapAnswer(fillBlank, fillBlank.gaps[0].id, "new");
    expect(next.gaps[0].answer).toBe("new");
    expect(next.gaps[1].answer).toBe("g2");
  });

  it("returns unchanged for non-fillBlank", () => {
    expect(setGapAnswer(mc, "x", "n")).toBe(mc);
  });
});

describe("addGap", () => {
  it("appends a gap with empty answer and fresh id", () => {
    const next = addGap(fillBlank, () => "eeeeeeee-1111-4eee-8eee-eeeeeeeeeeee");
    expect(next.gaps).toHaveLength(3);
    expect(next.gaps[2]).toMatchObject({ id: "eeeeeeee-1111-4eee-8eee-eeeeeeeeeeee", answer: "" });
  });

  it("returns unchanged for non-fillBlank", () => {
    expect(addGap(mc)).toBe(mc);
  });
});

describe("removeGap", () => {
  it("removes the targeted gap", () => {
    const next = removeGap(fillBlank, fillBlank.gaps[0].id);
    expect(next.gaps).toHaveLength(1);
    expect(next.gaps[0].id).toBe(fillBlank.gaps[1].id);
  });

  it("keeps at least one gap", () => {
    const single: Extract<QuestionAnswer, { kind: "fillBlank" }> = {
      kind: "fillBlank",
      gaps: [fillBlank.gaps[0]],
    };
    expect(removeGap(single, single.gaps[0].id)).toBe(single);
  });

  it("returns unchanged for non-fillBlank", () => {
    expect(removeGap(mc, "x")).toBe(mc);
  });
});

// open ----------------------------------------------------------------------

describe("setAnswerLines", () => {
  it("sets the number of answer lines", () => {
    const next = setAnswerLines(open, 5);
    expect(next.answerLines).toBe(5);
  });

  it("removes answerLines when set to undefined / zero", () => {
    const next = setAnswerLines(open, 0);
    expect(next.answerLines).toBeUndefined();
  });

  it("returns unchanged for non-open", () => {
    expect(setAnswerLines(mc, 2)).toBe(mc);
  });
});

// table ---------------------------------------------------------------------

describe("setTableCell", () => {
  it("updates a single cell content", () => {
    const next = setTableCell(table, 0, 1, rt("z"));
    expect(next.rows[0][1]).toEqual([{ type: "text", text: "z" }]);
    expect(next.rows[0][0]).toEqual(table.rows[0][0]);
    expect(next.rows[1]).toEqual(table.rows[1]);
  });

  it("returns unchanged when row/col out of range", () => {
    expect(setTableCell(table, 9, 0, rt("z"))).toBe(table);
    expect(setTableCell(table, 0, 9, rt("z"))).toBe(table);
  });

  it("returns unchanged for non-table", () => {
    expect(setTableCell(mc, 0, 0, rt("z"))).toBe(mc);
  });
});

// changeAnswerKind (Fase 3 — troca de tipo) ---------------------------------

// Sequential, schema-valid UUIDs so conversions that mint several ids stay
// deterministic AND pass QuestionAnswerSchema (which requires real UUIDs).
function seqGen() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

describe("changeAnswerKind", () => {
  it("returns the same answer (referential) when the target is the current kind", () => {
    expect(changeAnswerKind(mc, "multipleChoice")).toBe(mc);
  });

  // multipleChoice ↔ checkbox -----------------------------------------------
  describe("multipleChoice ↔ checkbox (carry)", () => {
    it("MC → checkbox keeps the texts and marks the correct one checked", () => {
      const next = changeAnswerKind(mc, "checkbox", seqGen());
      if (next.kind !== "checkbox") throw new Error("unexpected");
      expect(next.items.map((i) => i.content)).toEqual([text("a"), text("b")]);
      expect(next.items.map((i) => i.checked)).toEqual([true, false]);
      expect(QuestionAnswerSchema.safeParse(next).success).toBe(true);
    });

    it("checkbox → MC keeps the texts and the first checked becomes the only correct", () => {
      const next = changeAnswerKind(cb, "multipleChoice", seqGen());
      if (next.kind !== "multipleChoice") throw new Error("unexpected");
      expect(next.alternatives.map((a) => a.content)).toEqual([text("c1"), text("c2")]);
      expect(next.alternatives.map((a) => a.correct)).toEqual([false, true]);
      expect(QuestionAnswerSchema.safeParse(next).success).toBe(true);
    });

    it("checkbox → MC with none checked marks the first alternative correct", () => {
      const cbNone: Extract<QuestionAnswer, { kind: "checkbox" }> = {
        kind: "checkbox",
        items: [
          { id: "55555555-5555-4555-8555-555555555555", content: text("c1"), checked: false },
          { id: "66666666-6666-4666-8666-666666666666", content: text("c2"), checked: false },
        ],
      };
      const next = changeAnswerKind(cbNone, "multipleChoice", seqGen());
      if (next.kind !== "multipleChoice") throw new Error("unexpected");
      expect(next.alternatives.map((a) => a.correct)).toEqual([true, false]);
      expect(QuestionAnswerSchema.safeParse(next).success).toBe(true);
    });
  });

  // multipleChoice / checkbox → trueFalse -----------------------------------
  describe("multipleChoice / checkbox → trueFalse (carry)", () => {
    it("MC → trueFalse turns alternatives into statements; the correct one becomes value true", () => {
      const next = changeAnswerKind(mc, "trueFalse", seqGen());
      if (next.kind !== "trueFalse") throw new Error("unexpected");
      expect(next.items.map((i) => i.content)).toEqual([text("a"), text("b")]);
      expect(next.items.map((i) => i.value)).toEqual([true, false]);
    });

    it("checkbox → trueFalse maps checked onto value", () => {
      const next = changeAnswerKind(cb, "trueFalse", seqGen());
      if (next.kind !== "trueFalse") throw new Error("unexpected");
      expect(next.items.map((i) => i.value)).toEqual([false, true]);
    });
  });

  // multipleChoice / checkbox → ordering ------------------------------------
  describe("multipleChoice / checkbox → ordering (carry)", () => {
    it("MC → ordering keeps the texts in the current order, numbered by position", () => {
      const next = changeAnswerKind(mc, "ordering", seqGen());
      if (next.kind !== "ordering") throw new Error("unexpected");
      expect(next.items.map((i) => i.content)).toEqual([text("a"), text("b")]);
      expect(next.items.map((i) => i.position)).toEqual([0, 1]);
    });

    it("checkbox → ordering keeps the texts in the current order", () => {
      const next = changeAnswerKind(cb, "ordering", seqGen());
      if (next.kind !== "ordering") throw new Error("unexpected");
      expect(next.items.map((i) => i.content)).toEqual([text("c1"), text("c2")]);
      expect(next.items.map((i) => i.position)).toEqual([0, 1]);
    });
  });

  // strict matrix: non-listed sources → list targets use the empty default ---
  describe("non-carry source → list target falls back to the empty default (strict matrix)", () => {
    it("trueFalse → MC drops the items and yields the empty MC default", () => {
      const next = changeAnswerKind(tf, "multipleChoice", seqGen());
      if (next.kind !== "multipleChoice") throw new Error("unexpected");
      expect(next.alternatives).toHaveLength(2);
      expect(next.alternatives.every((a) => a.content.length === 0)).toBe(true);
      expect(next.alternatives.map((a) => a.correct)).toEqual([true, false]);
      expect(QuestionAnswerSchema.safeParse(next).success).toBe(true);
    });

    it("ordering → checkbox yields one empty unchecked item", () => {
      const next = changeAnswerKind(ordering, "checkbox", seqGen());
      if (next.kind !== "checkbox") throw new Error("unexpected");
      expect(next.items).toHaveLength(1);
      expect(next.items[0]).toMatchObject({ content: [], checked: false });
    });

    it("open → trueFalse yields one empty item with value true", () => {
      const next = changeAnswerKind(open, "trueFalse", seqGen());
      if (next.kind !== "trueFalse") throw new Error("unexpected");
      expect(next.items).toHaveLength(1);
      expect(next.items[0]).toMatchObject({ content: [], value: true });
    });

    it("matching → ordering yields one empty item", () => {
      const next = changeAnswerKind(matching, "ordering", seqGen());
      if (next.kind !== "ordering") throw new Error("unexpected");
      expect(next.items).toHaveLength(1);
      expect(next.items[0]).toMatchObject({ content: [], position: 0 });
    });

    it("an empty checkbox → MC also falls back to the empty default", () => {
      const cbEmpty: Extract<QuestionAnswer, { kind: "checkbox" }> = { kind: "checkbox", items: [] };
      const next = changeAnswerKind(cbEmpty, "multipleChoice", seqGen());
      if (next.kind !== "multipleChoice") throw new Error("unexpected");
      expect(next.alternatives).toHaveLength(2);
      expect(QuestionAnswerSchema.safeParse(next).success).toBe(true);
    });
  });

  // any → non-list targets (structure ignores the source) -------------------
  describe("any → non-list target (the structure ignores the source)", () => {
    it("→ open yields three answer lines", () => {
      expect(changeAnswerKind(mc, "open")).toEqual({ kind: "open", answerLines: 3 });
    });

    it("→ fillBlank yields empty gaps (matrix literal; the teacher adds them)", () => {
      expect(changeAnswerKind(mc, "fillBlank")).toEqual({ kind: "fillBlank", gaps: [] });
    });

    it("→ matching yields one empty pair", () => {
      const next = changeAnswerKind(mc, "matching", seqGen());
      if (next.kind !== "matching") throw new Error("unexpected");
      expect(next.pairs).toHaveLength(1);
      expect(next.pairs[0]).toMatchObject({ left: [], right: [] });
    });

    it("→ table yields one row with two empty cells", () => {
      expect(changeAnswerKind(mc, "table")).toEqual({ kind: "table", rows: [[[], []]] });
    });
  });

  // invariants --------------------------------------------------------------
  it("does not mutate the original answer", () => {
    const snapshot = JSON.parse(JSON.stringify(mc));
    changeAnswerKind(mc, "checkbox", seqGen());
    expect(mc).toEqual(snapshot);
  });

  it("uses the injected id generator for the new items", () => {
    const next = changeAnswerKind(mc, "checkbox", () => "abababab-abab-4bab-8bab-abababababab");
    if (next.kind !== "checkbox") throw new Error("unexpected");
    expect(next.items.every((i) => i.id === "abababab-abab-4bab-8bab-abababababab")).toBe(true);
  });

  // acceptance chain (plano §8 Fase 3) --------------------------------------
  it("survives the chain MC → checkbox → trueFalse → open → MC, staying schema-valid", () => {
    const g = seqGen();
    const a1 = changeAnswerKind(mc, "checkbox", g);
    expect(a1.kind).toBe("checkbox");
    const a2 = changeAnswerKind(a1, "trueFalse", g);
    expect(a2.kind).toBe("trueFalse");
    const a3 = changeAnswerKind(a2, "open", g);
    expect(a3).toEqual({ kind: "open", answerLines: 3 });
    const a4 = changeAnswerKind(a3, "multipleChoice", g);
    expect(a4.kind).toBe("multipleChoice");
    expect(QuestionAnswerSchema.safeParse(a4).success).toBe(true);
  });
});
