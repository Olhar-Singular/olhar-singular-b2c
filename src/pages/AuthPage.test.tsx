import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AuthPage from "./AuthPage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const mockNavigate = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
  },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    session: null,
    user: null,
    profile: null,
    loading: false,
    signOut: vi.fn(),
  })),
}));

function renderAuthPage() {
  return render(
    <MemoryRouter>
      <AuthPage />
    </MemoryRouter>
  );
}

describe("AuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      user: null,
      profile: null,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ error: null } as never);
    vi.mocked(supabase.auth.signUp).mockResolvedValue({ error: null } as never);
  });

  it("renders login form by default", () => {
    renderAuthPage();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument();
  });

  it("shows name field after switching to signup", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await user.click(screen.getByRole("button", { name: /cadastre-se/i }));
    expect(screen.getByLabelText(/nome/i)).toBeInTheDocument();
  });

  it("calls signInWithPassword on login submit", async () => {
    renderAuthPage();
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    await waitFor(() =>
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "a@b.com",
        password: "123456",
      })
    );
  });

  it("calls signUp on register submit", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await user.click(screen.getByRole("button", { name: /cadastre-se/i }));
    await user.type(screen.getByLabelText(/nome/i), "Ana");
    await user.type(screen.getByLabelText(/e-mail/i), "ana@b.com");
    await user.type(screen.getByLabelText(/senha/i), "123456");
    await user.click(screen.getByRole("button", { name: /criar conta/i }));
    await waitFor(() =>
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: "ana@b.com",
        password: "123456",
        options: { data: { full_name: "Ana" } },
      })
    );
  });

  it("shows error message on failed login", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      error: { message: "Invalid login credentials" },
    } as never);
    renderAuthPage();
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), {
      target: { value: "errada" },
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument()
    );
  });

  it("redirects to /dashboard when already authenticated", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: { user: { id: "123" } } as never,
      user: null,
      profile: null,
      loading: false,
      signOut: vi.fn(),
    });
    renderAuthPage();
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true })
    );
  });
});
