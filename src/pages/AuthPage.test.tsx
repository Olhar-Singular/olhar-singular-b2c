import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    },
  },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

function renderAuthPage(route = "/auth") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthPage />
    </MemoryRouter>,
  );
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email = "a@b.com", password = "123456") {
  if (email) await user.type(screen.getByLabelText(/e-mail/i), email);
  if (password) await user.type(screen.getByLabelText("Senha"), password);
  await user.click(screen.getByRole("button", { name: /^entrar$/i }));
}

describe("AuthPage (login only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue(buildAuthState() as never);
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ error: null } as never);
  });

  it("renders the login form and nothing about signing up", () => {
    renderAuthPage();
    expect(screen.getByRole("heading", { name: /^entrar$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.queryByText(/cadastre-se/i)).toBeNull();
    expect(screen.queryByLabelText(/nome/i)).toBeNull();
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  // The old public-signup deep link still lives in e-mails and bookmarks.
  it("explains how accounts are created when ?signup=1 is set", () => {
    renderAuthPage("/auth?signup=1");
    expect(screen.getByRole("status")).toHaveTextContent(/assinatura ou por convite/i);
    expect(screen.getByRole("heading", { name: /^entrar$/i })).toBeInTheDocument();
  });

  it("does not show the signup notice by default", () => {
    renderAuthPage();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("signs in and navigates to the dashboard", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await fillAndSubmit(user);

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "123456" });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
  });

  it("shows the mapped error on failed login", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      error: { message: "Invalid login credentials" },
    } as never);
    const user = userEvent.setup();
    renderAuthPage();
    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/e-mail ou senha incorretos/i);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows the fallback error when the login error has no message", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ error: {} } as never);
    const user = userEvent.setup();
    renderAuthPage();
    await fillAndSubmit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/erro ao entrar/i);
  });

  it("redirects to /dashboard when already authenticated", async () => {
    vi.mocked(useAuth).mockReturnValue(
      buildAuthState({ session: { user: { id: "u1" }, access_token: "t" } }) as never,
    );
    renderAuthPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
  });

  it("does not redirect while the session is still loading", () => {
    vi.mocked(useAuth).mockReturnValue(buildAuthState({ loading: true }) as never);
    renderAuthPage();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("validates empty fields before calling the API", () => {
    renderAuthPage();
    fireEvent.click(screen.getByRole("button", { name: /^entrar$/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/preencha todos os campos/i);
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("validates the password length before calling the API", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await fillAndSubmit(user, "a@b.com", "123");
    expect(screen.getByRole("alert")).toHaveTextContent(/pelo menos 6 caracteres/i);
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("disables the button while submitting", async () => {
    let resolve: (v: unknown) => void = () => {};
    vi.mocked(supabase.auth.signInWithPassword).mockReturnValue(
      new Promise((r) => { resolve = r; }) as never,
    );
    const user = userEvent.setup();
    renderAuthPage();
    await fillAndSubmit(user);
    expect(screen.getByRole("button", { name: /aguarde/i })).toBeDisabled();
    resolve({ error: null });
    await waitFor(() => expect(screen.getByRole("button", { name: /^entrar$/i })).toBeEnabled());
  });

  it("hides the password by default and toggles visibility with the eye button", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    const input = screen.getByLabelText("Senha");
    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: /mostrar senha/i }));
    expect(input).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: /ocultar senha/i }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("links to the forgot-password page and to the plans", () => {
    renderAuthPage();
    expect(screen.getByRole("link", { name: /esqueci minha senha/i })).toHaveAttribute("href", "/esqueci-senha");
    expect(screen.getByRole("link", { name: /conheça os planos/i })).toHaveAttribute("href", "/");
  });

  it("marks the fields for the browser password manager", () => {
    renderAuthPage();
    expect(screen.getByLabelText(/e-mail/i)).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Senha")).toHaveAttribute("autocomplete", "current-password");
  });
});
