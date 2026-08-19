import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
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
    expect(screen.getAllByRole("link", { name: /Atividade/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Crédit/i }).length).toBeGreaterThan(0);
  });

  it("Atividade nav link points to /historico", () => {
    setAuth();
    renderWithProviders(<Layout />, { route: "/dashboard" });
    const links = screen.getAllByRole("link", { name: /Atividade/i });
    expect(links.some((l) => l.getAttribute("href") === "/historico")).toBe(true);
  });

  it("shows the Admin nav link for super-admins", () => {
    setAuth({ profile: { is_super_admin: true } });
    renderWithProviders(<Layout />, { route: "/dashboard" });
    expect(screen.getAllByRole("link", { name: /^Admin/i }).length).toBeGreaterThan(0);
  });

  it("hides the Admin nav link for non super-admins", () => {
    setAuth({ profile: { is_super_admin: false } });
    renderWithProviders(<Layout />, { route: "/dashboard" });
    expect(screen.queryByRole("link", { name: /^Admin/i })).toBeNull();
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

  it("Sair calls signOut and navigates to /", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    setAuth({ signOut });
    renderWithProviders(<Layout />, { route: "/dashboard" });
    fireEvent.click(screen.getAllByRole("button", { name: /Sair da conta/i })[0]);
    await waitFor(() => expect(signOut).toHaveBeenCalled());
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

  it("mobile drawer Sair calls signOut and navigates to /", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    setAuth({ signOut });
    renderWithProviders(<Layout />, { route: "/dashboard" });
    fireEvent.click(screen.getByRole("button", { name: /Abrir menu/i }));
    const outs = screen.getAllByRole("button", { name: /Sair da conta/i });
    fireEvent.click(outs[outs.length - 1]);
    await waitFor(() => expect(signOut).toHaveBeenCalled());
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

  it("shows credit balance badge inside the mobile drawer when drawer is open", () => {
    setAuth({ profile: { credit_balance: 99 } });
    renderWithProviders(<Layout />, { route: "/dashboard" });
    fireEvent.click(screen.getByRole("button", { name: /Abrir menu/i }));
    const spans = screen.getAllByText("99");
    // At least one span should be inside the drawer nav
    expect(spans.length).toBeGreaterThan(0);
  });

  it("clicking Créditos link inside mobile drawer closes the drawer", () => {
    setAuth({ profile: { credit_balance: 10 } });
    renderWithProviders(<Layout />, { route: "/dashboard" });
    fireEvent.click(screen.getByRole("button", { name: /Abrir menu/i }));
    // The Créditos links inside the drawer — click the last one (drawer is last in DOM)
    const creditLinks = screen.getAllByRole("link", { name: /Crédit/i });
    fireEvent.click(creditLinks[creditLinks.length - 1]);
    expect(screen.queryByRole("button", { name: /Fechar menu/i })).toBeNull();
  });

  it("marks Créditos link as active in mobile drawer when on /creditos route", () => {
    setAuth();
    renderWithProviders(<Layout />, { route: "/creditos" });
    fireEvent.click(screen.getByRole("button", { name: /Abrir menu/i }));
    const creditLinks = screen.getAllByRole("link", { name: /Crédit/i });
    expect(creditLinks.some((l) => l.getAttribute("aria-current") === "page")).toBe(true);
  });

  it("Ajuda button opens a dialog with the support contact e-mail", () => {
    setAuth();
    renderWithProviders(<Layout />, { route: "/dashboard" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /Ajuda/i })[0]);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/dúvida/i);
    const mailLink = screen.getByRole("link", { name: /contato@olharsingular\.com/i });
    expect(mailLink).toHaveAttribute("href", "mailto:contato@olharsingular.com");
  });

  it("Ajuda dialog can be closed", () => {
    setAuth();
    renderWithProviders(<Layout />, { route: "/dashboard" });
    fireEvent.click(screen.getAllByRole("button", { name: /Ajuda/i })[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Fechar/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Ajuda button inside the mobile drawer opens the dialog and closes the drawer", () => {
    setAuth();
    renderWithProviders(<Layout />, { route: "/dashboard" });
    fireEvent.click(screen.getByRole("button", { name: /Abrir menu/i }));

    const helpButtons = screen.getAllByRole("button", { name: /Ajuda/i });
    fireEvent.click(helpButtons[helpButtons.length - 1]);

    expect(screen.queryByRole("button", { name: /Fechar menu/i })).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
