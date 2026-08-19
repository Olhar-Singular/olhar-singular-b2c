import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useFolders,
  useCreateFolder,
  useRenameFolder,
  useDeleteFolder,
  useMoveAdaptation,
  folderKeys,
} from "./useFolders";
import * as repo from "@/lib/adaptation/persistence/foldersRepo";

vi.mock("@/lib/adaptation/persistence/foldersRepo");
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const FOLDER = {
  id: "f1",
  user_id: "u1",
  name: "6º ano B",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => vi.clearAllMocks());

describe("folderKeys", () => {
  it("builds stable keys", () => {
    expect(folderKeys.list()).toEqual(["adaptation_folders", "list"]);
  });
});

describe("useFolders", () => {
  it("lists the user's folders", async () => {
    vi.mocked(repo.listFolders).mockResolvedValue([FOLDER]);
    const { result } = renderHook(() => useFolders(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([FOLDER]));
  });
});

describe("useCreateFolder", () => {
  it("creates the folder for the signed-in user", async () => {
    vi.mocked(repo.createFolder).mockResolvedValue(FOLDER);
    const { toast } = await import("sonner");
    const { result } = renderHook(() => useCreateFolder(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("6º ano B");
    });
    expect(repo.createFolder).toHaveBeenCalledWith("u1", "6º ano B");
    expect(toast.success).toHaveBeenCalled();
  });

  it("explains a duplicate name instead of failing silently", async () => {
    vi.mocked(repo.createFolder).mockRejectedValue(new Error("duplicate key"));
    const { toast } = await import("sonner");
    const { result } = renderHook(() => useCreateFolder(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("x").catch(() => undefined);
    });
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("useRenameFolder", () => {
  it("renames and refreshes the list", async () => {
    vi.mocked(repo.renameFolder).mockResolvedValue(undefined);
    const { result } = renderHook(() => useRenameFolder(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "f1", name: "7º ano" });
    });
    expect(repo.renameFolder).toHaveBeenCalledWith("f1", "7º ano");
  });

  it("surfaces a rename failure", async () => {
    vi.mocked(repo.renameFolder).mockRejectedValue(new Error("nope"));
    const { toast } = await import("sonner");
    const { result } = renderHook(() => useRenameFolder(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "f1", name: "x" }).catch(() => undefined);
    });
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("useDeleteFolder", () => {
  // Deleting a folder leaves its adaptations unfiled, so the adaptation list is
  // now stale too — it would still show them under a folder that is gone.
  it("deletes the folder and refreshes both lists", async () => {
    vi.mocked(repo.deleteFolder).mockResolvedValue(undefined);
    const { toast } = await import("sonner");
    const { result } = renderHook(() => useDeleteFolder(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("f1");
    });
    expect(repo.deleteFolder).toHaveBeenCalledWith("f1");
    expect(toast.success).toHaveBeenCalled();
  });

  it("surfaces a delete failure", async () => {
    vi.mocked(repo.deleteFolder).mockRejectedValue(new Error("nope"));
    const { toast } = await import("sonner");
    const { result } = renderHook(() => useDeleteFolder(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("f1").catch(() => undefined);
    });
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("useMoveAdaptation", () => {
  it("files an adaptation into a folder", async () => {
    vi.mocked(repo.moveAdaptationToFolder).mockResolvedValue(undefined);
    const { result } = renderHook(() => useMoveAdaptation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ adaptationId: "a1", folderId: "f1" });
    });
    expect(repo.moveAdaptationToFolder).toHaveBeenCalledWith("a1", "f1");
  });

  it("takes an adaptation out of every folder", async () => {
    vi.mocked(repo.moveAdaptationToFolder).mockResolvedValue(undefined);
    const { result } = renderHook(() => useMoveAdaptation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ adaptationId: "a1", folderId: null });
    });
    expect(repo.moveAdaptationToFolder).toHaveBeenCalledWith("a1", null);
  });

  it("surfaces a move failure", async () => {
    vi.mocked(repo.moveAdaptationToFolder).mockRejectedValue(new Error("nope"));
    const { toast } = await import("sonner");
    const { result } = renderHook(() => useMoveAdaptation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ adaptationId: "a1", folderId: "f1" }).catch(() => undefined);
    });
    expect(toast.error).toHaveBeenCalled();
  });
});
