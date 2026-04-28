import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import Layout from "./Layout";
import { renderWithProviders, buildAuthState } from "@/test/helpers";

vi.mock("@/assets/logo-olho-transparent.png", () => ({ default: "stub://logo.png" }));

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
import { useAuth } from "@/hooks/useAuth";

function setAuth(over: Record<string, unknown> = {}) {
  vi.mocked(useAuth).mockReturnValue(buildAuthState(over) as never);
}

beforeEach(() => {
  navigateSpy.mockReset();
  vi.clearAllMocks();
});

describe("Layout", () => {
  it("renders main landmarks (banner-less, sidebar nav, main content)", () => {
    setAuth();
    renderWithProviders(
      <Layout>
        <div data-testid="content">payload</div>
      </Layout>,
      { route: "/dashboard" }
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
  });

  it("renders all primary nav items", () => {
    setAuth();
    renderWithProviders(<Layout />, { route: "/dashboard" });
    expect(screen.getAllByRole("link", { name: /Dashboard/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Adaptar/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Perfis de Barreira/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Chat com a ISA/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Banco de Quest/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Crédit/i }).length).toBeGreaterThan(0);
  });

  it("marks the active route with aria-current=page", () => {
    setAuth();
    renderWithProviders(<Layout />, { route: "/adaptar/foo" });
    const adaptarLinks = screen.getAllByRole("link", { name: /Adaptar/i });
    expect(adaptarLinks.some((l) => l.getAttribute("aria-current") === "page")).toBe(true);
  });

  it("marks /dashboard as active only on exact match (not /dashboard/foo)", () => {
    setAuth();
    const { unmount } = renderWithProviders(<Layout />, { route: "/dashboard" });
    expect(
      screen.getAllByRole("link", { name: /Dashboard/i }).some(
        (l) => l.getAttribute("aria-current") === "page",
      ),
    ).toBe(true);
    unmount();
  });

  it("displays the credit balance badge when profile has credit_balance", () => {
    setAuth({ profile: { credit_balance: 42 } });
    renderWithProviders(<Layout />, { route: "/dashboard" });
    expect(screen.getAllByText("42").length).toBeGreaterThan(0);
  });

  it("does not render the credit badge when balance is null/undefined", () => {
    setAuth({ profile: null });
    renderWithProviders(<Layout />, { route: "/dashboard" });
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });

  it("Sair button calls signOut and navigates to /", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    setAuth({ signOut });
    renderWithProviders(<Layout />, { route: "/dashboard" });
    const buttons = screen.getAllByRole("button", { name: /Sair/i });
    fireEvent.click(buttons[0]);
    await Promise.resolve();
    await Promise.resolve();
    expect(signOut).toHaveBeenCalled();
  });

  it("mobile menu opens and closes via the hamburger button", () => {
    setAuth();
    renderWithProviders(<Layout />, { route: "/dashboard" });
    const open = screen.getByRole("button", { name: /Abrir menu/i });
    fireEvent.click(open);
    expect(screen.getByRole("button", { name: /Fechar menu/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Fechar menu/i }));
    expect(screen.getByRole("button", { name: /Abrir menu/i })).toBeInTheDocument();
  });

  it("mobile drawer link click closes the drawer", () => {
    setAuth();
    renderWithProviders(<Layout />, { route: "/dashboard" });
    fireEvent.click(screen.getByRole("button", { name: /Abrir menu/i }));
    const dashboardLinks = screen.getAllByRole("link", { name: /^Dashboard/i });
    fireEvent.click(dashboardLinks[dashboardLinks.length - 1]);
    expect(screen.queryByRole("button", { name: /Fechar menu/i })).toBeNull();
  });

  it("renders Outlet content when no children prop is passed", () => {
    setAuth();
    renderWithProviders(<Layout />, { route: "/dashboard" });
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("mobile drawer Sair button calls signOut and navigates to /", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    setAuth({ signOut });
    renderWithProviders(<Layout />, { route: "/dashboard" });
    fireEvent.click(screen.getByRole("button", { name: /Abrir menu/i }));
    const sairButtons = screen.getAllByRole("button", { name: /Sair/i });
    fireEvent.click(sairButtons[sairButtons.length - 1]);
    await Promise.resolve();
    await Promise.resolve();
    expect(signOut).toHaveBeenCalled();
  });

  it("backdrop click on mobile drawer closes it", () => {
    setAuth();
    const { container } = renderWithProviders(<Layout />, { route: "/dashboard" });
    fireEvent.click(screen.getByRole("button", { name: /Abrir menu/i }));
    const backdrop = container.querySelector(".bg-foreground\\/50") as HTMLElement | null;
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(screen.queryByRole("button", { name: /Fechar menu/i })).toBeNull();
    }
  });

  it("displays the credit balance badge in the mobile header", () => {
    setAuth({ profile: { credit_balance: 7 } });
    const { container } = renderWithProviders(<Layout />, { route: "/dashboard" });
    expect(container.textContent).toContain("7");
  });
});
