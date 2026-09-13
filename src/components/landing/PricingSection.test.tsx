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
    expect(adaptationsRange(60)).toBe("5 a 12 adaptações por mês");
    expect(adaptationsRange(240)).toBe("20 a 48 adaptações por mês");
    expect(adaptationsRange(500)).toBe("41 a 100 adaptações por mês");
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

  it("renders the 7-day trial as invite-only, with no signup link", () => {
    renderWithProviders(<PricingSection />);
    expect(screen.getByText(/7 dias, por convite/i)).toBeInTheDocument();
    expect(screen.getByText(/50 créditos para experimentar/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pedir um convite/i })).toHaveAttribute(
      "href",
      expect.stringMatching(/^mailto:/),
    );
    expect(screen.queryByText(/grátis/i)).toBeNull();
    expect(screen.queryByText(/nunca expiram/i)).toBeNull();
  });

  it("renders the three monthly plans with prices even before the catalogue loads", () => {
    renderWithProviders(<PricingSection />);
    expect(screen.getByText(/R\$\s*19,90/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*99,90/)).toBeInTheDocument();
    // 59,90 is also the price of the 300-credit extra package.
    expect(screen.getAllByText(/R\$\s*59,90/).length).toBe(2);
    expect(screen.getByText(/240 créditos por mês/)).toBeInTheDocument();
  });

  it("renders the catalogue from the database when it arrives", () => {
    mockUsePlans.mockReturnValue({
      data: [{ id: "x", slug: "unico", name: "Único", priceBrl: 42, monthlyCredits: 120, highlight: false, adminOnly: false }],
      isLoading: false,
    });
    renderWithProviders(<PricingSection />);
    expect(screen.getByText(/R\$\s*42,00/)).toBeInTheDocument();
    expect(screen.queryByText(/R\$\s*19,90/)).toBeNull();
    expect(screen.getByRole("link", { name: /Assinar/ })).toHaveAttribute("href", "/assinar?plano=unico");
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
