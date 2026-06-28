import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AuthPage from "./AuthPage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAuthState } from "@/test/helpers";

const mockNavigate = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resend: vi.fn(),
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
    vi.mocked(useAuth).mockReturnValue(buildAuthState() as never);
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ error: null } as never);
    vi.mocked(supabase.auth.signUp).mockResolvedValue({ error: null } as never);
    vi.mocked(supabase.auth.resend).mockResolvedValue({ error: null } as never);
  });

  async function fillAndSubmitSignup(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /cadastre-se/i }));
    await user.type(screen.getByLabelText(/nome/i), "Ana");
    await user.type(screen.getByLabelText(/e-mail/i), "ana@b.com");
    await user.type(screen.getByLabelText("Senha"), "123456");
    await user.click(screen.getByRole("button", { name: /criar conta/i }));
  }

  it("renders login form by default", () => {
    renderAuthPage();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Senha"), {
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
    await user.type(screen.getByLabelText("Senha"), "123456");
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
    fireEvent.change(screen.getByLabelText("Senha"), {
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

  it("shows validation error when email or password is empty", () => {
    renderAuthPage();
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Preencha todos os campos/i);
  });

  it("shows validation error when name is empty during signup", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await user.click(screen.getByRole("button", { name: /cadastre-se/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Informe seu nome/i);
  });

  it("shows validation error when password is shorter than 6", () => {
    renderAuthPage();
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/pelo menos 6 caracteres/i);
  });

  it("shows generic error message when supabase returns an unmapped error", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      error: { message: "Some unexpected server error" },
    } as never);
    renderAuthPage();
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Erro ao acessar a conta/i)
    );
  });

  it("shows already-registered error when signUp returns 'already registered'", async () => {
    const user = userEvent.setup();
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      error: { message: "User already registered" },
    } as never);
    renderAuthPage();
    await user.click(screen.getByRole("button", { name: /cadastre-se/i }));
    await user.type(screen.getByLabelText(/nome/i), "Ana");
    await user.type(screen.getByLabelText(/e-mail/i), "ana@b.com");
    await user.type(screen.getByLabelText("Senha"), "123456");
    await user.click(screen.getByRole("button", { name: /criar conta/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/já está cadastrado/i));
  });

  it("toggles back to login from signup", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await user.click(screen.getByRole("button", { name: /cadastre-se/i }));
    expect(screen.getByLabelText(/nome/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Entrar$/ }));
    expect(screen.queryByLabelText(/nome/i)).toBeNull();
  });

  it("starts in signup mode when ?signup=1 is set", () => {
    render(
      <MemoryRouter initialEntries={["/auth?signup=1"]}>
        <AuthPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/nome/i)).toBeInTheDocument();
  });

  it("shows fallback error message when signUp returns error with no message (line 62 branch)", async () => {
    const user = userEvent.setup();
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      error: { message: "" },
    } as never);
    renderAuthPage();
    await user.click(screen.getByRole("button", { name: /cadastre-se/i }));
    await user.type(screen.getByLabelText(/nome/i), "Ana");
    await user.type(screen.getByLabelText(/e-mail/i), "ana@b.com");
    await user.type(screen.getByLabelText("Senha"), "123456");
    await user.click(screen.getByRole("button", { name: /criar conta/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Erro ao criar conta/i)
    );
  });

  it("hides the password by default and toggles visibility with the eye button", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    const passwordInput = screen.getByLabelText("Senha");
    expect(passwordInput).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", { name: /mostrar senha/i });
    await user.click(toggle);
    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /ocultar senha/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ocultar senha/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("provides the password visibility toggle in signup mode too", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await user.click(screen.getByRole("button", { name: /cadastre-se/i }));
    expect(screen.getByRole("button", { name: /mostrar senha/i })).toBeInTheDocument();
  });

  it("shows fallback error 'Erro ao entrar.' when login returns error with no message (line 47 binary-expr branch)", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      error: { message: "" },
    } as never);
    renderAuthPage();
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Erro ao entrar/i)
    );
  });

  it("shows the email-confirmation view after a successful signup", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await fillAndSubmitSignup(user);

    expect(await screen.findByText(/verifique seu e-mail/i)).toBeInTheDocument();
    expect(screen.getByText(/ana@b\.com/)).toBeInTheDocument();
    const resendButton = screen.getByRole("button", { name: /reenviar/i });
    expect(resendButton).toBeDisabled();
    expect(resendButton).toHaveTextContent(/reenviar em 60s/i);
    // login/signup form is gone
    expect(screen.queryByLabelText("Senha")).toBeNull();
  });

  it("enables resend after the 60s cooldown and resends the confirmation email", async () => {
    vi.useFakeTimers();
    try {
      renderAuthPage();
      fireEvent.click(screen.getByRole("button", { name: /cadastre-se/i }));
      fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "Ana" } });
      fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "ana@b.com" } });
      fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "123456" } });
      fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
      await act(async () => {});

      expect(screen.getByText(/verifique seu e-mail/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /reenviar/i })).toBeDisabled();

      // drain the cooldown
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });

      const resendButton = screen.getByRole("button", { name: /reenviar/i });
      expect(resendButton).toBeEnabled();
      expect(resendButton).toHaveTextContent(/^Reenviar e-mail$/);

      fireEvent.click(resendButton);
      await act(async () => {});

      expect(supabase.auth.resend).toHaveBeenCalledWith({
        type: "signup",
        email: "ana@b.com",
      });
      // cooldown restarts after resend
      expect(screen.getByRole("button", { name: /reenviar/i })).toHaveTextContent(
        /reenviar em 60s/i,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts the cooldown down second by second", async () => {
    vi.useFakeTimers();
    try {
      renderAuthPage();
      fireEvent.click(screen.getByRole("button", { name: /cadastre-se/i }));
      fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "Ana" } });
      fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "ana@b.com" } });
      fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "123456" } });
      fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
      await act(async () => {});

      expect(screen.getByRole("button", { name: /reenviar/i })).toHaveTextContent(
        /reenviar em 60s/i,
      );
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
      expect(screen.getByRole("button", { name: /reenviar/i })).toHaveTextContent(
        /reenviar em 59s/i,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows an error when resending the confirmation email fails", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(supabase.auth.resend).mockResolvedValue({
        error: { message: "Email rate limit exceeded" },
      } as never);
      renderAuthPage();
      fireEvent.click(screen.getByRole("button", { name: /cadastre-se/i }));
      fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "Ana" } });
      fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "ana@b.com" } });
      fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "123456" } });
      fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
      await act(async () => {});
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });

      fireEvent.click(screen.getByRole("button", { name: /reenviar/i }));
      await act(async () => {});

      expect(screen.getByRole("alert")).toHaveTextContent(/muitas tentativas/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns to the login form from the email-confirmation view", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await fillAndSubmitSignup(user);
    await screen.findByText(/verifique seu e-mail/i);

    await user.click(screen.getByRole("button", { name: /voltar para login/i }));

    expect(screen.getByRole("button", { name: /^Entrar$/ })).toBeInTheDocument();
    expect(screen.queryByText(/verifique seu e-mail/i)).toBeNull();
  });
});
