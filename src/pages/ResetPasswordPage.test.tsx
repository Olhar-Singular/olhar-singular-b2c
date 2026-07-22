import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import ResetPasswordPage from "./ResetPasswordPage";
import { supabase } from "@/integrations/supabase/client";

const mockNavigate = vi.fn();
const unsubscribe = vi.fn();

/** Captures the callback the page hands to onAuthStateChange. */
let authCallback: (event: string, session: unknown) => void;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
}

const SESSION = { user: { id: "u1" } };
const SESSION_WITH_EMAIL = { user: { id: "u1", email: "ana@b.com" } };

/** Renders with a valid recovery session already resolved. */
async function renderReady() {
  vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: SESSION } } as never);
  renderPage();
  await act(async () => {});
}

async function fillAndSubmit(password: string, confirmation = password) {
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), {
    target: { value: confirmation },
  });
  fireEvent.click(screen.getByRole("button", { name: /redefinir senha/i }));
  await act(async () => {});
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(((cb: typeof authCallback) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe } } };
    }) as never);
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never);
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({ error: null } as never);
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null } as never);
  });

  it("shows a checking state while the session is still resolving", () => {
    vi.mocked(supabase.auth.getSession).mockReturnValue(new Promise(() => {}) as never);
    renderPage();
    expect(screen.getByText(/verificando/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nova senha")).toBeNull();
  });

  it("shows the form when getSession resolves a recovery session", async () => {
    await renderReady();
    expect(screen.getByLabelText("Nova senha")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmar senha")).toBeInTheDocument();
  });

  it("shows the form when PASSWORD_RECOVERY arrives after mount", async () => {
    vi.mocked(supabase.auth.getSession).mockReturnValue(new Promise(() => {}) as never);
    renderPage();
    expect(screen.getByText(/verificando/i)).toBeInTheDocument();

    await act(async () => {
      authCallback("PASSWORD_RECOVERY", SESSION);
    });
    expect(screen.getByLabelText("Nova senha")).toBeInTheDocument();
  });

  it("keeps the form when the event lands before getSession resolves null", async () => {
    let release!: (v: unknown) => void;
    vi.mocked(supabase.auth.getSession).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );
    renderPage();
    await act(async () => {
      authCallback("PASSWORD_RECOVERY", SESSION);
    });
    await act(async () => {
      release({ data: { session: null } });
    });
    expect(screen.getByLabelText("Nova senha")).toBeInTheDocument();
  });

  it("ignores auth events that carry no session", async () => {
    vi.mocked(supabase.auth.getSession).mockReturnValue(new Promise(() => {}) as never);
    renderPage();
    await act(async () => {
      authCallback("SIGNED_OUT", null);
    });
    expect(screen.getByText(/verificando/i)).toBeInTheDocument();
  });

  it("shows the invalid-link state when there is no session", async () => {
    renderPage();
    await act(async () => {});
    expect(screen.getByText(/link inválido ou expirado/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /solicitar novo link/i })).toHaveAttribute(
      "href",
      "/esqueci-senha",
    );
    expect(screen.queryByLabelText("Nova senha")).toBeNull();
  });

  it("rejects a password shorter than 6 characters", async () => {
    await renderReady();
    await fillAndSubmit("123");
    expect(screen.getByRole("alert")).toHaveTextContent(/pelo menos 6 caracteres/i);
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("rejects when the confirmation does not match", async () => {
    await renderReady();
    await fillAndSubmit("123456", "654321");
    expect(screen.getByRole("alert")).toHaveTextContent(/não coincidem/i);
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("updates the password, signs out and returns to login", async () => {
    await renderReady();
    await fillAndSubmit("novaSenha1");

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "novaSenha1" });
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Senha redefinida! Entre com a nova senha.");
    expect(mockNavigate).toHaveBeenCalledWith("/auth", { replace: true });
  });

  it("surfaces the mapped error when the new password repeats the old one", async () => {
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({
      error: { message: "New password should be different from the old password" },
    } as never);
    await renderReady();
    await fillAndSubmit("novaSenha1");

    expect(screen.getByRole("alert")).toHaveTextContent(/diferente da atual/i);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows a pending label while submitting", async () => {
    let release!: (v: unknown) => void;
    vi.mocked(supabase.auth.updateUser).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );
    await renderReady();
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "novaSenha1" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), {
      target: { value: "novaSenha1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /redefinir senha/i }));

    expect(await screen.findByRole("button", { name: /salvando/i })).toBeDisabled();
    await act(async () => {
      release({ error: null });
    });
  });

  it("toggles visibility of both password fields", async () => {
    const user = userEvent.setup();
    await renderReady();
    expect(screen.getByLabelText("Nova senha")).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /mostrar senha/i }));
    expect(screen.getByLabelText("Nova senha")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Confirmar senha")).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /ocultar senha/i }));
    expect(screen.getByLabelText("Nova senha")).toHaveAttribute("type", "password");
  });

  it("marks the new-password fields for the browser password manager", async () => {
    await renderReady();
    const newPassword = screen.getByLabelText("Nova senha");
    expect(newPassword).toHaveAttribute("name", "new-password");
    expect(newPassword).toHaveAttribute("autocomplete", "new-password");
    const confirmation = screen.getByLabelText("Confirmar senha");
    expect(confirmation).toHaveAttribute("name", "confirm-password");
    expect(confirmation).toHaveAttribute("autocomplete", "new-password");
  });

  it("exposes the account email in a hidden username field for the password manager", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: SESSION_WITH_EMAIL },
    } as never);
    const { container } = renderPage();
    await act(async () => {});

    const hidden = container.querySelector<HTMLInputElement>('input[autocomplete="username"]');
    expect(hidden).not.toBeNull();
    expect(hidden?.type).toBe("hidden");
    expect(hidden?.value).toBe("ana@b.com");
  });

  it("fills the hidden username field when the recovery event lands after mount", async () => {
    vi.mocked(supabase.auth.getSession).mockReturnValue(new Promise(() => {}) as never);
    const { container } = renderPage();
    await act(async () => {
      authCallback("PASSWORD_RECOVERY", SESSION_WITH_EMAIL);
    });

    expect(
      container.querySelector<HTMLInputElement>('input[autocomplete="username"]')?.value,
    ).toBe("ana@b.com");
  });

  it("moves focus through the reset form with Tab", async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.tab();
    expect(screen.getByLabelText("Nova senha")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /mostrar senha/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Confirmar senha")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /redefinir senha/i })).toHaveFocus();
  });

  it("unsubscribes from auth changes on unmount", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: SESSION } } as never);
    const view = renderPage();
    await act(async () => {});
    expect(unsubscribe).not.toHaveBeenCalled();

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
