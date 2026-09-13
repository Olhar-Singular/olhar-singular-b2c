import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers";
import { ConsentBanner } from "./ConsentBanner";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION, DENIED_ALL, GRANTED_ALL } from "@/lib/analytics/consent";
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
});
