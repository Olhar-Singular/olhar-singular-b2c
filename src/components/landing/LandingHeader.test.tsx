import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import LandingHeader from "./LandingHeader";
import { renderWithProviders } from "@/test/helpers";

vi.mock("@/assets/logo-olho-transparent.png", () => ({ default: "stub://logo.png" }));

describe("LandingHeader", () => {
  it("renders the banner header element", () => {
    renderWithProviders(<LandingHeader />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders the brand link to home", () => {
    renderWithProviders(<LandingHeader />);
    const links = screen.getAllByRole("link");
    expect(links.some((l) => l.getAttribute("href") === "/")).toBe(true);
  });

  it("renders the in-page navigation anchors", () => {
    renderWithProviders(<LandingHeader />);
    expect(screen.getByRole("link", { name: /Como funciona/i })).toHaveAttribute("href", "#como-funciona");
    expect(screen.getByRole("link", { name: /Preços/i })).toHaveAttribute("href", "#precos");
    expect(screen.getByRole("link", { name: /FAQ/i })).toHaveAttribute("href", "#faq");
  });

  it("has Entrar and Começar grátis CTAs pointing to /auth", () => {
    renderWithProviders(<LandingHeader />);
    expect(screen.getByRole("link", { name: /Entrar/i })).toHaveAttribute("href", "/auth");
    expect(screen.getByRole("link", { name: /Começar grátis/i })).toHaveAttribute("href", "/auth?signup=1");
  });
});
