import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useActivityLog } from "./useActivityLog";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const adaptations = [
  { id: "a1", title: "Prova de Física", activity_type: "prova", status: "ready", credits_spent: 5, updated_at: "2026-06-01T10:00:00Z" },
  { id: "a2", title: "", activity_type: null, status: "draft", credits_spent: 0, updated_at: "2026-06-03T08:00:00Z" },
];
const extractions = [
  { id: "e1", file_name: "prova_2024.pdf", questions_extracted: 10, credits_spent: 2, was_free: false, uploaded_at: "2026-06-02T12:00:00Z" },
];

function mockFrom(adaptData: unknown[], extractData: unknown[], adaptError = null, extractError = null) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    const data = table === "adaptations" ? adaptData : extractData;
    const error = table === "adaptations" ? adaptError : extractError;
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data, error }) } as never;
  });
}

beforeEach(() => vi.clearAllMocks());

describe("useActivityLog", () => {
  it("combines adaptations and extractions sorted by date descending", async () => {
    mockFrom(adaptations, extractions);
    const { result } = renderHook(() => useActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const items = result.current.data!;
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ kind: "adaptation", id: "a2" });
    expect(items[1]).toMatchObject({ kind: "extraction", id: "e1" });
    expect(items[2]).toMatchObject({ kind: "adaptation", id: "a1" });
  });

  it("maps adaptation fields correctly", async () => {
    mockFrom([adaptations[0]], []);
    const { result } = renderHook(() => useActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0]).toEqual({
      kind: "adaptation",
      id: "a1",
      title: "Prova de Física",
      activityType: "prova",
      status: "ready",
      creditsSpent: 5,
      date: "2026-06-01T10:00:00Z",
    });
  });

  it("falls back title to 'Adaptação sem título' when empty", async () => {
    mockFrom([adaptations[1]], []);
    const { result } = renderHook(() => useActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const item = result.current.data![0];
    expect(item.kind === "adaptation" && item.title).toBe("Adaptação sem título");
  });

  it("maps extraction fields correctly", async () => {
    mockFrom([], extractions);
    const { result } = renderHook(() => useActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0]).toEqual({
      kind: "extraction",
      id: "e1",
      fileName: "prova_2024.pdf",
      questionsExtracted: 10,
      creditsSpent: 2,
      wasFree: false,
      date: "2026-06-02T12:00:00Z",
    });
  });

  it("handles null optional fields gracefully", async () => {
    const raw = [{ id: "e2", file_name: "f.pdf", questions_extracted: null, credits_spent: null, was_free: null, uploaded_at: "2026-06-01T00:00:00Z" }];
    mockFrom([], raw);
    const { result } = renderHook(() => useActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const item = result.current.data![0];
    expect(item.kind === "extraction" && item.questionsExtracted).toBe(0);
    expect(item.kind === "extraction" && item.creditsSpent).toBe(0);
    expect(item.kind === "extraction" && item.wasFree).toBe(false);
  });

  it("returns empty array when both tables are empty", async () => {
    mockFrom([], []);
    const { result } = renderHook(() => useActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("throws when adaptations query errors", async () => {
    mockFrom([], [], new Error("DB") as never);
    const { result } = renderHook(() => useActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("throws when extractions query errors", async () => {
    mockFrom([], [], null, new Error("DB") as never);
    const { result } = renderHook(() => useActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("falls back to [] when adaptations data is null", async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "adaptations") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: null, error: null }) } as never;
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: extractions, error: null }) } as never;
    });
    const { result } = renderHook(() => useActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].kind).toBe("extraction");
  });

  it("falls back to [] when extractions data is null", async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "adaptations") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: adaptations, error: null }) } as never;
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: null, error: null }) } as never;
    });
    const { result } = renderHook(() => useActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data!.every((i) => i.kind === "adaptation")).toBe(true);
  });

  it("falls back credits to 0 when adaptation credits_spent is null", async () => {
    const raw = [{ id: "a3", title: "Sem custo", activity_type: null, status: "ready", credits_spent: null, updated_at: "2026-06-01T00:00:00Z" }];
    mockFrom(raw, []);
    const { result } = renderHook(() => useActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const item = result.current.data![0];
    expect(item.kind === "adaptation" && item.creditsSpent).toBe(0);
  });
});
