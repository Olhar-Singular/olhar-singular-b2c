import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardPage from "./DashboardPage";
import { renderWithProviders, buildAuthState } from "@/test/helpers";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/hooks/useAuth";

function setAuth(overrides: Record<string, unknown> = {}) {
  vi.mocked(useAuth).mockReturnValue(buildAuthState(overrides) as never);
}

describe("DashboardPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("greets with profile.full_name when available", () => {
    setAuth({
      profile: { full_name: "Maria", credit_balance: 7 },
      user: { id: "u1" },
    });
    renderWithProviders(<DashboardPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Maria/);
  });

  it("falls back to user.user_metadata.full_name when profile is empty", () => {
    setAuth({
      profile: null,
      user: { id: "u1", user_metadata: { full_name: "Carlos" } } as never,
    });
    renderWithProviders(<DashboardPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Carlos/);
  });

  it("falls back to 'Professor(a)' when neither profile nor user metadata is available", () => {
    setAuth({ profile: null, user: { id: "u1" } });
    renderWithProviders(<DashboardPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Professor/);
  });

  it("displays the profile's credit balance", () => {
    setAuth({ profile: { full_name: "X", credit_balance: 42 }, user: { id: "u1" } });
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("displays a dash placeholder when balance is missing", () => {
    setAuth({ profile: null, user: { id: "u1" } });
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders four quick-action cards linking to product routes", () => {
    setAuth({ profile: null, user: { id: "u1" } });
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText(/Adaptar Atividade/)).toBeInTheDocument();
    expect(screen.getByText(/Perfis de Barreira/)).toBeInTheDocument();
    const creditosLinks = screen.getAllByRole("link", { name: /Crédit/i });
    expect(creditosLinks.length).toBeGreaterThan(0);
    expect(screen.getByText(/Chat com IA/)).toBeInTheDocument();
  });

  it("renders the daily pedagogical tip with dimension label", () => {
    setAuth({ profile: null, user: { id: "u1" } });
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText(/Dica Pedagógica do Dia/i)).toBeInTheDocument();
  });

  it("shows the Sair button and triggers signOut", async () => {
    const signOut = vi.fn();
    setAuth({ profile: null, user: { id: "u1" }, signOut });
    renderWithProviders(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: /Sair/i }));
    expect(signOut).toHaveBeenCalled();
  });
});
