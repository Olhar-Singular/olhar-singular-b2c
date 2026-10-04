import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import LandingHeader from "./LandingHeader";
import { TRIAL_DAYS } from "@/lib/domain/subscriptionUi";
import { renderWithProviders } from "@/test/helpers";

vi.mock("@/assets/logo-olho-transparent.png", () => ({ default: "stub://logo.png" }));

describe("LandingHeader", () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  it("renders a sticky (not fixed) banner so the page needs no top padding", () => {
    renderWithProviders(<LandingHeader />);
    const header = screen.getByRole("banner");
    expect(header).toHaveClass("sticky", "top-0", "z-40", "backdrop-blur-md");
    expect(header).not.toHaveClass("fixed");
  });

  it("renders the brand link to home with the logo and the name", () => {
    renderWithProviders(<LandingHeader />);
    const brand = screen.getByRole("link", { name: "Olhar Singular: página inicial" });
    expect(brand).toHaveAttribute("href", "/");
    const logo = within(brand).getByRole("img", { hidden: true });
    expect(logo).toHaveAttribute("alt", "Olhar Singular");
    expect(logo).toHaveAttribute("src", "stub://logo.png");
    expect(logo).toHaveClass("h-8");
    // fixed intrinsic size: no layout shift while the logo loads (the PNG is 500x500)
    expect(logo).toHaveAttribute("width", "32");
    expect(logo).toHaveAttribute("height", "32");
    expect(within(brand).getByText("Olhar Singular")).toBeInTheDocument();
  });

  it("keeps the wordmark on one line and hides it visually below 430px while the link keeps its aria-label", () => {
    renderWithProviders(<LandingHeader />);
    const brand = screen.getByRole("link", { name: "Olhar Singular: página inicial" });
    const wordmark = within(brand).getByText("Olhar Singular");
    expect(wordmark).toHaveClass("whitespace-nowrap", "max-[430px]:sr-only");
    // sr-only keeps the text in the accessibility tree; the name still comes from the aria-label
    expect(brand).toHaveAttribute("aria-label", "Olhar Singular: página inicial");
  });

  it("labels the main navigation and points the anchors at the page sections", () => {
    renderWithProviders(<LandingHeader />);
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    // from 820px only: between 640px and 819px the row would crowd and wrap
    expect(nav).toHaveClass("hidden", "min-[820px]:flex");
    expect(nav).not.toHaveClass("sm:flex");
    within(nav)
      .getAllByRole("link")
      .forEach((link) => expect(link).toHaveClass("whitespace-nowrap"));
    expect(within(nav).getByRole("link", { name: "Como funciona" })).toHaveAttribute("href", "#como-funciona");
    expect(within(nav).getByRole("link", { name: "Preços" })).toHaveAttribute("href", "#precos");
    expect(within(nav).getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "#faq");
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
  });

  it("has an Entrar link to /auth that does not fire cta_click", () => {
    renderWithProviders(<LandingHeader />);
    const entrar = screen.getByRole("link", { name: "Entrar" });
    expect(entrar).toHaveAttribute("href", "/auth");
    fireEvent.click(entrar);
    expect(window.dataLayer).toEqual([]);
  });

  it("points the trial CTA at /assinar?trial=1 with a short and a long label, each starting with Testar", () => {
    renderWithProviders(<LandingHeader />);
    const short = screen.getByText("Testar grátis");
    const long = screen.getByText(`Testar ${TRIAL_DAYS} dias grátis`);
    // never wrap onto a second line: that is what made the header 93px tall
    expect(short).toHaveClass("sm:hidden", "whitespace-nowrap");
    expect(long).toHaveClass("hidden", "sm:inline", "whitespace-nowrap");
    const cta = short.closest("a");
    expect(cta).toBe(long.closest("a"));
    expect(cta).toHaveAttribute("href", "/assinar?trial=1");
  });

  it("fires cta_click with the header origin when the trial CTA is clicked", () => {
    renderWithProviders(<LandingHeader />);
    fireEvent.click(screen.getByText("Testar grátis"));
    expect(window.dataLayer).toEqual([{ event: "cta_click", origem: "header" }]);
  });

  it("does not offer a public signup or a contact link", () => {
    renderWithProviders(<LandingHeader />);
    expect(screen.queryByRole("link", { name: /^Assinar$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Contato/i })).toBeNull();
  });
});
