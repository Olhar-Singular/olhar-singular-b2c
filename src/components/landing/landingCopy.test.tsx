import { act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import LandingPage from "@/pages/LandingPage";
import { CONSENT_STORAGE_KEY, GRANTED_ALL, resetConsentSession, storeConsent } from "@/lib/analytics/consent";
import { MAX_ACTIVITY_CHARS } from "@/lib/domain/activityLimits";
import { EXTRACTION_COST } from "@/lib/domain/extractionCost";
import {
  ADAPTATION_COST_LABEL,
  EXTRAS_REFUND_DAYS,
  REFUND_WINDOW_DAYS,
  TRIAL_CREDITS,
  TRIAL_DAYS,
} from "@/lib/domain/subscriptionUi";
import { renderWithProviders } from "@/test/helpers";

// Catalogues that differ from the seed on purpose: every price, credit count, name and slug
// the page prints must come from here, never from a literal in a component.
const { mockUsePlans, mockUsePackages, PLANS, PACKAGES } = vi.hoisted(() => ({
  mockUsePlans: vi.fn(),
  mockUsePackages: vi.fn(),
  PLANS: [
    { id: "p1", slug: "essencial", name: "Essencial", priceBrl: 41.9, monthlyCredits: 310, highlight: false, adminOnly: false },
    { id: "p2", slug: "plus", name: "Plus", priceBrl: 63.9, monthlyCredits: 490, highlight: true, adminOnly: false },
    { id: "p3", slug: "maximo", name: "Máximo", priceBrl: 103.9, monthlyCredits: 910, highlight: false, adminOnly: false },
  ],
  PACKAGES: [
    { id: "k1", credits: 35, amountBrl: 11.9, label: "Mini", highlight: false, adminOnly: false },
    { id: "k2", credits: 140, amountBrl: 31.9, label: "Médio", highlight: true, adminOnly: false },
    { id: "k3", credits: 320, amountBrl: 61.9, label: "Grande", highlight: false, adminOnly: false },
  ],
}));
vi.mock("@/hooks/useSubscription", () => ({ usePlans: mockUsePlans }));
vi.mock("@/hooks/useCredits", () => ({ usePackages: mockUsePackages }));

// Em dash and en dash, spelled as code points so this file stays free of them.
const DASHES = new RegExp(`[${String.fromCodePoint(0x2014, 0x2013)}]`);

function setScrollY(scrollY: number) {
  Object.defineProperty(window, "scrollY", { value: scrollY, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true, writable: true });
}

/** Everything a visitor or a screen reader can get: text (FAQ answers included) plus alt, aria-label and title. */
function pageText(container: HTMLElement): string {
  const attrs = Array.from(container.querySelectorAll("[alt], [aria-label], [title]")).flatMap((el) =>
    ["alt", "aria-label", "title"].map((name) => el.getAttribute(name) ?? ""),
  );
  return [container.textContent ?? "", ...attrs].join("\n");
}

function renderCopy() {
  // Scrolled past the hero so the mobile CTA bar is part of what gets inspected.
  setScrollY(2000);
  const view = renderWithProviders(<LandingPage />);
  act(() => {
    fireEvent.scroll(window);
  });
  return view;
}

describe("landing copy regression", () => {
  beforeEach(() => {
    window.dataLayer = [];
    // The consent banner is out of the way, so the mobile CTA bar is part of the page.
    resetConsentSession();
    storeConsent(window.localStorage, GRANTED_ALL);
    mockUsePlans.mockReturnValue({ data: PLANS, isLoading: false });
    mockUsePackages.mockReturnValue({ data: PACKAGES, isLoading: false });
  });

  afterEach(() => {
    setScrollY(0);
  });

  it("renders no template tokens, undefined or NaN", () => {
    const { container } = renderCopy();
    const text = pageText(container);
    expect(text).not.toMatch(/\{\{|\}\}/);
    expect(text).not.toMatch(/undefined|NaN|\[object/);
  });

  it("never prints an em dash or an en dash, in text or in attributes", () => {
    const { container } = renderCopy();
    expect(pageText(container)).not.toMatch(DASHES);
    expect(container.innerHTML).not.toMatch(DASHES);
  });

  it("takes the activity limit from the domain constant", () => {
    const { container } = renderCopy();
    const limit = MAX_ACTIVITY_CHARS.toLocaleString("pt-BR");
    expect(limit).toBe("15.000");
    expect(pageText(container)).toContain(`até ${limit} caracteres`);
  });

  it("derives credit costs, refund windows and the first charge day from the domain constants", () => {
    const text = pageText(renderCopy().container);
    expect(text).toContain(`custa ${ADAPTATION_COST_LABEL} créditos`);
    expect(text).toContain(`${EXTRACTION_COST} créditos`);
    expect(text).toContain(`${EXTRAS_REFUND_DAYS} dias`);
    expect(text).toContain(`${REFUND_WINDOW_DAYS} dias`);
    expect(text).toContain(`${TRIAL_DAYS + 1}º dia`);
  });

  it("holds the mobile CTA bar back while the consent banner is still up", () => {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    resetConsentSession();
    const { container } = renderCopy();
    const trialLinks = () => container.querySelectorAll('a[href="/assinar?trial=1"]').length;
    const before = trialLinks();
    act(() => storeConsent(window.localStorage, GRANTED_ALL));
    expect(trialLinks()).toBe(before + 1);
  });

  it("states the trial terms from the constants, with the card requirement", () => {
    const { container } = renderCopy();
    const text = pageText(container);
    expect(text).toContain(`Cartão obrigatório. Nada é cobrado por ${TRIAL_DAYS} dias`);
    expect(text).toContain(`${TRIAL_CREDITS} créditos para testar`);
  });

  describe("prices come from the catalogue", () => {
    it("prints the catalogue plans, with names, prices and monthly credits", () => {
      const { container } = renderCopy();
      const text = pageText(container);
      PLANS.forEach((plan) => {
        expect(text).toContain(plan.name);
        expect(text).toContain(`${plan.monthlyCredits} créditos por mês`);
      });
      expect(text).toMatch(/R\$\s*41,90/);
      expect(text).toMatch(/R\$\s*63,90/);
      expect(text).toMatch(/R\$\s*103,90/);
    });

    it("prints the catalogue extras", () => {
      const { container } = renderCopy();
      const text = pageText(container);
      expect(text).toMatch(/35 créditos por R\$\s*11,90/);
      expect(text).toMatch(/140 créditos por R\$\s*31,90/);
      expect(text).toMatch(/320 créditos por R\$\s*61,90/);
    });

    it("quotes the cheapest catalogue plan in the trial card and in the FAQ", () => {
      const { container } = renderCopy();
      const text = pageText(container);
      expect(text).toMatch(/Depois, R\$\s*41,90\/mês \(310 créditos\)/);
      expect(text).toMatch(
        new RegExp(`No ${TRIAL_DAYS + 1}º dia cobramos R\\$\\s*41,90 e sua conta vira o plano Essencial, com 310 créditos por mês`),
      );
    });

    it("does not leak any seeded price, credit count or plan name", () => {
      const { container } = renderCopy();
      const text = pageText(container);
      // 39,90 is the seeded cheapest plan: with the mock saying 41,90 it must be gone everywhere.
      [/R\$\s*39,90/, /R\$\s*59,90/, /R\$\s*99,90/, /R\$\s*29,90/, /R\$\s*19,90/].forEach((price) =>
        expect(text).not.toMatch(price),
      );
      [/\b300 créditos/, /\b480 créditos/, /\b900 créditos/, /\b30 créditos por/, /\b120 créditos por/].forEach((credits) =>
        expect(text).not.toMatch(credits),
      );
      ["Básico", "Profissional", "Avançado"].forEach((name) => expect(text).not.toContain(name));
    });
  });

  describe("brand and vocabulary", () => {
    it("calls the assistant ISA, never Isa", () => {
      const { container } = renderCopy();
      const text = pageText(container);
      expect(text).toMatch(/\bISA\b/);
      expect(text).not.toMatch(/\bIsa\b/);
    });

    it("uses the public brand Olhar Singular and not the B2B name", () => {
      const { container } = renderCopy();
      const text = pageText(container);
      expect(text).toContain("Olhar Singular");
      expect(text).not.toContain("Orientador Digital");
    });

    it("keeps the document-wide rule that the tool does not diagnose", () => {
      const { container } = renderCopy();
      expect(pageText(container)).toMatch(/não diagnostica|Não realiza diagnóstico|sem diagnóstico/i);
    });
  });

  describe("links", () => {
    it("sends every /assinar link to the trial or to a catalogue plan, never to a bare checkout", () => {
      const { container } = renderCopy();
      const hrefs = Array.from(container.querySelectorAll("a[href^='/assinar']")).map((a) => a.getAttribute("href"));
      const slugs = PLANS.map((p) => p.slug);
      expect(hrefs.length).toBeGreaterThan(0);
      hrefs.forEach((href) => {
        const valid = href === "/assinar?trial=1" || slugs.some((slug) => href === `/assinar?plano=${slug}`);
        expect(valid, `unexpected checkout link: ${href}`).toBe(true);
      });
    });

    it("links every catalogue plan exactly once and every trial CTA origin", () => {
      const { container } = renderCopy();
      const hrefs = Array.from(container.querySelectorAll("a[href^='/assinar']")).map((a) => a.getAttribute("href"));
      PLANS.forEach((plan) => expect(hrefs.filter((h) => h === `/assinar?plano=${plan.slug}`)).toHaveLength(1));
      // header, hero, trial card, closing CTA and the mobile bar.
      expect(hrefs.filter((h) => h === "/assinar?trial=1")).toHaveLength(5);
    });

    it("emits cta_click with a distinct origin for each of the five trial CTAs", () => {
      const { container } = renderCopy();
      container.querySelectorAll<HTMLAnchorElement>("a[href='/assinar?trial=1']").forEach((a) => fireEvent.click(a));
      const origins = (window.dataLayer ?? [])
        .filter((e) => (e as { event?: string }).event === "cta_click")
        .map((e) => (e as { origem: string }).origem)
        .sort();
      expect(origins).toEqual(["barra-mobile", "fechamento", "header", "hero", "planos"]);
    });

    it("never points at a signup or contact route that does not exist", () => {
      const { container } = renderCopy();
      const hrefs = Array.from(container.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")!);
      expect(hrefs.filter((h) => /signup|cadastro|contato|mailto:/i.test(h))).toEqual([]);
    });
  });

  describe("markup contract", () => {
    it("gives every image a width, a height and a descriptive alt", () => {
      const { container } = renderCopy();
      const images = Array.from(container.querySelectorAll("img"));
      expect(images.length).toBeGreaterThan(0);
      // Lists every offender at once instead of stopping at the first one.
      const offenders = images.flatMap((img) => {
        const missing = [
          !/^\d+$/.test(img.getAttribute("width") ?? "") && "width",
          !/^\d+$/.test(img.getAttribute("height") ?? "") && "height",
          (img.getAttribute("alt") ?? "").trim() === "" && "alt",
        ].filter(Boolean);
        return missing.length > 0 ? [`${img.getAttribute("src")}: missing ${missing.join(", ")}`] : [];
      });
      expect(offenders).toEqual([]);
    });

    it("uses no inline style anywhere (Tailwind and the lp tokens only)", () => {
      const { container } = renderCopy();
      expect(container.querySelectorAll("[style]")).toHaveLength(0);
    });
  });
});
