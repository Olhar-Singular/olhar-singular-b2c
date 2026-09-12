import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SubscriptionStats } from "./SubscriptionStats";

describe("SubscriptionStats", () => {
  it("shows live count, MRR and the status table in a fixed order", () => {
    render(<SubscriptionStats summary={{ live: 3, mrr_brl: 139.7, by_status: { rejected: 1, authorized: 2, past_due: 1, weird: 4 } }} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*139,70/)).toBeInTheDocument();
    const rows = within(screen.getByRole("table", { name: /por status/i })).getAllByRole("row");
    expect(rows.map((r) => r.textContent)).toEqual(["Ativa2", "Cobrança falhou1", "Recusada1", "weird4"]);
  });

  it("handles no subscriptions and no summary", () => {
    const { unmount } = render(<SubscriptionStats summary={{ live: 0, mrr_brl: 0, by_status: {} }} />);
    expect(screen.getByText(/Nenhuma assinatura ainda/)).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    unmount();
    render(<SubscriptionStats summary={undefined} />);
    expect(screen.getByText(/Sem dados de assinatura/)).toBeInTheDocument();
  });
});
