import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "./LandingPage";

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

describe("LandingPage", () => {
  it("renders main headline", () => {
    renderLanding();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("CTA Começar grátis links to /auth?signup=1", () => {
    renderLanding();
    const links = screen.getAllByRole("link", { name: /começar grátis/i });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((l) => expect(l).toHaveAttribute("href", "/auth?signup=1"));
  });

  it("displays all three paid package prices", () => {
    renderLanding();
    expect(screen.getByText(/R\$\s*9,90/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*29,90/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*59,90/)).toBeInTheDocument();
  });

  it("displays free tier with 10 créditos grátis", () => {
    renderLanding();
    const matches = screen.getAllByText(/10 créditos grátis/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("footer shows pedagogical disclaimer", () => {
    renderLanding();
    expect(screen.getByText(/decisão final/i)).toBeInTheDocument();
  });
});
