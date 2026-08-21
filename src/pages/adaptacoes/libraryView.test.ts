import { describe, it, expect } from "vitest";
import { filterRows, groupByFolder, UNFILED } from "./libraryView";

const row = (id: string, over: Partial<Parameters<typeof filterRows>[0][number]> = {}) => ({
  id,
  folder_id: null,
  subject: null,
  activity_type: null,
  ...over,
});

const FOLDERS = [
  { id: "f1", name: "6º ano B" },
  { id: "f2", name: "Recuperação" },
];

describe("filterRows", () => {
  const rows = [
    row("a", { subject: "Geografia", activity_type: "prova" }),
    row("b", { subject: "Geografia", activity_type: "exercício" }),
    row("c", { subject: "Física", activity_type: "prova" }),
    row("d"),
  ];

  it("keeps everything when no filter is set", () => {
    expect(filterRows(rows, { subject: null, activityType: null })).toHaveLength(4);
  });

  it("filters by matéria", () => {
    const out = filterRows(rows, { subject: "Geografia", activityType: null });
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("filters by tipo", () => {
    const out = filterRows(rows, { subject: null, activityType: "prova" });
    expect(out.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("combines both filters", () => {
    const out = filterRows(rows, { subject: "Geografia", activityType: "prova" });
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });

  it("excludes unclassified rows when a filter is on", () => {
    const out = filterRows(rows, { subject: "Geografia", activityType: null });
    expect(out.map((r) => r.id)).not.toContain("d");
  });
});

describe("groupByFolder", () => {
  it("puts each adaptation under its folder", () => {
    const out = groupByFolder(
      [row("a", { folder_id: "f1" }), row("b", { folder_id: "f2" })],
      FOLDERS,
    );
    expect(out.map((g) => g.name)).toEqual(["6º ano B", "Recuperação"]);
    expect(out[0].rows.map((r) => r.id)).toEqual(["a"]);
  });

  // The reason folders are rows and not a text column: a folder just created
  // has to be visible before anything is in it, or there is nowhere to move
  // the first adaptation to.
  it("keeps a folder that is still empty", () => {
    const out = groupByFolder([row("a", { folder_id: "f1" })], FOLDERS);
    const empty = out.find((g) => g.name === "Recuperação");
    expect(empty).toBeDefined();
    expect(empty!.rows).toEqual([]);
  });

  it("keeps several adaptations together in the same folder", () => {
    const out = groupByFolder(
      [row("a", { folder_id: "f1" }), row("b", { folder_id: "f1" })],
      FOLDERS,
    );
    expect(out[0].rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("collects unfiled adaptations last", () => {
    const out = groupByFolder([row("a", { folder_id: "f1" }), row("b")], FOLDERS);
    expect(out[out.length - 1].name).toBe(UNFILED);
    expect(out[out.length - 1].rows.map((r) => r.id)).toEqual(["b"]);
  });

  it("omits 'Sem pasta' entirely when everything is filed", () => {
    const out = groupByFolder([row("a", { folder_id: "f1" })], FOLDERS);
    expect(out.some((g) => g.name === UNFILED)).toBe(false);
  });

  // Deleting a folder in another tab leaves rows pointing at an id the list no
  // longer has. Dropping them would make paid work vanish from the library.
  it("rescues rows pointing at a folder that no longer exists", () => {
    const out = groupByFolder([row("a", { folder_id: "sumiu" })], FOLDERS);
    const unfiled = out.find((g) => g.name === UNFILED);
    expect(unfiled!.rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("returns just the folders when there is nothing at all", () => {
    const out = groupByFolder([], FOLDERS);
    expect(out).toHaveLength(2);
    expect(out.every((g) => g.rows.length === 0)).toBe(true);
  });

  it("handles a library with no folders yet", () => {
    const out = groupByFolder([row("a")], []);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe(UNFILED);
  });
});
