import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers";
import { ConsentBanner } from "./ConsentBanner";
import { CookiePreferencesButton } from "./CookiePreferencesButton";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION, DENIED_ALL, GRANTED_ALL, requestConsentReopen, resetConsentSession } from "@/lib/analytics/consent";
import { resetDataLayer } from "@/lib/analytics/dataLayer";
import { resetAnalyticsBoot } from "@/lib/analytics/boot";
import { resetGtm } from "@/lib/analytics/gtm";

const { mockBoot } = vi.hoisted(() => ({ mockBoot: vi.fn() }));
vi.mock("@/lib/analytics/boot", async (orig) => {
  const actual = await orig<typeof import("@/lib/analytics/boot")>();
  return { ...actual, bootAnalytics: mockBoot };
});

describe("ConsentBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsBoot();
    resetDataLayer();
    resetGtm();
    resetConsentSession();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("boots analytics for the route and shows the notice until a decision", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsentBanner />, { route: "/?utm_source=x" });
    expect(mockBoot).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/", search: "?utm_source=x" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Cookies e medição");
    expect(screen.getByRole("link", { name: /Política de Privacidade/ })).toHaveAttribute("href", "/privacidade");

    await user.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY)!)).toMatchObject({ version: CONSENT_VERSION, consent: GRANTED_ALL });
    expect(window.dataLayer).toEqual(expect.arrayContaining([
      ["consent", "update", { ...GRANTED_ALL }],
      { event: "consent_updated", analytics: "granted", ads: "granted" },
    ]));
    expect(mockBoot).toHaveBeenCalledTimes(2);
  });

  it("records a refusal as denied", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsentBanner />);
    await user.click(screen.getByRole("button", { name: "Só essenciais" }));
    expect(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY)!).consent).toEqual(DENIED_ALL);
  });

  it("stays hidden once decided and on the checkout routes", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, consent: DENIED_ALL, decidedAt: "x" }));
    const { unmount } = renderWithProviders(<ConsentBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();

    window.localStorage.clear();
    renderWithProviders(<ConsentBanner />, { route: "/assinar?plano=basico" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockBoot).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/assinar" }));
  });

  it("does not take the focus when it shows up on its own, nor moves it anywhere after that first decision", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsentBanner />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.body).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body).toHaveFocus();
  });

  it("hands the focus back to the Preferências de cookies button that reopened it once the visitor decides (WCAG 2.4.3)", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, consent: DENIED_ALL, decidedAt: "x" }));
    renderWithProviders(
      <>
        <CookiePreferencesButton />
        <ConsentBanner />
      </>,
    );
    const opener = screen.getByRole("button", { name: "Preferências de cookies" });
    await user.click(opener);
    expect(screen.getByRole("button", { name: "Só essenciais" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
    expect(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY)!).consent).toEqual(GRANTED_ALL);
  });

  it("comes back over a stored decision when Preferências de cookies asks, focused on the first button, and the new decision replaces the old one", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, consent: DENIED_ALL, decidedAt: "x" }));
    renderWithProviders(<ConsentBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => requestConsentReopen());
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Cookies e medição");
    expect(screen.getByRole("link", { name: /Política de Privacidade/ })).toHaveAttribute("href", "/privacidade");
    expect(screen.getByRole("button", { name: "Só essenciais" })).toHaveFocus();
    expect(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY)!).consent).toEqual(DENIED_ALL);

    await user.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY)!)).toMatchObject({ version: CONSENT_VERSION, consent: GRANTED_ALL });
    expect(window.dataLayer).toEqual(expect.arrayContaining([
      ["consent", "update", { ...GRANTED_ALL }],
      { event: "consent_updated", analytics: "granted", ads: "granted" },
    ]));
    expect(mockBoot).toHaveBeenCalledTimes(2);
  });

  it("moves the focus to the first button again on a second request while already open", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsentBanner />);
    await user.click(screen.getByRole("button", { name: "Só essenciais" }));
    act(() => requestConsentReopen());
    expect(screen.getByRole("button", { name: "Só essenciais" })).toHaveFocus();
    screen.getByRole("button", { name: "Aceitar" }).focus();
    act(() => requestConsentReopen());
    expect(screen.getByRole("button", { name: "Só essenciais" })).toHaveFocus();
  });

  it("stays hidden on the checkout routes even when reopened", () => {
    renderWithProviders(<ConsentBanner />, { route: "/assinar?trial=1" });
    act(() => requestConsentReopen());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
