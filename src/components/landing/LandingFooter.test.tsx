import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import LandingFooter from "./LandingFooter";
import { renderWithProviders } from "@/test/helpers";

vi.mock("@/assets/logo-olho-transparent.png", () => ({ default: "stub://logo.png" }));

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
