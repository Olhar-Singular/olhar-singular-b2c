import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import LandingPage from "./LandingPage";
import { GRANTED_ALL, resetConsentSession, storeConsent } from "@/lib/analytics/consent";
import { cheapestPublicPlan, DEFAULT_PLANS, formatBrl } from "@/lib/domain/subscriptionUi";
import { renderWithProviders } from "@/test/helpers";

// Both catalogues fall back to the seeded rows while their queries are loading.
vi.mock("@/hooks/useSubscription", () => ({ usePlans: () => ({ data: undefined, isLoading: true }) }));
vi.mock("@/hooks/useCredits", () => ({ usePackages: () => ({ data: undefined, isLoading: true }) }));

// Heading ids of the twelve sections, in the order the page must present them.
const SECTION_ORDER = [
  "h-hero",
  "h-prova",
  "h-dor",
  "h-videos",
  "h-como",
  "h-recebe",
  "h-isa",
  "h-depoimentos",
  "h-etica",
  "h-planos",
  "h-faq",
  "h-fechamento",
];

function setScrollY(scrollY: number) {
  Object.defineProperty(window, "scrollY", { value: scrollY, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true, writable: true });
}

function renderLanding() {
  return renderWithProviders(<LandingPage />);
}

function mainOf(container: HTMLElement): HTMLElement {
  return container.querySelector("main")!;
}

describe("LandingPage", () => {
  beforeEach(() => {
    window.dataLayer = [];
    setScrollY(0);
    resetConsentSession();
    storeConsent(window.localStorage, GRANTED_ALL); // the consent banner is gone, so the mobile bar may show
  });

  afterEach(() => {
    setScrollY(0);
  });

  describe("frame", () => {
    it("wraps everything in the scoped .landing theme", () => {
      const { container } = renderLanding();
      const wrapper = container.firstElementChild!;
      expect(wrapper).toHaveClass("landing", "min-h-screen");
      expect(wrapper).toContainElement(screen.getByRole("main"));
      expect(wrapper).toContainElement(screen.getByRole("contentinfo"));
    });

    it("renders a single h1 and a single main landmark", () => {
      renderLanding();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getAllByRole("main")).toHaveLength(1);
    });
  });

  describe("skip link", () => {
    it("is the very first child of the page and points at #conteudo", () => {
      const { container } = renderLanding();
      const skip = container.firstElementChild!.firstElementChild!;
      expect(skip.tagName).toBe("A");
      expect(skip).toHaveAttribute("href", "#conteudo");
      expect(skip).toHaveTextContent("Pular para o conteúdo");
    });

    it("stays visually hidden until focused", () => {
      renderLanding();
      const skip = screen.getByRole("link", { name: "Pular para o conteúdo" });
      expect(skip).toHaveClass("sr-only", "focus:not-sr-only");
    });

    it("is the first stop of the Tab order, before the header", async () => {
      renderLanding();
      await userEvent.tab();
      expect(document.activeElement).toBe(screen.getByRole("link", { name: "Pular para o conteúdo" }));
    });

    it("targets a focusable main#conteudo (tabindex -1) that can receive the focus", () => {
      const { container } = renderLanding();
      const main = mainOf(container);
      expect(main).toHaveAttribute("id", "conteudo");
      expect(main).toHaveAttribute("tabindex", "-1");
      expect(document.querySelector("#conteudo")).toBe(main);
      main.focus();
      expect(document.activeElement).toBe(main);
    });

    it("leaves room under the sticky header when the skip link scrolls main into view", () => {
      const { container } = renderLanding();
      expect(mainOf(container)).toHaveClass("scroll-mt-20");
    });
  });

  describe("composition", () => {
    it("puts the twelve sections directly under main, in the designed order", () => {
      const { container } = renderLanding();
      const main = mainOf(container);
      expect(Array.from(main.children).map((el) => `${el.tagName}:${el.getAttribute("aria-labelledby")}`)).toEqual(
        SECTION_ORDER.map((id) => `SECTION:${id}`),
      );
      expect(Array.from(main.querySelectorAll("h1, h2")).map((h) => h.id)).toEqual(SECTION_ORDER);
    });

    it("keeps the header before main, and the footer after it", () => {
      renderLanding();
      const header = screen.getByRole("banner");
      const main = screen.getByRole("main");
      const footer = screen.getByRole("contentinfo");
      expect(header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(main).not.toContainElement(header);
      expect(main).not.toContainElement(footer);
    });

    it("renders the mobile CTA bar after the footer, only once the hero is scrolled past", () => {
      const { container } = renderLanding();
      expect(container.querySelector("div.fixed.bottom-0")).toBeNull();

      setScrollY(2000);
      act(() => {
        fireEvent.scroll(window);
      });

      const bar = container.querySelector("div.fixed.bottom-0")!;
      expect(bar).toBeInTheDocument();
      expect(bar).toHaveClass("z-40", "min-[760px]:hidden");
      expect(bar).toContainElement(within(bar as HTMLElement).getByRole("link", { name: /Testar 7 dias grátis/ }));
      expect(screen.getByRole("contentinfo").compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByRole("main")).not.toContainElement(bar as HTMLElement);
    });
  });

  describe("anchors", () => {
    it("resolves every in-page anchor of the header inside main, with room under the sticky header", () => {
      renderLanding();
      const nav = screen.getByRole("navigation", { name: "Navegação principal" });
      const anchors = within(nav).getAllByRole("link");
      expect(anchors.map((a) => a.getAttribute("href"))).toEqual(["#como-funciona", "#precos", "#faq"]);
      anchors.forEach((a) => {
        const target = document.querySelector(a.getAttribute("href")!);
        expect(target).not.toBeNull();
        expect(screen.getByRole("main")).toContainElement(target as HTMLElement);
        expect(target).toHaveClass("scroll-mt-20");
      });
    });

    it("resolves the footer and hero anchors too", () => {
      renderLanding();
      const footerNav = screen.getByRole("navigation", { name: "Links institucionais" });
      expect(within(footerNav).getByRole("link", { name: "Planos" })).toHaveAttribute("href", "#precos");
      expect(screen.getByRole("link", { name: "Ver como funciona" })).toHaveAttribute("href", "#como-funciona");
      expect(document.getElementById("precos")).not.toBeNull();
      expect(document.getElementById("como-funciona")).not.toBeNull();
    });
  });

  describe("document integrity", () => {
    it("has no duplicated ids across the sections", () => {
      const { container } = renderLanding();
      const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    });

    it("resolves every aria-labelledby and aria-controls reference", () => {
      const { container } = renderLanding();
      const dangling: string[] = [];
      container.querySelectorAll("[aria-labelledby], [aria-controls]").forEach((el) => {
        const refs = `${el.getAttribute("aria-labelledby") ?? ""} ${el.getAttribute("aria-controls") ?? ""}`;
        refs
          .split(/\s+/)
          .filter(Boolean)
          .forEach((id) => {
            if (!document.getElementById(id)) dangling.push(id);
          });
      });
      expect(dangling).toEqual([]);
    });
  });

  describe("visitors", () => {
    it("does not depend on a session: it renders without an auth provider and 'Entrar' stays visible", () => {
      renderLanding();
      const header = within(screen.getByRole("banner"));
      expect(header.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/auth");
    });

    it("has no public signup: every account-creating CTA goes through the trial or plan checkout", () => {
      renderLanding();
      expect(screen.queryByRole("link", { name: /começar grátis/i })).toBeNull();
      expect(screen.queryByRole("link", { name: /criar conta/i })).toBeNull();
      const trialLinks = screen.getAllByRole("link", { name: /Testar (7 dias )?grátis/ });
      expect(trialLinks.length).toBeGreaterThanOrEqual(4);
      trialLinks.forEach((l) => expect(l).toHaveAttribute("href", "/assinar?trial=1"));
    });
  });

  describe("content", () => {
    it("falls back to the seeded plans while the catalogue loads", () => {
      renderLanding();
      expect(screen.getAllByText(/R\$\s*39,90/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/R\$\s*59,90/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/R\$\s*99,90/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/R\$\s*19,90/)).toBeNull();
    });

    it("footer carries the pedagogical disclaimer", () => {
      renderLanding();
      expect(within(screen.getByRole("contentinfo")).getByText(/decisão final/i)).toBeInTheDocument();
    });
  });
});

describe("proof section images", () => {
  it("shows the original sheet and the sheet adapted by the platform, 4:5 each, instead of the placeholders", () => {
    renderWithProviders(<LandingPage />);
    const region = screen.getByRole("region", { name: "Veja o que a IA entrega" });
    const images = within(region).getAllByRole("img");
    expect(images).toHaveLength(2);
    const [before, after] = images;
    expect(before).toHaveAccessibleName(/original/i);
    expect(after).toHaveAccessibleName(/adaptad/i);
    for (const image of images) {
      expect(image).toHaveAttribute("width", "1200");
      expect(image).toHaveAttribute("height", "1500");
      expect(image).toHaveAttribute("loading", "lazy");
      expect(image.getAttribute("src")).toMatch(/prova-(antes|depois)/);
    }
    expect(within(region).queryByText(/Imagem da atividade/)).toBeNull();
  });
});

describe("images", () => {
  it("never shows the same photo twice on the page (the logo is the only repeat)", () => {
    renderWithProviders(<LandingPage />);
    const sources = screen
      .getAllByRole("img")
      .map((img) => img.getAttribute("src"))
      .filter((src): src is string => !!src && !src.includes("logo-olho"));
    expect(sources.length).toBeGreaterThan(5);
    expect(new Set(sources).size).toBe(sources.length);
  });
});

describe("index.html (Termos 5.1)", () => {
  it("advertises the real cheapest plan in the search and share descriptions, never the retired R$ 19,90", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const price = formatBrl(cheapestPublicPlan(DEFAULT_PLANS)!.priceBrl).replace(/\s/g, " ");
    const descriptions = [...html.matchAll(/<meta (?:name|property)="(?:description|og:description)" content="([^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(descriptions).toHaveLength(2);
    for (const description of descriptions) expect(description).toContain(`a partir de ${price}`);
    expect(html).not.toMatch(/19,90/);
  });
});
