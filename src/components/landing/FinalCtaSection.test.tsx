import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import FinalCtaSection from "./FinalCtaSection";
import { renderWithProviders } from "@/test/helpers";
import { TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/domain/subscriptionUi";

vi.mock("@/assets/logo-olho-transparent.png", () => ({ default: "stub://logo.png" }));

describe("FinalCtaSection", () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  it("labels the section with its heading", () => {
    renderWithProviders(<FinalCtaSection />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(screen.getByRole("region", { name: heading.textContent ?? "" })).toHaveAttribute(
      "aria-labelledby",
      heading.id,
    );
  });

  it("is a dark section that flips the focus outline to white", () => {
    renderWithProviders(<FinalCtaSection />);
    const section = screen.getByRole("region");
    expect(section).toHaveClass("bg-lp-dark", "text-white", "lp-on-dark");
  });

  it("states the trial terms from the shared constants", () => {
    renderWithProviders(<FinalCtaSection />);
    expect(screen.getByText(`Cartão obrigatório. Nada é cobrado por ${TRIAL_DAYS} dias.`)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`cancele antes do ${TRIAL_DAYS + 1}º dia e não paga nada`, "i")),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${TRIAL_CREDITS} créditos para testar`))).toBeInTheDocument();
  });

  it("links the call to action to the card trial", () => {
    renderWithProviders(<FinalCtaSection />);
    expect(screen.getByRole("link", { name: `Testar ${TRIAL_DAYS} dias grátis` })).toHaveAttribute(
      "href",
      "/assinar?trial=1",
    );
  });

  it("uses the on-dark CTA: bright teal with ink text and a teal glow, so the button stands out of the dark band", () => {
    renderWithProviders(<FinalCtaSection />);
    const cta = screen.getByRole("link", { name: /testar/i });
    expect(cta).toHaveClass("bg-lp-teal", "text-lp-ink");
    expect(cta).not.toHaveClass("bg-lp-teal-deep", "text-white");
    expect(cta.className).toMatch(/shadow-\[0_10px_26px_rgba\(15,181,160,0\.35\)\]/);
    expect(cta.className).not.toMatch(/255,138,61/);
  });

  it("makes the call to action a large touch target", () => {
    renderWithProviders(<FinalCtaSection />);
    const cta = screen.getByRole("link", { name: /testar/i });
    expect(cta).toHaveClass("min-h-[52px]");
    expect(cta).not.toHaveClass("min-h-[44px]");
  });

  it("emits cta_click with the closing origin on click", () => {
    renderWithProviders(<FinalCtaSection />);
    fireEvent.click(screen.getByRole("link", { name: /testar/i }));
    expect(window.dataLayer).toEqual([{ event: "cta_click", origem: "fechamento" }]);
  });

  it("shows the brand logo with fixed dimensions and a name, and no other image", () => {
    const { container } = renderWithProviders(<FinalCtaSection />);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    const logo = images[0];
    expect(logo).toHaveAttribute("src", "stub://logo.png");
    expect(logo).toHaveAttribute("alt", "Olhar Singular");
    expect(logo).toHaveAttribute("width");
    expect(logo).toHaveAttribute("height");
    expect(logo).toHaveAttribute("loading", "lazy");
    expect(logo).toHaveAttribute("decoding", "async");
  });

  it("makes no claim about experts, people or social proof", () => {
    const { container } = renderWithProviders(<FinalCtaSection />);
    expect(container.textContent ?? "").not.toMatch(/especialista|depoimento/i);
  });

  it("has no dash punctuation, template leftovers or inline styles", () => {
    const { container } = renderWithProviders(<FinalCtaSection />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
    expect(text).not.toMatch(/\{\{|undefined|NaN/);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
