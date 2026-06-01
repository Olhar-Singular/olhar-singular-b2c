import { screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import LandingPage from "./LandingPage";
import { renderWithProviders } from "@/test/helpers";

function renderLanding() {
  return renderWithProviders(<LandingPage />);
}

describe("LandingPage", () => {
  it("renders main headline as h1", () => {
    renderLanding();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("each CTA 'Começar grátis' links to /auth?signup=1", () => {
    renderLanding();
    const links = screen.getAllByRole("link", { name: /começar grátis/i });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((l) => expect(l).toHaveAttribute("href", "/auth?signup=1"));
  });

  it("renders the three paid packages with prices", () => {
    renderLanding();
    expect(screen.getByText(/R\$\s*9,90/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*29,90/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*59,90/)).toBeInTheDocument();
  });

  it("advertises 50 free credits at signup", () => {
    renderLanding();
    const matches = screen.getAllByText(/50 créditos grátis/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("footer carries pedagogical disclaimer", () => {
    renderLanding();
    expect(screen.getByText(/decisão final/i)).toBeInTheDocument();
  });

  it("provides at least one login route (not signup) for returning users", () => {
    renderLanding();
    const allLinks = screen.getAllByRole("link");
    const loginLinks = allLinks.filter((l) => {
      const href = l.getAttribute("href") ?? "";
      return href.startsWith("/auth") && !href.includes("signup");
    });
    expect(loginLinks.length).toBeGreaterThan(0);
  });

  it("renders multiple section headings (h2) for landing structure", () => {
    renderLanding();
    const h2s = screen.getAllByRole("heading", { level: 2 });
    expect(h2s.length).toBeGreaterThanOrEqual(3);
  });
});
