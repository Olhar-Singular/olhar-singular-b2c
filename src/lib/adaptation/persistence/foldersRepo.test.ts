import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveAdaptationToFolder,
} from "./foldersRepo";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

const folder = {
  id: "f1",
  user_id: "u1",
  name: "6º ano B",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function buildChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(result),
    order: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

beforeEach(() => vi.clearAllMocks());

describe("listFolders", () => {
  it("returns the folders alphabetically", async () => {
    const chain = buildChain({ data: [folder], error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    await expect(listFolders()).resolves.toEqual([folder]);
    expect(chain.order).toHaveBeenCalledWith("name", { ascending: true });
  });

  it("treats a missing payload as an empty library", async () => {
    const chain = buildChain({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    await expect(listFolders()).resolves.toEqual([]);
  });

  it("throws when the read fails", async () => {
    const chain = buildChain({ data: null, error: new Error("boom") });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    await expect(listFolders()).rejects.toBeInstanceOf(Error);
  });
});

describe("createFolder", () => {
  it("stores the name trimmed", async () => {
    // The unique index keys on lower(btrim(name)), so an untrimmed name would
    // be rejected as a duplicate of the trimmed one rather than created.
    const chain = buildChain({ data: folder, error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    await createFolder("u1", "  6º ano B  ");
    expect(chain.insert).toHaveBeenCalledWith({ user_id: "u1", name: "6º ano B" });
  });

  it("throws when the insert is rejected (duplicate name)", async () => {
    const chain = buildChain({ data: null, error: new Error("duplicate key") });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    await expect(createFolder("u1", "6º ano B")).rejects.toBeInstanceOf(Error);
  });
});

describe("renameFolder", () => {
  it("renames in a single update, trimmed", async () => {
    const chain = buildChain({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    await renameFolder("f1", "  7º ano  ");
    expect(chain.update).toHaveBeenCalledWith({ name: "7º ano" });
    expect(chain.eq).toHaveBeenCalledWith("id", "f1");
  });

  it("throws when the rename fails", async () => {
    const chain = buildChain({ data: null, error: new Error("nope") });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    await expect(renameFolder("f1", "x")).rejects.toBeInstanceOf(Error);
  });
});

describe("deleteFolder", () => {
  it("deletes the folder row", async () => {
    const chain = buildChain({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    await deleteFolder("f1");
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("id", "f1");
  });

  it("throws when the delete fails", async () => {
    const chain = buildChain({ data: null, error: new Error("nope") });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    await expect(deleteFolder("f1")).rejects.toBeInstanceOf(Error);
  });
});

describe("moveAdaptationToFolder", () => {
  it("files the adaptation into a folder", async () => {
    const chain = buildChain({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    await moveAdaptationToFolder("a1", "f1");
    expect(supabase.from).toHaveBeenCalledWith("adaptations");
    expect(chain.update).toHaveBeenCalledWith({ folder_id: "f1" });
  });

  it("takes it out of every folder with an explicit null", async () => {
    const chain = buildChain({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    await moveAdaptationToFolder("a1", null);
    expect(chain.update).toHaveBeenCalledWith({ folder_id: null });
  });

  it("throws when the move fails", async () => {
    const chain = buildChain({ data: null, error: new Error("nope") });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    await expect(moveAdaptationToFolder("a1", "f1")).rejects.toBeInstanceOf(Error);
  });
});
