import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers";
import { CookiePreferencesButton } from "./CookiePreferencesButton";
import { consentReopenInvoker, resetConsentSession, subscribeConsentReopen } from "@/lib/analytics/consent";

// Built from code points so this file itself carries no dash character.
const DASHES = new RegExp(`${String.fromCharCode(0x2014)}|${String.fromCharCode(0x2013)}`);

describe("CookiePreferencesButton", () => {
  const onReopen = vi.fn();
  let unsubscribe = () => {};

  beforeEach(() => {
    resetConsentSession();
    onReopen.mockClear();
    unsubscribe = subscribeConsentReopen(onReopen);
  });

  afterEach(() => unsubscribe());

  it("is a real button (never a link) that reopens the consent banner on click", () => {
    renderWithProviders(<CookiePreferencesButton />);
    const button = screen.getByRole("button", { name: "Preferências de cookies" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.tagName).toBe("BUTTON");
    expect(screen.queryByRole("link")).toBeNull();
    expect(consentReopenInvoker()).toBeNull();
    fireEvent.click(button);
    expect(onReopen).toHaveBeenCalledTimes(1);
    expect(consentReopenInvoker()).toBe(button);
  });

  it("can name another element to get the focus back (a menu passes its trigger, which outlives the item)", () => {
    const returnFocusTo = { current: null as HTMLElement | null };
    renderWithProviders(
      <>
        <button type="button" ref={(el) => { returnFocusTo.current = el; }}>Menu</button>
        <CookiePreferencesButton returnFocusTo={returnFocusTo} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preferências de cookies" }));
    expect(consentReopenInvoker()).toBe(screen.getByRole("button", { name: "Menu" }));
  });

  it("falls back to itself when the named ref is not attached to anything", () => {
    renderWithProviders(<CookiePreferencesButton returnFocusTo={{ current: null }} />);
    const button = screen.getByRole("button", { name: "Preferências de cookies" });
    fireEvent.click(button);
    expect(consentReopenInvoker()).toBe(button);
  });

  it("inherits the look of where it sits through className and renders an optional icon", () => {
    renderWithProviders(<CookiePreferencesButton className="min-h-[44px] underline" icon={<svg data-testid="icon" />} />);
    const button = screen.getByRole("button", { name: "Preferências de cookies" });
    expect(button).toHaveClass("min-h-[44px]", "underline");
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("forwards the ref and keeps a caller's onClick (so a Radix menu item can wrap it with asChild)", () => {
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    renderWithProviders(<CookiePreferencesButton ref={ref} onClick={onClick} role="menuitem" />);
    const button = screen.getByRole("menuitem", { name: "Preferências de cookies" });
    expect(ref.current).toBe(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  it.each(["/assinar", "/assinar?trial=1", "/definir-senha"])(
    "renders nothing on %s, where the banner never shows (a dead button would be worse than none)",
    (route) => {
      const { container } = renderWithProviders(<CookiePreferencesButton />, { route });
      expect(screen.queryByRole("button")).toBeNull();
      expect(container).toBeEmptyDOMElement();
    },
  );

  it("has no em/en dashes and no inline styles", () => {
    const { container } = renderWithProviders(<CookiePreferencesButton />);
    expect(container.innerHTML).not.toMatch(DASHES);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
