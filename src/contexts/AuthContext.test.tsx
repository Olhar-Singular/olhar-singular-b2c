import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthProvider, useAuthContext } from "./AuthContext";

const mockSession = {
  user: { id: "user-123", email: "teste@teste.com" },
  access_token: "token",
};

const mockProfile = {
  id: "user-123",
  full_name: "Teste",
  credit_balance: 10,
  free_adaptation_used: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

let authStateCallback: ((event: string, session: unknown) => void) | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn((cb) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
    })),
  },
}));

function TestConsumer() {
  const { session, profile, loading, refreshProfile } = useAuthContext();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="session">{session ? "autenticado" : "anônimo"}</span>
      <span data-testid="credits">{profile?.credit_balance ?? "-"}</span>
      <button onClick={() => refreshProfile()}>refresh</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    authStateCallback = null;
    vi.clearAllMocks();
  });

  it("starts in loading state", () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("resolves to anonymous when no session", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("session")).toHaveTextContent("anônimo")
    );
  });

  it("loads profile when session exists", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession as never },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("credits")).toHaveTextContent("10")
    );
  });

  it("updates state on auth change event", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(authStateCallback).not.toBeNull());

    act(() => {
      authStateCallback!("SIGNED_IN", mockSession);
    });

    await waitFor(() =>
      expect(screen.getByTestId("session")).toHaveTextContent("autenticado")
    );
  });

  it("throws when useAuthContext is used outside AuthProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow();
    consoleError.mockRestore();
  });

  it("refreshProfile re-fetches and updates profile state", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession as never },
    });

    const updatedProfile = { ...mockProfile, credit_balance: 5 };
    const fromMock = vi.mocked(supabase.from);
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
    } as never);
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updatedProfile, error: null }),
    } as never);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId("credits")).toHaveTextContent("10"));

    await act(async () => {
      screen.getByText("refresh").click();
    });

    await waitFor(() => expect(screen.getByTestId("credits")).toHaveTextContent("5"));
  });
});
