import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useBarrierProfiles,
  useCreateBarrierProfile,
  useUpdateBarrierProfile,
  useDeleteBarrierProfile,
} from "./useBarrierProfiles";
import { supabase } from "@/integrations/supabase/client";

const mockProfiles = [
  {
    id: "p1",
    user_id: "u1",
    barriers: ["tea_abstracao", "tdah_atencao_sustentada"],
    observation: "Precisa de apoio visual",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

function buildChain(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn().mockResolvedValue({ data: mockProfiles, error: null }),
    insert: vi.fn().mockResolvedValue({ data: [mockProfiles[0]], error: null }),
    update: vi.fn(),
    delete: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: mockProfiles[0], error: null }),
    ...overrides,
  };
  // chain returns self
  (["select", "eq", "update", "delete"] as const).forEach((k) => {
    if (typeof base[k] === "function") {
      (base[k] as ReturnType<typeof vi.fn>).mockReturnValue(base);
    }
  });
  return base;
}

describe("useBarrierProfiles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns profiles list", async () => {
    vi.mocked(supabase.from).mockReturnValue(buildChain() as never);
    const { result } = renderHook(() => useBarrierProfiles(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockProfiles);
  });

  it("returns empty array when no profiles", async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: null, error: null }) }) as never
    );
    const { result } = renderHook(() => useBarrierProfiles(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("propagates Supabase errors as failed query state", async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) }) as never
    );
    const { result } = renderHook(() => useBarrierProfiles(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCreateBarrierProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls insert with barriers and observation", async () => {
    const chain = buildChain();
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    const { result } = renderHook(() => useCreateBarrierProfile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        barriers: ["dislexia_leitura"],
        observation: "Obs teste",
      });
    });

    expect(supabase.from).toHaveBeenCalledWith("barrier_profiles");
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        barriers: ["dislexia_leitura"],
        observation: "Obs teste",
        user_id: "u1",
      })
    );
  });

  it("toasts an error when the insert fails", async () => {
    const { toast } = await import("sonner");
    const chain = buildChain({
      insert: vi.fn().mockResolvedValue({ data: null, error: { message: "fail-insert" } }),
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    const { result } = renderHook(() => useCreateBarrierProfile(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ barriers: ["x"], observation: null });
      } catch {
        /* expected */
      }
    });
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("useUpdateBarrierProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls update with correct id", async () => {
    const chain = buildChain();
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    const { result } = renderHook(() => useUpdateBarrierProfile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: "p1",
        barriers: ["tdah_organizacao"],
        observation: null,
      });
    });

    expect(chain.eq).toHaveBeenCalledWith("id", "p1");
  });

  it("toasts an error when single() returns error", async () => {
    const { toast } = await import("sonner");
    const chain = buildChain({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "update-fail" } }),
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    const { result } = renderHook(() => useUpdateBarrierProfile(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ id: "p1", barriers: ["x"] });
      } catch {
        /* expected */
      }
    });
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("useDeleteBarrierProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls delete with correct id", async () => {
    const chain = buildChain({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    const { result } = renderHook(() => useDeleteBarrierProfile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("p1");
    });

    expect(supabase.from).toHaveBeenCalledWith("barrier_profiles");
    expect(chain.eq).toHaveBeenCalledWith("id", "p1");
  });

  it("toasts an error when delete fails", async () => {
    const { toast } = await import("sonner");
    const chain = buildChain();
    // override eq AFTER buildChain finishes the chaining setup
    chain.eq = vi.fn().mockResolvedValue({ error: { message: "delete-fail" } });
    chain.delete = vi.fn().mockReturnValue(chain);
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    const { result } = renderHook(() => useDeleteBarrierProfile(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync("p1");
      } catch {
        /* expected */
      }
    });
    expect(toast.error).toHaveBeenCalled();
  });
});
