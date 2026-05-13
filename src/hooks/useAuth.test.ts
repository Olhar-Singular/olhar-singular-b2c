import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(),
  },
}));

import { useAuth } from "./useAuth";
import { useAuthContext } from "@/contexts/AuthContext";

describe("useAuth", () => {
  it("re-exports useAuthContext from AuthContext", () => {
    expect(useAuth).toBe(useAuthContext);
  });
});
