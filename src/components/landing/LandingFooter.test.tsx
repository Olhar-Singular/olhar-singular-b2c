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

  it("renders Entrar and Criar conta links", () => {
    renderWithProviders(<LandingFooter />);
    const entrar = screen.getByRole("link", { name: /Entrar/i });
    expect(entrar).toHaveAttribute("href", "/auth");
    const signup = screen.getByRole("link", { name: /Criar conta/i });
    expect(signup).toHaveAttribute("href", "/auth?signup=1");
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
