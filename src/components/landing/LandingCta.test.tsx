import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import LandingCta from "./LandingCta";
import { renderWithProviders } from "@/test/helpers";

describe("LandingCta", () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  it("renders a link pointing at the destination", () => {
    renderWithProviders(
      <LandingCta to="/assinar?trial=1" origem="hero">
        Começar agora
      </LandingCta>,
    );
    expect(screen.getByRole("link", { name: "Começar agora" })).toHaveAttribute("href", "/assinar?trial=1");
  });

  it("pushes cta_click with the origin on click", () => {
    renderWithProviders(
      <LandingCta to="/assinar" origem="planos">
        Assinar
      </LandingCta>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Assinar" }));
    expect(window.dataLayer).toEqual([{ event: "cta_click", origem: "planos" }]);
  });

  it("calls the extra onClick after tracking", () => {
    const seen: unknown[][] = [];
    const onClick = vi.fn(() => seen.push([...(window.dataLayer ?? [])]));
    renderWithProviders(
      <LandingCta to="/assinar" origem="header" onClick={onClick}>
        Entrar
      </LandingCta>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Entrar" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(seen[0]).toEqual([{ event: "cta_click", origem: "header" }]);
  });

  it("works without an onClick", () => {
    renderWithProviders(
      <LandingCta to="/assinar" origem="fechamento">
        Seguir
      </LandingCta>,
    );
    expect(() => fireEvent.click(screen.getByRole("link", { name: "Seguir" }))).not.toThrow();
    expect(window.dataLayer).toHaveLength(1);
  });

  it("primary variant is the default and carries the orange button classes", () => {
    renderWithProviders(
      <LandingCta to="/assinar" origem="hero">
        Primário
      </LandingCta>,
    );
    const link = screen.getByRole("link", { name: "Primário" });
    for (const cls of [
      "bg-lp-orange",
      "text-lp-ink",
      "font-poppins",
      "font-semibold",
      "rounded-2xl",
      "min-h-[44px]",
      "hover:bg-lp-orange-hover",
    ]) {
      expect(link).toHaveClass(cls);
    }
  });

  it("merges an extra className", () => {
    renderWithProviders(
      <LandingCta to="/assinar" origem="hero" className="w-full sm:w-auto">
        Largo
      </LandingCta>,
    );
    const link = screen.getByRole("link", { name: "Largo" });
    expect(link).toHaveClass("w-full", "sm:w-auto", "bg-lp-orange");
  });

  it("ghost variant uses the teal text and not the orange background", () => {
    renderWithProviders(
      <LandingCta to="/auth" origem="header" variant="ghost">
        Entrar
      </LandingCta>,
    );
    const link = screen.getByRole("link", { name: "Entrar" });
    expect(link).toHaveClass("text-lp-teal-text");
    expect(link.className).not.toContain("bg-lp-orange");
  });

  it("ghost variant still tracks the click", () => {
    renderWithProviders(
      <LandingCta to="/auth" origem="barra-mobile" variant="ghost">
        Entrar
      </LandingCta>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Entrar" }));
    expect(window.dataLayer).toEqual([{ event: "cta_click", origem: "barra-mobile" }]);
  });
});
