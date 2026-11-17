import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PrepaidPlanPicker from "./PrepaidPlanPicker";
import { DEFAULT_PREPAID_PLANS, type PrepaidPlanView } from "@/lib/domain/prepaid";

const SMOKE: PrepaidPlanView = { id: "t", slug: "pix-teste-admin", months: 1, credits: 1, priceBrl: 1, highlight: false, adminOnly: true };

function renderPicker(overrides: Partial<React.ComponentProps<typeof PrepaidPlanPicker>> = {}) {
  const onSelect = vi.fn();
  render(<PrepaidPlanPicker plans={DEFAULT_PREPAID_PLANS} selectedId="pix-3-meses" onSelect={onSelect} loading={false} {...overrides} />);
  return { onSelect };
}

describe("PrepaidPlanPicker", () => {
  it("tells each plan with its price, credits, adaptations and savings", () => {
    renderPicker();
    expect(screen.getByRole("heading", { level: 2, name: "1. Por quanto tempo você quer acesso?" })).toBeInTheDocument();
    const one = screen.getByRole("button", { name: /1 MÊS/ });
    expect(one).toHaveTextContent(/R\$\s39,90/);
    expect(one).toHaveTextContent("300 créditos");
    expect(one).toHaveTextContent("25 a 60 adaptações");
    expect(one).toHaveTextContent(/Equivale a R\$\s39,90 por mês/);
    const three = screen.getByRole("button", { name: /3 MESES/ });
    expect(three).toHaveTextContent("Popular");
    expect(three).toHaveTextContent("75 a 180 adaptações");
    expect(three).toHaveTextContent("Economia de 24%");
    expect(three).toHaveTextContent(/R\$\s29,97 por mês/);
    const twelve = screen.getByRole("button", { name: /12 MESES/ });
    expect(twelve).toHaveTextContent("3.600 créditos");
    expect(twelve).toHaveTextContent("o ano letivo inteiro");
    expect(twelve).toHaveTextContent("Economia de 31%");
    // Small text on the checkout green would sit at 3.2:1: the dark green instead.
    expect(within(three).getByText("Economia de 24%")).toHaveClass("text-primary-strong");
    expect(within(three).getByText("Popular")).toHaveClass("bg-primary-strong");
  });

  it("marks the selected plan, explains its two-part release and reports a new choice by slug", async () => {
    const { onSelect } = renderPicker();
    expect(screen.getByRole("button", { name: /3 MESES/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /1 MÊS/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("note")).toHaveTextContent("300 créditos entram na hora; os outros 600 entram no 8º dia, depois do prazo de garantia.");
    await userEvent.click(screen.getByRole("button", { name: /12 MESES/ }));
    expect(onSelect).toHaveBeenCalledWith("pix-12-meses");
  });

  it("has no release note when everything arrives at once", () => {
    renderPicker({ selectedId: "pix-1-mes" });
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("flags the admin smoke offer", () => {
    renderPicker({ plans: [...DEFAULT_PREPAID_PLANS, SMOKE], selectedId: null });
    expect(screen.getByRole("button", { name: /Só admins/ })).toBeInTheDocument();
  });

  it("shows placeholders while loading and a message when there is nothing", () => {
    renderPicker({ plans: [], loading: true });
    expect(screen.getByTestId("prepaid-plans-loading")).toBeInTheDocument();
    renderPicker({ plans: [], loading: false });
    expect(screen.getByText("Nenhum plano disponível no momento.")).toBeInTheDocument();
  });
});
