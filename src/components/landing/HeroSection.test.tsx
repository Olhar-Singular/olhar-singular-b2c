import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import HeroSection from "./HeroSection";
import { renderWithProviders } from "@/test/helpers";
import { TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/domain/subscriptionUi";

vi.mock("@/assets/landing/turma-diversa.webp", () => ({ default: "stub://turma-diversa.webp" }));

// En and em dash, built from code points so this file itself stays dash-free.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe("HeroSection", () => {
  it("gives the primary CTA a teal glow, not the retired orange one", () => {
    renderWithProviders(<HeroSection />);
    const cta = screen.getByRole("link", { name: /testar/i });
    expect(cta).toHaveClass("bg-lp-teal-deep", "text-white");
    expect(cta.className).toMatch(/shadow-\[0_10px_26px_rgba\(10,127,135,0\.35\)\]/);
    expect(cta.className).not.toMatch(/255,138,61|orange/);
  });

  beforeEach(() => {
    window.dataLayer = [];
  });

  it("renders the main h1 as the accessible name of the section", () => {
    renderWithProviders(<HeroSection />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveAttribute("id", "h-hero");
    expect(h1.textContent?.length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: h1.textContent ?? "" })).toBeInTheDocument();
  });

  it("shows the public brand as the eyebrow", () => {
    renderWithProviders(<HeroSection />);
    expect(screen.getByText("Olhar Singular")).toBeInTheDocument();
  });

  it("primary CTA starts the card trial and pushes cta_click with origin hero", () => {
    renderWithProviders(<HeroSection />);
    const cta = screen.getByRole("link", { name: `Testar ${TRIAL_DAYS} dias grátis` });
    expect(cta).toHaveAttribute("href", "/assinar?trial=1");
    fireEvent.click(cta);
    expect(window.dataLayer).toEqual([{ event: "cta_click", origem: "hero" }]);
  });

  it("states the card requirement, the first charge day and the trial credits from the constants", () => {
    renderWithProviders(<HeroSection />);
    expect(
      screen.getByText(
        `Cartão obrigatório. Nada é cobrado por ${TRIAL_DAYS} dias; cancele antes do ${TRIAL_DAYS + 1}º dia e não paga nada.`,
        { exact: false },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(`${TRIAL_CREDITS} créditos para testar.`, { exact: false })).toBeInTheDocument();
  });

  it("secondary anchor links to #como-funciona without tracking", () => {
    renderWithProviders(<HeroSection />);
    const anchor = screen.getByRole("link", { name: /Ver como funciona/i });
    expect(anchor).toHaveAttribute("href", "#como-funciona");
    fireEvent.click(anchor);
    expect(window.dataLayer).toEqual([]);
  });

  it("without videoUrl renders the hero photo eager, high priority, with real dimensions and alt", () => {
    renderWithProviders(<HeroSection />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "stub://turma-diversa.webp");
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("fetchpriority", "high");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img).toHaveAttribute("width", "1040");
    expect(img).toHaveAttribute("height", "784");
    expect(img.getAttribute("alt")).toMatch(/professora/i);
    expect(document.querySelector("video")).toBeNull();
  });

  it("with videoUrl renders a self-hosted video with controls, lazy preload and the photo as poster", () => {
    renderWithProviders(<HeroSection videoUrl="/media/apresentacao.mp4" />);
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", "/media/apresentacao.mp4");
    expect(video).toHaveAttribute("poster", "stub://turma-diversa.webp");
    expect(video).toHaveAttribute("preload", "none");
    expect(video).toHaveAttribute("controls");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("has no stats strip and no placeholder tokens or dashes", () => {
    const { container } = renderWithProviders(<HeroSection />);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText(/professores usando|escolas atendidas/i)).toBeNull();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\{\{|undefined|NaN/);
    expect(text).not.toMatch(DASHES);
  });

  it("keeps the free wording only next to the trial verb", () => {
    const { container } = renderWithProviders(<HeroSection />);
    const free = (container.textContent ?? "").match(/gr[áa]tis/gi) ?? [];
    expect(free).toHaveLength(1);
    expect(container.textContent).toContain(`Testar ${TRIAL_DAYS} dias grátis`);
  });
});
