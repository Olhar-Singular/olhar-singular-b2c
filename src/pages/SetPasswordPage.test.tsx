import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, buildAuthState } from "@/test/helpers";
import SetPasswordPage from "./SetPasswordPage";

const { mockSetPassword, navigateSpy, mockSignOut } = vi.hoisted(() => ({
  mockSetPassword: vi.fn(),
  navigateSpy: vi.fn(),
  mockSignOut: vi.fn(),
}));

vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
const { mockUseSetInitialPassword } = vi.hoisted(() => ({ mockUseSetInitialPassword: vi.fn() }));
vi.mock("@/hooks/useSubscription", () => ({
  useSetInitialPassword: mockUseSetInitialPassword,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useAuth } from "@/hooks/useAuth";

describe("SetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined);
    mockSetPassword.mockResolvedValue({ ok: true });
    mockUseSetInitialPassword.mockReturnValue({ mutateAsync: mockSetPassword, isPending: false });
    vi.mocked(useAuth).mockReturnValue(
      buildAuthState({ user: { id: "u1", email: "nova@example.com" }, signOut: mockSignOut }) as never,
    );
  });

  it("shows the account and focuses the instruction", () => {
    renderWithProviders(<SetPasswordPage />);
    expect(screen.getByText("nova@example.com")).toBeInTheDocument();
    expect(screen.getByText("Defina a senha da sua conta")).toHaveFocus();
  });

  it("validates length and confirmation before calling the server", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SetPasswordPage />);
    await user.type(screen.getByLabelText("Senha"), "abc");
    await user.click(screen.getByRole("button", { name: /Salvar senha/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/6 caracteres/);

    await user.type(screen.getByLabelText("Senha"), "def");
    await user.type(screen.getByLabelText("Confirme a senha"), "abcdeg");
    await user.click(screen.getByRole("button", { name: /Salvar senha/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/não coincidem/);
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it("saves the password and goes to the dashboard", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    renderWithProviders(<SetPasswordPage />);
    await user.type(screen.getByLabelText("Senha"), "segura1");
    await user.type(screen.getByLabelText("Confirme a senha"), "segura1");
    await user.click(screen.getByRole("button", { name: /Salvar senha/ }));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/dashboard", { replace: true }));
    expect(mockSetPassword).toHaveBeenCalledWith({ password: "segura1" });
    expect(toast.success).toHaveBeenCalled();
  });

  it("keeps the form when the server refuses (hook toasts)", async () => {
    const user = userEvent.setup();
    mockSetPassword.mockRejectedValue(new Error("falha"));
    renderWithProviders(<SetPasswordPage />);
    await user.type(screen.getByLabelText("Senha"), "segura1");
    await user.type(screen.getByLabelText("Confirme a senha"), "segura1");
    await user.click(screen.getByRole("button", { name: /Salvar senha/ }));
    await waitFor(() => expect(mockSetPassword).toHaveBeenCalled());
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SetPasswordPage />);
    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Confirme a senha")).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
  });

  it("offers a way out: sign out and go home", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SetPasswordPage />);
    await user.click(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
  });

  it("disables the button while saving", () => {
    mockUseSetInitialPassword.mockReturnValue({ mutateAsync: mockSetPassword, isPending: true });
    renderWithProviders(<SetPasswordPage />);
    expect(screen.getByRole("button", { name: "Salvando..." })).toBeDisabled();
  });

  it("renders without an e-mail", () => {
    vi.mocked(useAuth).mockReturnValue(buildAuthState({ user: { id: "u1" }, signOut: mockSignOut }) as never);
    renderWithProviders(<SetPasswordPage />);
    expect(screen.queryByText(/Conta:/)).toBeNull();
  });
});
