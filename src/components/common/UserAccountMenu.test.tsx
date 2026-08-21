import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { UserAccountMenu } from "./UserAccountMenu";
import { renderWithProviders, buildAuthState } from "@/test/helpers";
import { SUPPORT_EMAIL } from "@/lib/constants";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
import { useAuth } from "@/hooks/useAuth";

const setThemeMock = vi.fn();
const themeState = { theme: "light" as string | undefined };
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: themeState.theme, setTheme: setThemeMock }),
}));

function setAuth(over: Record<string, unknown> = {}) {
  vi.mocked(useAuth).mockReturnValue(
    buildAuthState({ user: { email: "professora@escola.com" }, ...over }) as never,
  );
}

function openMenu() {
  const trigger = screen.getByRole("button", { name: /menu da conta/i });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
}

beforeEach(() => {
  vi.clearAllMocks();
  themeState.theme = "light";
});

describe("UserAccountMenu", () => {
  it("shows the user's email on the trigger", () => {
    setAuth();
    renderWithProviders(<UserAccountMenu onLogout={vi.fn()} />);
    expect(screen.getByText("professora@escola.com")).toBeInTheDocument();
  });

  it("shows initials from first + last name when full_name has multiple words", () => {
    setAuth({ profile: { full_name: "Ana Silva" } });
    renderWithProviders(<UserAccountMenu onLogout={vi.fn()} />);
    expect(screen.getByText("AS")).toBeInTheDocument();
  });

  it("shows just the first letter when full_name is a single word", () => {
    setAuth({ profile: { full_name: "Ana" } });
    renderWithProviders(<UserAccountMenu onLogout={vi.fn()} />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("falls back to the email's first letter when there is no full_name", () => {
    setAuth({ profile: { full_name: null } });
    renderWithProviders(<UserAccountMenu onLogout={vi.fn()} />);
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("falls back to '?' when there is neither full_name nor email", () => {
    setAuth({ user: null, profile: null });
    renderWithProviders(<UserAccountMenu onLogout={vi.fn()} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("opens to reveal 'Comprar créditos' linking to /creditos", async () => {
    setAuth();
    renderWithProviders(<UserAccountMenu onLogout={vi.fn()} />);
    openMenu();
    await waitFor(() => {
      const link = screen.getByRole("menuitem", { name: /Comprar créditos/i });
      expect(link.closest("a")).toHaveAttribute("href", "/creditos");
    });
  });

  it("shows the dark-theme switch unchecked when theme is light", async () => {
    setAuth();
    renderWithProviders(<UserAccountMenu onLogout={vi.fn()} />);
    openMenu();
    await waitFor(() => expect(screen.getByRole("switch")).not.toBeChecked());
  });

  it("shows the dark-theme switch checked when theme is dark", async () => {
    setAuth();
    themeState.theme = "dark";
    renderWithProviders(<UserAccountMenu onLogout={vi.fn()} />);
    openMenu();
    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
  });

  it("toggling the switch on (light -> dark) calls setTheme('dark')", async () => {
    setAuth();
    renderWithProviders(<UserAccountMenu onLogout={vi.fn()} />);
    openMenu();
    await waitFor(() => screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("switch"));
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });

  it("toggling the switch off (dark -> light) calls setTheme('light')", async () => {
    setAuth();
    themeState.theme = "dark";
    renderWithProviders(<UserAccountMenu onLogout={vi.fn()} />);
    openMenu();
    await waitFor(() => screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("switch"));
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });

  it("shows the support email", async () => {
    setAuth();
    renderWithProviders(<UserAccountMenu onLogout={vi.fn()} />);
    openMenu();
    await waitFor(() => expect(screen.getAllByText(SUPPORT_EMAIL).length).toBeGreaterThan(0));
  });

  it("'Entrar em contato' is a mailto: link to the support email", async () => {
    setAuth();
    renderWithProviders(<UserAccountMenu onLogout={vi.fn()} />);
    openMenu();
    await waitFor(() => {
      const link = screen.getByRole("menuitem", { name: /Entrar em contato/i });
      expect(link.closest("a")).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    });
  });

  it("clicking Sair calls onLogout", async () => {
    setAuth();
    const onLogout = vi.fn();
    renderWithProviders(<UserAccountMenu onLogout={onLogout} />);
    openMenu();
    await waitFor(() => fireEvent.click(screen.getByText(/^Sair$/i)));
    expect(onLogout).toHaveBeenCalled();
  });
});
