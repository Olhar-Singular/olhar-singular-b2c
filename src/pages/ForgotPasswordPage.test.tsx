import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ForgotPasswordPage from "./ForgotPasswordPage";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { resetPasswordForEmail: vi.fn() } },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

const RESET_URL = `${window.location.origin}/redefinir-senha`;

async function submitEmail(value = "ana@b.com") {
  fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: /enviar link/i }));
  await act(async () => {});
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({ error: null } as never);
  });

  it("renders the email form", () => {
    renderPage();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar link/i })).toBeInTheDocument();
  });

  it("shows a validation error when the email is empty", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /enviar link/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/informe seu e-mail/i);
    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("calls resetPasswordForEmail pointing back at the reset page", async () => {
    renderPage();
    await submitEmail();
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("ana@b.com", {
      redirectTo: RESET_URL,
    });
  });

  it("shows the neutral sent view, never confirming the account exists", async () => {
    renderPage();
    await submitEmail();

    expect(screen.getByText(/se houver uma conta/i)).toBeInTheDocument();
    expect(screen.getByText(/ana@b\.com/)).toBeInTheDocument();
    // the form is gone
    expect(screen.queryByRole("button", { name: /enviar link/i })).toBeNull();
    // resend starts on cooldown
    expect(screen.getByRole("button", { name: /reenviar em 60s/i })).toBeDisabled();
  });

  it("shows a pending label while the request is in flight", async () => {
    let release!: (v: unknown) => void;
    vi.mocked(supabase.auth.resetPasswordForEmail).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );
    renderPage();
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "ana@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar link/i }));

    expect(await screen.findByRole("button", { name: /enviando/i })).toBeDisabled();

    await act(async () => {
      release({ error: null });
    });
  });

  it("surfaces rate-limit errors instead of the sent view", async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      error: { message: "Email rate limit exceeded" },
    } as never);
    renderPage();
    await submitEmail();

    expect(screen.getByRole("alert")).toHaveTextContent(/muitas tentativas/i);
    expect(screen.queryByText(/se houver uma conta/i)).toBeNull();
  });

  it("falls back to a generic message when the error has no text", async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      error: { message: "" },
    } as never);
    renderPage();
    await submitEmail();
    expect(screen.getByRole("alert")).toHaveTextContent(/erro ao entrar/i);
  });

  it("counts the cooldown down and re-sends after it drains", async () => {
    vi.useFakeTimers();
    try {
      renderPage();
      fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "ana@b.com" } });
      fireEvent.click(screen.getByRole("button", { name: /enviar link/i }));
      await act(async () => {});

      expect(screen.getByRole("button", { name: /reenviar em 60s/i })).toBeDisabled();
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
      expect(screen.getByRole("button", { name: /reenviar em 59s/i })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(59_000);
      });
      const resend = screen.getByRole("button", { name: /^Reenviar e-mail$/ });
      expect(resend).toBeEnabled();

      fireEvent.click(resend);
      await act(async () => {});

      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", { name: /reenviar em 60s/i })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows an alert when the resend fails", async () => {
    vi.useFakeTimers();
    try {
      renderPage();
      fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "ana@b.com" } });
      fireEvent.click(screen.getByRole("button", { name: /enviar link/i }));
      await act(async () => {});
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });

      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
        error: { message: "Failed to fetch" },
      } as never);
      fireEvent.click(screen.getByRole("button", { name: /^Reenviar e-mail$/ }));
      await act(async () => {});

      expect(screen.getByRole("alert")).toHaveTextContent(/sem conexão/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks the email field for browser autofill", () => {
    renderPage();
    const input = screen.getByLabelText(/e-mail/i);
    expect(input).toHaveAttribute("name", "email");
    expect(input).toHaveAttribute("autocomplete", "email");
  });

  it("moves focus through the form with Tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.tab();
    expect(screen.getByLabelText(/e-mail/i)).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /enviar link/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: /voltar para login/i })).toHaveFocus();
  });

  it("links back to login from both views", async () => {
    renderPage();
    expect(screen.getByRole("link", { name: /voltar para login/i })).toHaveAttribute(
      "href",
      "/auth",
    );
    await submitEmail();
    expect(screen.getByRole("link", { name: /voltar para login/i })).toHaveAttribute(
      "href",
      "/auth",
    );
  });
});
