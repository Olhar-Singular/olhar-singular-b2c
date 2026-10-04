import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LandingFooter from "./LandingFooter";
import { ConsentBanner } from "@/components/common/ConsentBanner";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION, DENIED_ALL, GRANTED_ALL, resetConsentSession } from "@/lib/analytics/consent";
import { renderWithProviders } from "@/test/helpers";

// Built from code points so this file itself carries no dash character.
const DASHES = new RegExp(`${String.fromCharCode(0x2014)}|${String.fromCharCode(0x2013)}`);

vi.mock("@/assets/logo-olho-transparent.png", () => ({ default: "stub://logo.png" }));
vi.mock("@/lib/analytics/boot", async (orig) => {
  const actual = await orig<typeof import("@/lib/analytics/boot")>();
  return { ...actual, bootAnalytics: vi.fn() };
});

describe("LandingFooter", () => {
  beforeEach(() => {
    window.dataLayer = [];
    resetConsentSession();
    window.localStorage.clear();
  });

  it("renders the contentinfo footer landmark", () => {
    renderWithProviders(<LandingFooter />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("reserves room under the last paragraph for the fixed mobile bar, only below 760px", () => {
    renderWithProviders(<LandingFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass("pb-[calc(6.5rem+env(safe-area-inset-bottom))]", "min-[760px]:pb-10");
  });

  it("links the brand back to home with the logo (sized, lazy) and the name", () => {
    renderWithProviders(<LandingFooter />);
    const brand = screen.getByRole("link", { name: "Olhar Singular: página inicial" });
    expect(brand).toHaveAttribute("href", "/");
    const logo = within(brand).getByRole("img", { hidden: true });
    expect(logo).toHaveAttribute("src", "stub://logo.png");
    expect(logo).toHaveAttribute("alt", "Olhar Singular");
    expect(logo).toHaveAttribute("width", "32");
    expect(logo).toHaveAttribute("height", "32");
    expect(logo).toHaveAttribute("loading", "lazy");
    expect(logo).toHaveAttribute("decoding", "async");
    expect(within(brand).getByText("Olhar Singular")).toBeInTheDocument();
  });

  it("prints the company CNPJ literally", () => {
    renderWithProviders(<LandingFooter />);
    expect(screen.getByText("CNPJ 66.792.955/0001-37")).toBeInTheDocument();
  });

  it("labels the institutional nav and lists its links in order", () => {
    renderWithProviders(<LandingFooter />);
    const nav = screen.getByRole("navigation", { name: "Links institucionais" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Entrar", "/auth"],
      ["Planos", "#precos"],
      ["Termos de Uso", "/termos"],
      ["Privacidade", "/privacidade"],
      ["Reembolso", "/reembolso"],
    ]);
  });

  it("ends the institutional nav with Preferências de cookies, a button styled like its neighbours (LGPD)", () => {
    renderWithProviders(<LandingFooter />);
    const nav = screen.getByRole("navigation", { name: "Links institucionais" });
    const entries = Array.from(nav.children).map((el) => el.textContent);
    expect(entries.slice(-2)).toEqual(["Reembolso", "Preferências de cookies"]);
    const button = within(nav).getByRole("button", { name: "Preferências de cookies" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("min-h-[44px]", "text-lp-ink-2", "hover:text-lp-teal-text");
  });

  it("reopens the consent banner over a stored decision and hands the focus back to the button after the new decision", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: CONSENT_VERSION, consent: DENIED_ALL, decidedAt: "2026-10-01T00:00:00.000Z" }),
    );
    renderWithProviders(
      <>
        <LandingFooter />
        <ConsentBanner />
      </>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    const button = screen.getByRole("button", { name: "Preferências de cookies" });
    await user.click(button);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Cookies e medição");
    expect(screen.getByRole("button", { name: "Só essenciais" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
    expect(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY)!).consent).toEqual(GRANTED_ALL);
  });

  it("offers no public signup link and fires no cta_click from its links", () => {
    renderWithProviders(<LandingFooter />);
    expect(screen.queryByRole("link", { name: /Criar conta/i })).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Links institucionais" });
    for (const link of within(nav).getAllByRole("link")) {
      fireEvent.click(link);
    }
    expect(window.dataLayer).toEqual([]);
  });

  it("includes the pedagogical disclaimer", () => {
    renderWithProviders(<LandingFooter />);
    expect(
      screen.getByText("Ferramenta pedagógica. Não realiza diagnóstico. A decisão final é sempre do profissional."),
    ).toBeInTheDocument();
  });

  it("does not print the support e-mail nor offer a contact link", () => {
    const { container } = renderWithProviders(<LandingFooter />);
    expect(container.textContent).not.toMatch(/contato@olharsingular\.com/);
    expect(screen.queryByRole("link", { name: /Contato/i })).toBeNull();
  });

  it("has no em/en dashes and no inline styles", () => {
    const { container } = renderWithProviders(<LandingFooter />);
    expect(container.innerHTML).not.toMatch(DASHES);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
