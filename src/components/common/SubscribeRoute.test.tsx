import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, buildAuthState } from "@/test/helpers";
import { SubscribeRoute } from "./SubscribeRoute";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/common/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));
vi.mock("@/components/common/PublicShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="public-shell">{children}</div>,
}));
vi.mock("@/pages/SubscribePage", () => ({ default: () => <div data-testid="subscribe-page" /> }));

import { useAuth } from "@/hooks/useAuth";

describe("SubscribeRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing while the session is unknown", () => {
    vi.mocked(useAuth).mockReturnValue(buildAuthState({ loading: true }) as never);
    const { container } = renderWithProviders(<SubscribeRoute />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses the app layout for a logged-in user", () => {
    vi.mocked(useAuth).mockReturnValue(buildAuthState({ session: { access_token: "t" } }) as never);
    renderWithProviders(<SubscribeRoute />);
    expect(screen.getByTestId("app-layout")).toContainElement(screen.getByTestId("subscribe-page"));
  });

  it("uses the public shell for a visitor", () => {
    vi.mocked(useAuth).mockReturnValue(buildAuthState({ session: null }) as never);
    renderWithProviders(<SubscribeRoute />);
    expect(screen.getByTestId("public-shell")).toContainElement(screen.getByTestId("subscribe-page"));
  });
});
