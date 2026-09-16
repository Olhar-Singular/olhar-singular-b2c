import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PricingSection from "./PricingSection";
import { DEFAULT_PLANS, adaptationsRange, publicPlans } from "@/lib/domain/subscriptionUi";
import { renderWithProviders } from "@/test/helpers";

const { mockUsePlans } = vi.hoisted(() => ({ mockUsePlans: vi.fn() }));
vi.mock("@/hooks/useSubscription", () => ({ usePlans: mockUsePlans }));

describe("PricingSection helpers", () => {
  it("estimates adaptations from the 5 to 12 credit cost", () => {
    expect(adaptationsRange(300)).toBe("25 a 60 adaptações por mês");
    expect(adaptationsRange(480)).toBe("40 a 96 adaptações por mês");
    expect(adaptationsRange(900)).toBe("75 a 180 adaptações por mês");
  });

  it("falls back to the seeded catalogue and hides admin-only plans", () => {
    expect(publicPlans(undefined)).toBe(DEFAULT_PLANS);
    expect(publicPlans([])).toBe(DEFAULT_PLANS);
    const smoke = { ...DEFAULT_PLANS[0], id: "t", slug: "teste-admin", adminOnly: true };
    expect(publicPlans([smoke])).toBe(DEFAULT_PLANS);
    expect(publicPlans([DEFAULT_PLANS[1], smoke])).toEqual([DEFAULT_PLANS[1]]);
  });
});

describe("PricingSection", () => {
  beforeEach(() => {
    mockUsePlans.mockReturnValue({ data: undefined, isLoading: true });
  });

  it("renders the section heading", () => {
    renderWithProviders(<PricingSection />);
    expect(screen.getByRole("heading", { name: /Planos e preços/i })).toBeInTheDocument();
  });

  it("renders the 7-day trial with card, pointing to /assinar?trial=1 and naming the plan that follows", () => {
    renderWithProviders(<PricingSection />);
    expect(screen.getByText("Teste grátis")).toBeInTheDocument();
    expect(screen.getByText(/7 dias · 50 créditos/)).toBeInTheDocument();
    expect(screen.getByText(/Cartão obrigatório\. Nada é cobrado por 7 dias/)).toBeInTheDocument();
    expect(screen.getByText(/Depois, R\$\s*39,90\/mês \(300 créditos\)\. Cancele antes e não paga nada\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Testar 7 dias grátis/i })).toHaveAttribute("href", "/assinar?trial=1");
    expect(screen.queryByText(/convite/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /mailto/ })).toBeNull();
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("follows the catalogue for the plan after the trial", () => {
    mockUsePlans.mockReturnValue({
      data: [{ id: "x", slug: "unico", name: "Único", priceBrl: 42, monthlyCredits: 120, highlight: false, adminOnly: false }],
      isLoading: false,
    });
    renderWithProviders(<PricingSection />);
    expect(screen.getByText(/Depois, R\$\s*42,00\/mês \(120 créditos\)/)).toBeInTheDocument();
  });

  it("renders the three monthly plans with prices even before the catalogue loads", () => {
    renderWithProviders(<PricingSection />);
    expect(screen.getAllByText(/R\$\s*39,90/).length).toBe(2);
    expect(screen.getByText(/R\$\s*99,90/)).toBeInTheDocument();
    // 59,90 is also the price of the 300-credit extra package.
    expect(screen.getAllByText(/R\$\s*59,90/).length).toBe(2);
    expect(screen.getByText(/300 créditos por mês/)).toBeInTheDocument();
    expect(screen.getByText(/480 créditos por mês/)).toBeInTheDocument();
    expect(screen.getByText(/900 créditos por mês/)).toBeInTheDocument();
  });

  it("renders the catalogue from the database when it arrives", () => {
    mockUsePlans.mockReturnValue({
      data: [{ id: "x", slug: "unico", name: "Único", priceBrl: 42, monthlyCredits: 120, highlight: false, adminOnly: false }],
      isLoading: false,
    });
    renderWithProviders(<PricingSection />);
    // 42,00 is also the trial card's "Depois, ..." price, since Único is the only (cheapest) plan.
    expect(screen.getAllByText(/R\$\s*42,00/).length).toBe(2);
    expect(screen.queryByText(/R\$\s*39,90/)).toBeNull();
    expect(screen.getByRole("link", { name: /Assinar/ })).toHaveAttribute("href", "/assinar?plano=unico");
  });

  it("tracks the catalogue once per data identity, not per render", () => {
    window.dataLayer = [];
    const { rerender } = renderWithProviders(<PricingSection />);
    rerender(<PricingSection />);
    rerender(<PricingSection />);
    expect(window.dataLayer.filter((e) => (e as { event: string }).event === "view_item_list")).toHaveLength(1);
  });

  it("flags the highlighted (Profissional) plan as Popular", () => {
    renderWithProviders(<PricingSection />);
    expect(screen.getByText(/Popular/i)).toBeInTheDocument();
  });

  it("each Assinar CTA links to /assinar with the plan slug and tracks the selection", async () => {
    const user = userEvent.setup();
    window.dataLayer = [];
    renderWithProviders(<PricingSection />);
    expect(window.dataLayer[0]).toMatchObject({ event: "view_item_list", items: [{ item_id: "basico" }, { item_id: "profissional" }, { item_id: "avancado" }] });
    const links = screen.getAllByRole("link", { name: /Assinar/i });
    await user.click(links[1]);
    expect(window.dataLayer.at(-1)).toMatchObject({ event: "select_item", items: [{ item_id: "profissional" }] });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/assinar?plano=basico",
      "/assinar?plano=profissional",
      "/assinar?plano=avancado",
    ]);
  });

  it("mentions the extra packages as one-off top-ups", () => {
    renderWithProviders(<PricingSection />);
    expect(screen.getByText(/30 por R\$ 9,90/)).toBeInTheDocument();
    expect(screen.getByText(/300 por R\$ 59,90/)).toBeInTheDocument();
    expect(screen.getByText(/Pix ou cartão, que não expiram/)).toBeInTheDocument();
  });
});
