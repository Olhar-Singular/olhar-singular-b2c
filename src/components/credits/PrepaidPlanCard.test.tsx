import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers";
import PrepaidPlanCard from "./PrepaidPlanCard";

const RUNNING = {
  periodEnd: new Date("2027-02-15T15:00:00.000Z"),
  lockedCredits: 600,
  unlockAt: new Date("2026-11-22T15:00:00.000Z"),
};

describe("PrepaidPlanCard", () => {
  it("shows the prepaid plan, its end date, the part still locked and the way to renew on Pix", () => {
    renderWithProviders(<PrepaidPlanCard prepaid={RUNNING} />);
    expect(screen.getByRole("heading", { name: "Plano à vista" })).toBeInTheDocument();
    expect(screen.getByText("Válido até 15/02/2027")).toBeInTheDocument();
    expect(screen.getByText("+600 créditos entram em 22/11")).toBeInTheDocument();
    expect(screen.getByText("Pagamento único no Pix: não renova sozinho. Para continuar depois dessa data, renove no Pix.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Renovar no Pix" })).toHaveAttribute("href", "/assinar?pagamento=pix");
  });

  it("drops the locked line once everything was released, and separates thousands", () => {
    const { rerender } = renderWithProviders(<PrepaidPlanCard prepaid={{ ...RUNNING, lockedCredits: 0, unlockAt: null }} />);
    expect(screen.queryByText(/créditos entram em/)).toBeNull();
    rerender(<PrepaidPlanCard prepaid={{ ...RUNNING, lockedCredits: 3300 }} />);
    expect(screen.getByText("+3.300 créditos entram em 22/11")).toBeInTheDocument();
  });
});
