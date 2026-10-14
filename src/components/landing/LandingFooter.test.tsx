import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LandingFooter from "./LandingFooter";
import { ConsentBanner } from "@/components/common/ConsentBanner";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION, DENIED_ALL, GRANTED_ALL, resetConsentSession } from "@/lib/analytics/consent";
import { renderWithProviders } from "@/test/helpers";

vi.mock("@/assets/logo-olho-transparent.png", () => ({ default: "stub://logo.png" }));
vi.mock("@/lib/analytics/boot", async (orig) => {
  const actual = await orig<typeof import("@/lib/analytics/boot")>();
  return { ...actual, bootAnalytics: vi.fn() };
});

describe("LandingFooter", () => {
  it("renders the contentinfo footer landmark", () => {
    renderWithProviders(<LandingFooter />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("renders Entrar and Planos links (no public signup)", () => {
    renderWithProviders(<LandingFooter />);
    expect(screen.getByRole("link", { name: /Entrar/i })).toHaveAttribute("href", "/auth");
    expect(screen.getByRole("link", { name: /Planos/i })).toHaveAttribute("href", "#precos");
    expect(screen.queryByRole("link", { name: /Criar conta/i })).toBeNull();
  });

  it("includes the pedagogical disclaimer", () => {
    renderWithProviders(<LandingFooter />);
    expect(screen.getByText(/decisão final/i)).toBeInTheDocument();
  });

  it("links the logo back to home", () => {
    renderWithProviders(<LandingFooter />);
    const homeLinks = screen.getAllByRole("link").filter((l) => l.getAttribute("href") === "/");
    expect(homeLinks.length).toBeGreaterThan(0);
  });
});

describe("LandingFooter (legal)", () => {
  it("links the legal pages and names the company", () => {
    renderWithProviders(<LandingFooter />);
    expect(screen.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "/privacidade");
    expect(screen.getByRole("link", { name: "Reembolso" })).toHaveAttribute("href", "/reembolso");
    expect(screen.getByText(/CNPJ/)).toBeInTheDocument();
  });

  it("does not print the support e-mail", () => {
    renderWithProviders(<LandingFooter />);
    expect(screen.queryByText(/contato@olharsingular\.com/)).not.toBeInTheDocument();
  });
});

describe("LandingFooter (Preferências de cookies)", () => {
  beforeEach(() => {
    resetConsentSession();
    window.localStorage.clear();
  });

  it("ends the footer links with Preferências de cookies, a button styled like its neighbours", () => {
    renderWithProviders(<LandingFooter />);
    const nav = screen.getByRole("navigation", { name: "Links do rodapé" });
    const entries = Array.from(nav.children).map((el) => el.textContent);
    expect(entries.slice(-2)).toEqual(["Reembolso", "Preferências de cookies"]);
    const button = within(nav).getByRole("button", { name: "Preferências de cookies" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("hover:text-foreground", "transition-colors");
  });

  it("reopens the consent banner over a stored decision and hands the focus back to the button after the new decision", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, consent: DENIED_ALL, decidedAt: "x" }));
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
});
