import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AccessBanner } from "./AccessBanner";
import type { Access } from "@/lib/domain/access";

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

function renderBanner(a: Access | null) {
  return render(
    <MemoryRouter>
      <AccessBanner access={a} />
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
    expect(screen.getByRole("link", { name: /comprar créditos/i })).toHaveAttribute("href", "/creditos");
  });

  it("shows the paywall line, not the trial line, for an expired trial that still has extras... none", () => {
    // Expired trial but extras > 0: not paywalled, nothing to announce.
    renderBanner(access({ kind: "trial", trialExpired: true, extraCredits: 3, total: 3, daysLeft: 0 }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
