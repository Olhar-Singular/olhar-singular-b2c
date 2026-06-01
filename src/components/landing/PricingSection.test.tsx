import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import PricingSection from "./PricingSection";
import { renderWithProviders } from "@/test/helpers";

describe("PricingSection", () => {
  it("renders the section heading", () => {
    renderWithProviders(<PricingSection />);
    expect(screen.getByRole("heading", { name: /Planos e preços/i })).toBeInTheDocument();
  });

  it("renders the free tier with 50 free credits and a signup CTA", () => {
    renderWithProviders(<PricingSection />);
    expect(screen.getByText(/Grátis/)).toBeInTheDocument();
    expect(screen.getByText(/50 créditos grátis ao cadastrar/i)).toBeInTheDocument();
  });

  it("renders all three paid packages with prices", () => {
    renderWithProviders(<PricingSection />);
    expect(screen.getByText(/R\$\s*9,90/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*29,90/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*59,90/)).toBeInTheDocument();
  });

  it("shows adaptation estimates consistent with the real 5–12 credit cost", () => {
    renderWithProviders(<PricingSection />);
    // 30 credits ÷ (5–12 per adaptation) ≈ 3–6, not the legacy ~10 (which assumed 3/each)
    expect(screen.getByText(/3 a 6 adaptações/i)).toBeInTheDocument();
    expect(screen.queryByText(/~10 adaptações/i)).not.toBeInTheDocument();
  });

  it("flags the highlighted (Profissional) package as Popular", () => {
    renderWithProviders(<PricingSection />);
    expect(screen.getByText(/Popular/i)).toBeInTheDocument();
  });

  it("each Comprar CTA links to /auth", () => {
    renderWithProviders(<PricingSection />);
    const links = screen.getAllByRole("link", { name: /Comprar/i });
    expect(links.length).toBe(3);
    links.forEach((l) => expect(l).toHaveAttribute("href", "/auth"));
  });
});
