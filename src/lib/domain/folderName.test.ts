import { describe, it, expect } from "vitest";
import { findFolderByName, duplicateFolderMessage, isDuplicateFolderError } from "./folderName";

const FOLDERS = [
  { id: "f1", name: "Turma A" },
  { id: "f2", name: "6º ano B" },
];

describe("findFolderByName", () => {
  // Mirrors the unique index: (user_id, lower(btrim(name))).
  it("matches ignoring case and surrounding spaces, like the database does", () => {
    expect(findFolderByName(FOLDERS, "turma a")?.id).toBe("f1");
    expect(findFolderByName(FOLDERS, "  TURMA A  ")?.id).toBe("f1");
    expect(findFolderByName(FOLDERS, "6º ANO b")?.id).toBe("f2");
  });

  it("returns undefined for a name nobody has", () => {
    expect(findFolderByName(FOLDERS, "Turma B")).toBeUndefined();
  });
});

describe("duplicateFolderMessage", () => {
  it("states the collision instead of asking", () => {
    const msg = duplicateFolderMessage("Turma A");
    expect(msg).toBe("Já existe a pasta “Turma A”.");
    expect(msg).not.toContain("?");
  });
});

describe("isDuplicateFolderError", () => {
  it("recognizes the unique-violation code", () => {
    expect(isDuplicateFolderError(Object.assign(new Error("dup"), { code: "23505" }))).toBe(true);
  });

  it("does not treat other failures as duplicates", () => {
    expect(isDuplicateFolderError(Object.assign(new Error("rls"), { code: "42501" }))).toBe(false);
    expect(isDuplicateFolderError(new Error("boom"))).toBe(false);
    expect(isDuplicateFolderError(null)).toBe(false);
    expect(isDuplicateFolderError("23505")).toBe(false);
  });
});
