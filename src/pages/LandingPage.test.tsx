import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import LandingPage from "./LandingPage";
import { renderWithProviders } from "@/test/helpers";

// The pricing grid falls back to the seeded catalogue while the query is loading.
vi.mock("@/hooks/useSubscription", () => ({ usePlans: () => ({ data: undefined, isLoading: true }) }));

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

  it("has no public signup: every 'Ver planos' CTA points to the pricing section", () => {
    renderLanding();
    const links = screen.getAllByRole("link", { name: /ver planos/i });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((l) => expect(l).toHaveAttribute("href", "#precos"));
    expect(screen.queryByRole("link", { name: /começar grátis/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /criar conta/i })).toBeNull();
  });

  it("renders the three monthly plans with prices", () => {
    renderLanding();
    // 19,90 also appears in the closing CTA, 59,90 also as an extra package.
    expect(screen.getAllByText(/R\$\s*19,90/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/R\$\s*59,90/).length).toBeGreaterThan(0);
    expect(screen.getByText(/R\$\s*99,90/)).toBeInTheDocument();
  });

  it("never promises free signup credits or credits that never expire", () => {
    renderLanding();
    expect(screen.queryByText(/50 créditos grátis/i)).toBeNull();
    expect(screen.queryByText(/nunca expiram/i)).toBeNull();
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
