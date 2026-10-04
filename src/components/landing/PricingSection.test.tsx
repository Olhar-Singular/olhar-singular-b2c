import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import PricingSection from "./PricingSection";
import {
  ADAPTATION_COST_LABEL,
  DEFAULT_PACKAGES,
  DEFAULT_PLANS,
  EXTRAS_REFUND_DAYS,
  REFUND_WINDOW_DAYS,
  TRIAL_CREDITS,
  TRIAL_DAYS,
} from "@/lib/domain/subscriptionUi";
import { renderWithProviders } from "@/test/helpers";

const { mockUsePlans, mockUsePackages, catalogue } = vi.hoisted(() => ({
  mockUsePlans: vi.fn(),
  mockUsePackages: vi.fn(),
  // Flips publicPlans to an empty list: the defensive "no plan to name after the trial" case.
  catalogue: { empty: false },
}));
vi.mock("@/hooks/useSubscription", () => ({ usePlans: mockUsePlans }));
vi.mock("@/hooks/useCredits", () => ({ usePackages: mockUsePackages }));
vi.mock("@/lib/domain/subscriptionUi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/domain/subscriptionUi")>();
  return { ...actual, publicPlans: (rows: Parameters<typeof actual.publicPlans>[0]) => (catalogue.empty ? [] : actual.publicPlans(rows)) };
});

const SINGLE_PLAN = { id: "x", slug: "unico", name: "Único", priceBrl: 42, monthlyCredits: 120, highlight: false, adminOnly: false };

function events(name: string) {
  return (window.dataLayer ?? []).filter((e) => (e as { event?: string }).event === name);
}

describe("PricingSection", () => {
  beforeEach(() => {
    catalogue.empty = false;
    window.dataLayer = [];
    mockUsePlans.mockReturnValue({ data: undefined, isPending: true });
    mockUsePackages.mockReturnValue({ data: undefined, isPending: true });
  });

  describe("section frame", () => {
    it("is the #precos anchor target, labelled by its h2, with room under the sticky header", () => {
      renderWithProviders(<PricingSection />);
      const heading = screen.getByRole("heading", { level: 2, name: /Planos e preços/i });
      const region = screen.getByRole("region", { name: /Planos e preços/i });
      expect(region).toContainElement(heading);
      expect(region).toHaveAttribute("id", "precos");
      expect(region).toHaveAttribute("aria-labelledby", heading.id);
      expect(region).toHaveClass("scroll-mt-20");
    });

    it("never renders template tokens, undefined, NaN or dashes", () => {
      renderWithProviders(<PricingSection />);
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(/\{\{|undefined|NaN/);
      // Em dash and en dash, spelled as code points so this file stays free of them.
      expect(text).not.toMatch(new RegExp(`[${String.fromCodePoint(0x2014, 0x2013)}]`));
    });
  });

  describe("trial card", () => {
    it("is the first card and states the trial terms from the constants", () => {
      renderWithProviders(<PricingSection />);
      const cards = screen.getAllByRole("article");
      const trial = cards[0];
      expect(within(trial).getByRole("heading", { level: 3, name: `Teste grátis ${TRIAL_DAYS} dias` })).toBeInTheDocument();
      expect(within(trial).getByText(`${TRIAL_CREDITS} créditos`)).toBeInTheDocument();
      expect(
        within(trial).getByText(
          `Cartão obrigatório. Nada é cobrado por ${TRIAL_DAYS} dias; a cobrança começa no ${TRIAL_DAYS + 1}º dia.`,
        ),
      ).toBeInTheDocument();
    });

    it("states each trial fact once: the credits, the card requirement and the cancel-before-paying promise", () => {
      renderWithProviders(<PricingSection />);
      const trial = screen.getAllByRole("article")[0];
      expect(within(trial).getAllByText(new RegExp(`\\b${TRIAL_CREDITS} créditos`))).toHaveLength(1);
      expect(within(trial).getAllByText(/Cartão obrigatório/)).toHaveLength(1);
      expect(within(trial).getAllByText(/não paga nada/)).toHaveLength(1);
      expect(within(trial).getAllByRole("listitem")).toHaveLength(2);
    });

    it("names the cheapest public plan as the one that follows", () => {
      renderWithProviders(<PricingSection />);
      expect(screen.getByText(/Depois, R\$\s*39,90\/mês \(300 créditos\)\. Cancele antes e não paga nada\./)).toBeInTheDocument();
    });

    it("follows the catalogue for the plan after the trial", () => {
      mockUsePlans.mockReturnValue({ data: [SINGLE_PLAN], isPending: false });
      renderWithProviders(<PricingSection />);
      expect(screen.getByText(/Depois, R\$\s*42,00\/mês \(120 créditos\)/)).toBeInTheDocument();
    });

    it("omits the 'Depois' line when there is no plan to name, keeping the trial CTA", () => {
      catalogue.empty = true;
      renderWithProviders(<PricingSection />);
      expect(screen.queryByText(/Depois,/)).toBeNull();
      expect(screen.getByRole("link", { name: /Testar 7 dias grátis/ })).toHaveAttribute("href", "/assinar?trial=1");
      expect(screen.getAllByRole("article")).toHaveLength(1);
    });

    it("links to /assinar?trial=1 and emits cta_click from 'planos'", () => {
      renderWithProviders(<PricingSection />);
      const cta = screen.getByRole("link", { name: /Testar 7 dias grátis/ });
      expect(cta).toHaveAttribute("href", "/assinar?trial=1");
      window.dataLayer = [];
      fireEvent.click(cta);
      expect(window.dataLayer).toEqual([{ event: "cta_click", origem: "planos" }]);
    });
  });

  describe("monthly plans", () => {
    it("renders the seeded plans with price and credits before the catalogue loads (never an empty grid)", () => {
      renderWithProviders(<PricingSection />);
      const cards = screen.getAllByRole("article");
      expect(cards).toHaveLength(1 + DEFAULT_PLANS.length);
      const [basico, profissional, avancado] = cards.slice(1);
      expect(within(basico).getByRole("heading", { level: 3, name: "Básico" })).toBeInTheDocument();
      expect(within(basico).getByText(/R\$\s*39,90/)).toBeInTheDocument();
      expect(within(basico).getByText("300 créditos por mês")).toBeInTheDocument();
      expect(within(basico).getByText("25 a 60 adaptações por mês")).toBeInTheDocument();
      expect(within(profissional).getByText(/R\$\s*59,90/)).toBeInTheDocument();
      expect(within(profissional).getByText("480 créditos por mês")).toBeInTheDocument();
      expect(within(profissional).getByText("40 a 96 adaptações por mês")).toBeInTheDocument();
      expect(within(avancado).getByText(/R\$\s*99,90/)).toBeInTheDocument();
      expect(within(avancado).getByText("900 créditos por mês")).toBeInTheDocument();
      expect(within(avancado).getByText("75 a 180 adaptações por mês")).toBeInTheDocument();
    });

    it("falls back to the seeded plans when the catalogue is empty", () => {
      mockUsePlans.mockReturnValue({ data: [], isPending: false });
      renderWithProviders(<PricingSection />);
      expect(screen.getAllByRole("article")).toHaveLength(1 + DEFAULT_PLANS.length);
    });

    it("renders the catalogue from the database when it arrives", () => {
      mockUsePlans.mockReturnValue({ data: [SINGLE_PLAN], isPending: false });
      renderWithProviders(<PricingSection />);
      const cards = screen.getAllByRole("article");
      expect(cards).toHaveLength(2);
      expect(within(cards[1]).getByRole("heading", { level: 3, name: "Único" })).toBeInTheDocument();
      expect(within(cards[1]).getByText(/R\$\s*42,00/)).toBeInTheDocument();
      expect(within(cards[1]).getByText("120 créditos por mês")).toBeInTheDocument();
      expect(screen.queryByText(/R\$\s*39,90/)).toBeNull();
      expect(screen.getByRole("link", { name: "Assinar plano Único" })).toHaveAttribute("href", "/assinar?plano=unico");
    });

    it("hides admin-only plans", () => {
      const smoke = { ...SINGLE_PLAN, id: "s", slug: "teste-admin", name: "Fumaça", adminOnly: true };
      mockUsePlans.mockReturnValue({ data: [SINGLE_PLAN, smoke], isPending: false });
      renderWithProviders(<PricingSection />);
      expect(screen.queryByText("Fumaça")).toBeNull();
      expect(screen.getAllByRole("link", { name: /^Assinar/ })).toHaveLength(1);
    });

    it("flags only the highlighted plan as Popular", () => {
      renderWithProviders(<PricingSection />);
      const cards = screen.getAllByRole("article");
      expect(screen.getAllByText("Popular")).toHaveLength(1);
      expect(within(cards[2]).getByText("Popular")).toBeInTheDocument();
      expect(within(cards[1]).queryByText("Popular")).toBeNull();
      expect(within(cards[3]).queryByText("Popular")).toBeNull();
    });

    it("pins the Popular badge to the card edge so it takes no layout space", () => {
      renderWithProviders(<PricingSection />);
      const badge = screen.getByText("Popular");
      expect(badge).toHaveClass("absolute");
      expect(badge).not.toHaveClass("self-start");
      expect(badge.closest("article")).toHaveClass("relative");
    });

    it("never prints a price per adaptation or a zero price", () => {
      renderWithProviders(<PricingSection />);
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(/R\$\s*0\b/);
      expect(text).not.toMatch(/por adaptação/);
      expect(text).not.toMatch(/ilimitad|prioritário|nota fiscal|Melhor escolha/i);
    });

    it("states the real cost of an adaptation in credits, once, from the domain constant", () => {
      renderWithProviders(<PricingSection />);
      expect(screen.getAllByText(`Cada adaptação custa ${ADAPTATION_COST_LABEL} créditos conforme a barreira.`)).toHaveLength(1);
    });

    it("pins the adaptation cost label to the real credit tiers", () => {
      expect(ADAPTATION_COST_LABEL).toBe("5, 8 ou 12");
    });
  });

  describe("plan CTAs", () => {
    it("names each CTA after its plan so the three 'Assinar' links are distinguishable", () => {
      renderWithProviders(<PricingSection />);
      const links = screen.getAllByRole("link", { name: /^Assinar plano / });
      expect(links.map((l) => l.textContent)).toEqual([
        "Assinar plano Básico",
        "Assinar plano Profissional",
        "Assinar plano Avançado",
      ]);
      // The visible label stays the short verb.
      expect(links.map((l) => l.firstChild?.textContent?.trim())).toEqual(["Assinar", "Assinar", "Assinar"]);
    });

    it("links each Assinar to /assinar with the plan slug", () => {
      renderWithProviders(<PricingSection />);
      const links = screen.getAllByRole("link", { name: /^Assinar plano / });
      expect(links.map((l) => l.getAttribute("href"))).toEqual([
        "/assinar?plano=basico",
        "/assinar?plano=profissional",
        "/assinar?plano=avancado",
      ]);
    });

    it("encodes the slug in the plan link", () => {
      const odd = { ...SINGLE_PLAN, id: "o", slug: "plano especial", name: "Especial" };
      const amp = { ...SINGLE_PLAN, id: "a", slug: "a&b=c", name: "Combo" };
      mockUsePlans.mockReturnValue({ data: [odd, amp], isPending: false });
      renderWithProviders(<PricingSection />);
      expect(screen.getByRole("link", { name: "Assinar plano Especial" })).toHaveAttribute(
        "href",
        "/assinar?plano=plano%20especial",
      );
      expect(screen.getByRole("link", { name: "Assinar plano Combo" })).toHaveAttribute("href", "/assinar?plano=a%26b%3Dc");
    });

    it("emits cta_click from 'planos' and then select_item for the chosen plan", () => {
      renderWithProviders(<PricingSection />);
      window.dataLayer = [];
      fireEvent.click(screen.getByRole("link", { name: "Assinar plano Profissional" }));
      expect(window.dataLayer).toEqual([
        { event: "cta_click", origem: "planos" },
        expect.objectContaining({ event: "select_item", items: [expect.objectContaining({ item_id: "profissional" })] }),
      ]);
    });
  });

  describe("view_item_list tracking", () => {
    it("does not fire while the plans query is still pending (no fallback catalogue reported)", () => {
      renderWithProviders(<PricingSection />);
      expect(events("view_item_list")).toHaveLength(0);
    });

    it("fires once, with the database catalogue, when the query settles with data", () => {
      const { rerender } = renderWithProviders(<PricingSection />);
      mockUsePlans.mockReturnValue({ data: [SINGLE_PLAN], isPending: false });
      rerender(<PricingSection />);
      expect(events("view_item_list")).toHaveLength(1);
      expect(events("view_item_list")[0]).toMatchObject({ items: [{ item_id: "unico" }] });
    });

    it("fires once with the fallback catalogue, in order, when the query errored (data undefined, not pending)", () => {
      mockUsePlans.mockReturnValue({ data: undefined, isPending: false });
      renderWithProviders(<PricingSection />);
      expect(events("view_item_list")).toHaveLength(1);
      expect(events("view_item_list")[0]).toMatchObject({
        items: [{ item_id: "basico" }, { item_id: "profissional" }, { item_id: "avancado" }],
      });
    });

    it("tracks once per settled catalogue identity, not per render", () => {
      mockUsePlans.mockReturnValue({ data: [SINGLE_PLAN], isPending: false });
      const { rerender } = renderWithProviders(<PricingSection />);
      rerender(<PricingSection />);
      rerender(<PricingSection />);
      expect(events("view_item_list")).toHaveLength(1);
    });
  });

  describe("extra credits", () => {
    function extrasList() {
      return screen.getByRole("list", { name: /Créditos extras/i });
    }

    it("lists the seeded extras while the packages are loading", () => {
      renderWithProviders(<PricingSection />);
      const items = within(extrasList()).getAllByRole("listitem");
      expect(items).toHaveLength(DEFAULT_PACKAGES.length);
      expect(items[0]).toHaveTextContent(/^30 créditos por R\$\s*9,90$/);
      expect(items[1]).toHaveTextContent(/^120 créditos por R\$\s*29,90$/);
      expect(items[2]).toHaveTextContent(/^300 créditos por R\$\s*59,90$/);
    });

    it("falls back to the seeded extras when the catalogue is empty", () => {
      mockUsePackages.mockReturnValue({ data: [], isPending: false });
      renderWithProviders(<PricingSection />);
      expect(within(extrasList()).getAllByRole("listitem")).toHaveLength(DEFAULT_PACKAGES.length);
    });

    it("renders the extras from the hook (not hardcoded) and drops the admin-only one", () => {
      mockUsePackages.mockReturnValue({
        data: [
          { id: "a", credits: 75, amountBrl: 19.5, label: "Zeta", highlight: false, adminOnly: false },
          { id: "b", credits: 1, amountBrl: 1, label: "Fumaça", highlight: false, adminOnly: true },
          { id: "c", credits: 210, amountBrl: 44, label: "Ômega", highlight: true, adminOnly: false },
        ],
        isPending: false,
      });
      renderWithProviders(<PricingSection />);
      const items = within(extrasList()).getAllByRole("listitem");
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent(/^75 créditos por R\$\s*19,50$/);
      expect(items[1]).toHaveTextContent(/^210 créditos por R\$\s*44,00$/);
      expect(screen.queryByText(/30 créditos por/)).toBeNull();
    });

    it("does not reuse the package labels as if they were plans", () => {
      renderWithProviders(<PricingSection />);
      for (const item of within(extrasList()).getAllByRole("listitem")) {
        expect(item.textContent).not.toMatch(/Básico|Profissional|Avançado/);
      }
      expect(screen.getAllByRole("article")).toHaveLength(1 + DEFAULT_PLANS.length);
    });
  });

  describe("payment, renewal and refund copy", () => {
    it("explains how plan and extra credits behave", () => {
      renderWithProviders(<PricingSection />);
      expect(
        screen.getByText(
          /Os créditos do plano renovam todo mês \(o saldo do mês é substituído pela cota\)\. Os créditos extras, comprados avulsos, não expiram\./,
        ),
      ).toBeInTheDocument();
    });

    it("states the payment methods and the processor", () => {
      renderWithProviders(<PricingSection />);
      expect(
        screen.getByText(/Assinatura no cartão de crédito\. Créditos extras por Pix ou cartão\. Pagamentos via Mercado Pago\./),
      ).toBeInTheDocument();
    });

    it("states the real refund policy with both windows from the constants and the support channel", () => {
      renderWithProviders(<PricingSection />);
      expect(
        screen.getByText(
          `Estorno integral da última cobrança da assinatura, em um clique em Créditos, enquanto ativa ou até ${REFUND_WINDOW_DAYS} dias depois de cancelar. Extras não usados: até ${EXTRAS_REFUND_DAYS} dias, pelo suporte no menu da sua conta.`,
        ),
      ).toBeInTheDocument();
    });

    it("has no email link and no retired copy", () => {
      renderWithProviders(<PricingSection />);
      expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
      expect(screen.queryByText(/convite/i)).toBeNull();
      expect(screen.queryByText(/devolvemos/i)).toBeNull();
    });
  });
});
