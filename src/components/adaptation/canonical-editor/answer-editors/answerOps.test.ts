import { describe, it, expect } from "vitest";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import {
  setCorrectAlternative,
  addAlternative,
  removeAlternative,
  setAlternativeText,
  setTrueFalseValue,
  setTrueFalseText,
  toggleCheckbox,
  setCheckboxText,
  setMatchingSide,
  addMatchingPair,
  removeMatchingPair,
  setOrderingText,
  reorderOrdering,
  setGapAnswer,
  addGap,
  removeGap,
  setAnswerLines,
  setTableCell,
} from "./answerOps";

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

describe("setAlternativeText", () => {
  it("replaces an alternative's content with a plain text run", () => {
    const next = setAlternativeText(mc, mc.alternatives[0].id, "new");
    expect(next.alternatives[0].content).toEqual([{ type: "text", text: "new" }]);
  });

  it("clears content to empty array when text is empty", () => {
    const next = setAlternativeText(mc, mc.alternatives[0].id, "");
    expect(next.alternatives[0].content).toEqual([]);
  });

  it("leaves other alternatives untouched", () => {
    const next = setAlternativeText(mc, mc.alternatives[0].id, "new");
    expect(next.alternatives[1].content).toEqual(mc.alternatives[1].content);
  });

  it("returns unchanged for non-multipleChoice", () => {
    expect(setAlternativeText(tf, "x", "n")).toBe(tf);
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

describe("setTrueFalseText", () => {
  it("replaces the item content", () => {
    const next = setTrueFalseText(tf, tf.items[0].id, "z");
    expect(next.items[0].content).toEqual([{ type: "text", text: "z" }]);
  });

  it("returns unchanged for non-trueFalse", () => {
    expect(setTrueFalseText(mc, "x", "z")).toBe(mc);
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

describe("setCheckboxText", () => {
  it("replaces the item content", () => {
    const next = setCheckboxText(cb, cb.items[1].id, "z");
    expect(next.items[1].content).toEqual([{ type: "text", text: "z" }]);
  });

  it("returns unchanged for non-checkbox", () => {
    expect(setCheckboxText(mc, "x", "z")).toBe(mc);
  });
});

// matching ------------------------------------------------------------------

describe("setMatchingSide", () => {
  it("updates the left side", () => {
    const next = setMatchingSide(matching, matching.pairs[0].id, "left", "L");
    expect(next.pairs[0].left).toEqual([{ type: "text", text: "L" }]);
    expect(next.pairs[0].right).toEqual(matching.pairs[0].right);
  });

  it("updates the right side", () => {
    const next = setMatchingSide(matching, matching.pairs[1].id, "right", "R");
    expect(next.pairs[1].right).toEqual([{ type: "text", text: "R" }]);
  });

  it("returns unchanged for non-matching", () => {
    expect(setMatchingSide(mc, "x", "left", "L")).toBe(mc);
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

describe("setOrderingText", () => {
  it("replaces the item content", () => {
    const next = setOrderingText(ordering, ordering.items[0].id, "z");
    expect(next.items[0].content).toEqual([{ type: "text", text: "z" }]);
  });

  it("returns unchanged for non-ordering", () => {
    expect(setOrderingText(mc, "x", "z")).toBe(mc);
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
    const next = setTableCell(table, 0, 1, "z");
    expect(next.rows[0][1]).toEqual([{ type: "text", text: "z" }]);
    expect(next.rows[0][0]).toEqual(table.rows[0][0]);
    expect(next.rows[1]).toEqual(table.rows[1]);
  });

  it("returns unchanged when row/col out of range", () => {
    expect(setTableCell(table, 9, 0, "z")).toBe(table);
    expect(setTableCell(table, 0, 9, "z")).toBe(table);
  });

  it("returns unchanged for non-table", () => {
    expect(setTableCell(mc, 0, 0, "z")).toBe(mc);
  });
});
