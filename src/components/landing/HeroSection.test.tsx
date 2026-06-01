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

  it("primary CTA links to /auth?signup=1", () => {
    renderWithProviders(<HeroSection />);
    const link = screen.getByRole("link", { name: /Começar grátis/i });
    expect(link).toHaveAttribute("href", "/auth?signup=1");
  });

  it("secondary anchor links to #como-funciona", () => {
    renderWithProviders(<HeroSection />);
    const anchor = screen.getByRole("link", { name: /Ver como funciona/i });
    expect(anchor).toHaveAttribute("href", "#como-funciona");
  });

  it("mentions 50 free credits in the badge", () => {
    renderWithProviders(<HeroSection />);
    expect(screen.getByText(/50 créditos grátis/i)).toBeInTheDocument();
  });
});
