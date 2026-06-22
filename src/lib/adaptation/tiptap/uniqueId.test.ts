import { describe, it, expect } from "vitest";
import {
  assignMissingIds,
  collectNodes,
  applyUniqueIds,
  ID_BEARING_TYPES,
  type PositionedNode,
  type DescendableDoc,
} from "./uniqueId";
import { isId } from "@/lib/adaptation/canonical/ids";

const VALID = "00000000-0000-4000-8000-000000000001";
const VALID2 = "00000000-0000-4000-8000-000000000002";

describe("assignMissingIds", () => {
  it("assigns a fresh valid id to a block missing one", () => {
    const nodes: PositionedNode[] = [{ pos: 0, type: "paragraph", id: null }];
    const out = assignMissingIds(nodes);
    expect(out).toHaveLength(1);
    expect(out[0].pos).toBe(0);
    expect(isId(out[0].id)).toBe(true);
  });

  it("preserves an existing valid, unique id (no assignment)", () => {
    const nodes: PositionedNode[] = [{ pos: 0, type: "heading", id: VALID }];
    expect(assignMissingIds(nodes)).toEqual([]);
  });

  it("replaces an invalid id", () => {
    const nodes: PositionedNode[] = [{ pos: 3, type: "image", id: "not-a-uuid" }];
    const out = assignMissingIds(nodes);
    expect(out).toHaveLength(1);
    expect(isId(out[0].id)).toBe(true);
  });

  it("replaces a duplicate id with a fresh unique one", () => {
    const nodes: PositionedNode[] = [
      { pos: 0, type: "paragraph", id: VALID },
      { pos: 5, type: "paragraph", id: VALID },
    ];
    const out = assignMissingIds(nodes);
    // First kept, second reassigned.
    expect(out).toHaveLength(1);
    expect(out[0].pos).toBe(5);
    expect(out[0].id).not.toBe(VALID);
    expect(isId(out[0].id)).toBe(true);
  });

  it("produces unique ids across multiple missing nodes", () => {
    const nodes: PositionedNode[] = [
      { pos: 0, type: "paragraph", id: null },
      { pos: 2, type: "paragraph", id: null },
      { pos: 4, type: "paragraph", id: null },
    ];
    const out = assignMissingIds(nodes);
    const ids = out.map((a) => a.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("ignores non-id-bearing node types", () => {
    const nodes: PositionedNode[] = [{ pos: 0, type: "text", id: null }];
    expect(assignMissingIds(nodes)).toEqual([]);
  });

  it("accepts an injected generator for determinism", () => {
    let n = 0;
    const gen = () =>
      `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    const nodes: PositionedNode[] = [
      { pos: 0, type: "paragraph", id: null },
      { pos: 1, type: "paragraph", id: null },
    ];
    const out = assignMissingIds(nodes, gen);
    expect(out.map((a) => a.id)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
  });
});

/** Build a fake ProseMirror doc that supports `descendants`. */
function fakeDoc(
  entries: { type: string; id: unknown; pos: number }[]
): DescendableDoc {
  return {
    descendants(cb) {
      for (const e of entries) {
        cb({ type: { name: e.type }, attrs: { id: e.id } }, e.pos);
      }
    },
  };
}

describe("collectNodes", () => {
  it("collects only id-bearing nodes in document order", () => {
    const doc = fakeDoc([
      { type: "paragraph", id: VALID, pos: 0 },
      { type: "text", id: null, pos: 1 },
      { type: "question", id: null, pos: 2 },
    ]);
    expect(collectNodes(doc)).toEqual([
      { pos: 0, type: "paragraph", id: VALID },
      { pos: 2, type: "question", id: null },
    ]);
  });
});

describe("applyUniqueIds", () => {
  it("returns null and mutates nothing when all ids are present", () => {
    const doc = fakeDoc([{ type: "paragraph", id: VALID, pos: 0 }]);
    const calls: [number, string, unknown][] = [];
    const tr = {
      setNodeAttribute: (pos: number, name: string, value: unknown) =>
        calls.push([pos, name, value]),
    };
    expect(applyUniqueIds(doc, tr)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("sets fresh ids on the transaction for missing nodes", () => {
    const doc = fakeDoc([
      { type: "paragraph", id: null, pos: 0 },
      { type: "heading", id: VALID2, pos: 1 },
      { type: "image", id: "bad", pos: 2 },
    ]);
    const calls: [number, string, unknown][] = [];
    const tr = {
      setNodeAttribute: (pos: number, name: string, value: unknown) =>
        calls.push([pos, name, value]),
    };
    const result = applyUniqueIds(doc, tr);
    expect(result).toBe(tr);
    // pos 0 (missing) and pos 2 (invalid) get ids; pos 1 (valid) does not.
    expect(calls.map((c) => c[0])).toEqual([0, 2]);
    expect(calls.every((c) => c[1] === "id" && isId(c[2] as string))).toBe(true);
  });
});

describe("ID_BEARING_TYPES", () => {
  it("covers every canonical block kind", () => {
    expect([...ID_BEARING_TYPES].sort()).toEqual(
      [
        "blockMath",
        "divider",
        "heading",
        "image",
        "paragraph",
        "question",
        "scaffolding",
      ].sort()
    );
  });
});
