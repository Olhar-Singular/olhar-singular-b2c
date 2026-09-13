import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AccessBanner } from "./AccessBanner";
import { isRecentRejection } from "@/lib/domain/subscriptionUi";
import type { Access } from "@/lib/domain/access";
import type { SubscriptionView } from "@/hooks/useSubscription";

const NOW = new Date("2026-09-14T12:00:00Z");

function subscription(overrides: Partial<SubscriptionView>): SubscriptionView {
  return {
    id: "sub-1",
    status: "authorized",
    statusDetail: null,
    plan: null,
    nextPaymentDate: null,
    currentPeriodEnd: null,
    cancelledAt: null,
    cardBrand: null,
    cardLastFour: null,
    firstPaymentConfirmed: true,
    createdAt: new Date("2026-09-14T10:00:00Z"),
    ...overrides,
  };
}

function access(overrides: Partial<Access>): Access {
  return {
    kind: "subscriber",
    planCredits: 0,
    extraCredits: 0,
    total: 0,
    unlimited: false,
    paywalled: false,
    periodEnd: null,
    daysLeft: null,
    trialExpired: false,
    mustSetPassword: false,
    ...overrides,
  };
}

function renderBanner(a: Access | null, sub?: SubscriptionView | null) {
  return render(
    <MemoryRouter>
      <AccessBanner access={a} subscription={sub} now={NOW} />
    </MemoryRouter>,
  );
}

describe("AccessBanner", () => {
  it("renders nothing while the access is unknown", () => {
    renderBanner(null);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing for an exempt account", () => {
    renderBanner(access({ kind: "exempt", unlimited: true }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing for an account with credits", () => {
    renderBanner(access({ planCredits: 10, total: 10 }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("counts the days and credits left of a running trial", () => {
    renderBanner(access({ kind: "trial", planCredits: 37, total: 37, daysLeft: 4 }));
    expect(screen.getByRole("status")).toHaveTextContent("4 dias restantes e 37 créditos para usar");
  });

  it("uses the singular on the last day and for one credit", () => {
    renderBanner(access({ kind: "trial", planCredits: 1, total: 1, daysLeft: 1 }));
    expect(screen.getByRole("status")).toHaveTextContent("1 dia restante e 1 crédito para usar");
  });

  it("tells an expired trial with no extras that reading still works and links to credits", () => {
    renderBanner(access({ kind: "trial", trialExpired: true, paywalled: true, daysLeft: 0 }));
    expect(screen.getByRole("status")).toHaveTextContent(/período de teste terminou/i);
    expect(screen.getByRole("link", { name: /ver créditos/i })).toHaveAttribute("href", "/creditos");
  });

  it("shows the paywall line when the credits ran out (extras included)", () => {
    renderBanner(access({ kind: "legacy", paywalled: true }));
    expect(screen.getByRole("status")).toHaveTextContent(/seus créditos acabaram/i);
    expect(screen.getByRole("link", { name: /comprar créditos extras/i })).toHaveAttribute("href", "/creditos");
    expect(screen.getByRole("link", { name: /^Assinar$/ })).toHaveAttribute("href", "/assinar");
  });

  it("shows the paywall line, not the trial line, for an expired trial that still has extras... none", () => {
    // Expired trial but extras > 0: not paywalled, nothing to announce.
    renderBanner(access({ kind: "trial", trialExpired: true, extraCredits: 3, total: 3, daysLeft: 0 }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("AccessBanner (subscription states)", () => {
  it("asks for a new card when the renewal failed, even with credits left", () => {
    renderBanner(access({ kind: "subscriber", planCredits: 100, total: 100 }), subscription({ status: "past_due" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Não conseguimos cobrar/);
    expect(screen.getByRole("link", { name: /Trocar cartão/ })).toHaveAttribute("href", "/creditos");
  });

  it("shows the analysis line while the subscription is pending", () => {
    renderBanner(access({ kind: "legacy", paywalled: true }), subscription({ status: "pending" }));
    expect(screen.getByRole("status")).toHaveTextContent(/em análise/);
    expect(screen.queryByText(/créditos acabaram/)).toBeNull();
  });

  it("offers a retry after a fresh rejection and links to /assinar", () => {
    renderBanner(access({ kind: "legacy", paywalled: true }), subscription({ status: "rejected" }));
    expect(screen.getByRole("status")).toHaveTextContent(/foi recusado/);
    expect(screen.getByRole("link", { name: /Tentar de novo/ })).toHaveAttribute("href", "/assinar");
  });

  it("ignores an old rejection and falls back to the credit state", () => {
    renderBanner(
      access({ kind: "legacy", paywalled: true }),
      subscription({ status: "rejected", createdAt: new Date("2026-09-01T10:00:00Z") }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(/créditos acabaram/);
  });

  it("stays silent for an exempt account whatever the subscription says", () => {
    const { container } = renderBanner(access({ kind: "exempt", unlimited: true }), subscription({ status: "past_due" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a healthy subscriber", () => {
    const { container } = renderBanner(access({ kind: "subscriber", planCredits: 10, total: 10 }), subscription({}));
    expect(container).toBeEmptyDOMElement();
  });

  it("uses the current clock when none is injected", () => {
    render(
      <MemoryRouter>
        <AccessBanner access={access({ paywalled: true })} subscription={subscription({ status: "rejected", createdAt: new Date() })} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/foi recusado/);
  });
});

describe("isRecentRejection", () => {
  it("is false without a subscription, a rejection, or a creation date", () => {
    expect(isRecentRejection(null, NOW)).toBe(false);
    expect(isRecentRejection(undefined, NOW)).toBe(false);
    expect(isRecentRejection(subscription({ status: "cancelled" }), NOW)).toBe(false);
    expect(isRecentRejection(subscription({ status: "rejected", createdAt: null }), NOW)).toBe(false);
  });

  it("is true only inside the 24h window", () => {
    expect(isRecentRejection(subscription({ status: "rejected" }), NOW)).toBe(true);
    expect(isRecentRejection(subscription({ status: "rejected", createdAt: new Date("2026-09-13T11:59:00Z") }), NOW)).toBe(false);
  });
});
