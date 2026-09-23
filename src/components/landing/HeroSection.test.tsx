import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import HeroSection from "./HeroSection";
import { renderWithProviders } from "@/test/helpers";

vi.mock("@/assets/hero-classroom.png", () => ({ default: "stub://hero.png" }));

describe("HeroSection", () => {
  it("renders the main h1", () => {
    renderWithProviders(<HeroSection />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent?.length).toBeGreaterThan(0);
  });

  it("primary CTA points to the pricing section (no public signup)", () => {
    renderWithProviders(<HeroSection />);
    const link = screen.getByRole("link", { name: /Ver planos/i });
    expect(link).toHaveAttribute("href", "#precos");
    expect(screen.queryByRole("link", { name: /Começar grátis/i })).toBeNull();
  });

  it("secondary anchor links to #como-funciona", () => {
    renderWithProviders(<HeroSection />);
    const anchor = screen.getByRole("link", { name: /Ver como funciona/i });
    expect(anchor).toHaveAttribute("href", "#como-funciona");
  });

  it("announces monthly plans and extra credits in the badge, never a free signup", () => {
    renderWithProviders(<HeroSection />);
    expect(screen.getByText(/planos mensais e créditos avulsos/i)).toBeInTheDocument();
    expect(screen.queryByText(/grátis/i)).toBeNull();
  });
});
