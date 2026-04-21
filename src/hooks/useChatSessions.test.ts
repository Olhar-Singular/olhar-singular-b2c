import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useChatSessions } from "./useChatSessions";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn() })) },
}));

import { supabase } from "@/integrations/supabase/client";
const mockFrom = supabase.from as ReturnType<typeof vi.fn>;
let mockSelect: ReturnType<typeof vi.fn>;

const SESSION_A = { id: "s1", user_id: "u1", title: "Conversa A", messages: [], created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" };
const SESSION_B = { id: "s2", user_id: "u1", title: "Conversa B", messages: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useChatSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect = vi.fn();
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it("returns sessions ordered by updated_at descending", async () => {
    mockSelect.mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [SESSION_A, SESSION_B], error: null }),
    });

    const { result } = renderHook(() => useChatSessions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].id).toBe("s1");
  });

  it("returns empty array when no sessions", async () => {
    mockSelect.mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const { result } = renderHook(() => useChatSessions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(0);
  });
});
