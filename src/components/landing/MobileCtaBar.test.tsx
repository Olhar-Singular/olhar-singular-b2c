import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import MobileCtaBar from "./MobileCtaBar";
import { TRIAL_DAYS } from "@/lib/domain/subscriptionUi";
import { GRANTED_ALL, resetConsentSession, storeConsent } from "@/lib/analytics/consent";
import { renderWithProviders } from "@/test/helpers";

// Built from code points so this file itself carries no dash character.
const DASHES = new RegExp(`${String.fromCharCode(0x2014)}|${String.fromCharCode(0x2013)}`);

function setViewport(scrollY: number, innerHeight = 1000) {
  Object.defineProperty(window, "scrollY", { value: scrollY, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: innerHeight, configurable: true, writable: true });
}

function scrollTo(scrollY: number) {
  setViewport(scrollY, window.innerHeight);
  act(() => {
    fireEvent.scroll(window);
  });
}

const CTA_NAME = `Testar ${TRIAL_DAYS} dias grátis`;

describe("MobileCtaBar", () => {
  beforeEach(() => {
    window.dataLayer = [];
    setViewport(0);
    resetConsentSession();
    storeConsent(window.localStorage, GRANTED_ALL); // the consent banner is gone, so the bar may show
  });

  afterEach(() => {
    setViewport(0);
  });

  it("renders nothing at the top of the page (the hero owns the CTA there)", () => {
    const { container } = renderWithProviders(<MobileCtaBar />);
    expect(screen.queryByRole("link", { name: CTA_NAME })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("stays out of the page (and out of the tab order) while the consent banner is still up", () => {
    window.localStorage.removeItem("olhar:consent");
    resetConsentSession();
    renderWithProviders(<MobileCtaBar />);
    scrollTo(1000);
    expect(screen.queryByRole("link", { name: CTA_NAME })).toBeNull();
    act(() => storeConsent(window.localStorage, GRANTED_ALL));
    expect(screen.getByRole("link", { name: CTA_NAME })).toBeInTheDocument();
  });

  it("appears once the page is scrolled past the hero and goes away when back at the top", () => {
    renderWithProviders(<MobileCtaBar />);
    scrollTo(1000);
    expect(screen.getByRole("link", { name: CTA_NAME })).toBeInTheDocument();
    scrollTo(0);
    expect(screen.queryByRole("link", { name: CTA_NAME })).toBeNull();
  });

  it("shows right away when the page loads already scrolled (anchor or reload)", () => {
    setViewport(2000);
    renderWithProviders(<MobileCtaBar />);
    expect(screen.getByRole("link", { name: CTA_NAME })).toBeInTheDocument();
  });

  it("points the CTA at the trial checkout with a 52px touch target", () => {
    setViewport(2000);
    renderWithProviders(<MobileCtaBar />);
    const cta = screen.getByRole("link", { name: CTA_NAME });
    expect(cta).toHaveAttribute("href", "/assinar?trial=1");
    expect(cta).toHaveClass("min-h-[52px]", "w-full", "bg-lp-teal-deep", "text-white");
    expect(cta).not.toHaveClass("min-h-[44px]");
  });

  it("fires cta_click with the barra-mobile origin on click", () => {
    setViewport(2000);
    renderWithProviders(<MobileCtaBar />);
    fireEvent.click(screen.getByRole("link", { name: CTA_NAME }));
    expect(window.dataLayer).toEqual([{ event: "cta_click", origem: "barra-mobile" }]);
  });

  it("is fixed to the bottom, mobile only, below the consent banner (z-40 < z-50)", () => {
    setViewport(2000);
    renderWithProviders(<MobileCtaBar />);
    const bar = screen.getByRole("link", { name: CTA_NAME }).closest("div");
    expect(bar).toHaveClass("fixed", "inset-x-0", "bottom-0", "z-40", "min-[760px]:hidden");
    expect(bar).not.toHaveClass("z-50");
    expect(bar).toHaveClass("pb-[calc(0.75rem+env(safe-area-inset-bottom))]");
  });

  it("is not a landmark (just a link) and has no em/en dashes or inline styles", () => {
    setViewport(2000);
    const { container } = renderWithProviders(<MobileCtaBar />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("region")).toBeNull();
    expect(container.innerHTML).not.toMatch(DASHES);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
