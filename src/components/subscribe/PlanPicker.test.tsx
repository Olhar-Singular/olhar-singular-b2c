import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlanPicker from "./PlanPicker";
import type { PlanView } from "@/hooks/useSubscription";

const PLANS: PlanView[] = [
  { id: "p1", slug: "basico", name: "Básico", priceBrl: 39.9, monthlyCredits: 300, highlight: false, adminOnly: false },
  { id: "p2", slug: "profissional", name: "Profissional", priceBrl: 59.9, monthlyCredits: 480, highlight: true, adminOnly: false },
  { id: "p3", slug: "teste-admin", name: "Teste", priceBrl: 1, monthlyCredits: 12, highlight: false, adminOnly: true },
];

function renderPicker(overrides: Partial<React.ComponentProps<typeof PlanPicker>> = {}) {
  const onSelect = vi.fn();
  render(<PlanPicker heading="1. Escolha seu plano" plans={PLANS} selectedId="p1" onSelect={onSelect} loading={false} {...overrides} />);
  return { onSelect };
}

describe("PlanPicker", () => {
  it("tells each plan in adapted activities, with credits and the price per adaptation", () => {
    renderPicker();
    expect(screen.getByRole("heading", { level: 2, name: "1. Escolha seu plano" })).toBeInTheDocument();
    const basico = screen.getByRole("button", { name: /Básico/ });
    expect(basico).toHaveTextContent(/R\$\s39,90\/mês/);
    expect(basico).toHaveTextContent("25 a 60 atividades adaptadas por mês");
    expect(basico).toHaveTextContent(/300 créditos · a partir de R\$\s0,67 por adaptação/);
    expect(screen.getByRole("button", { name: /Profissional/ })).toHaveTextContent("40 a 96 atividades adaptadas por mês");
  });

  it("marks the selected plan and reports a new choice by slug", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker();
    expect(screen.getByRole("button", { name: /Básico/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Profissional/ })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: /Profissional/ }));
    expect(onSelect).toHaveBeenCalledWith("profissional");
  });

  it("keeps the Popular badge on the highlighted plan only and flags the admin-only plan", () => {
    renderPicker();
    const group = screen.getByRole("group", { name: "Planos" });
    expect(within(group).getAllByText("Popular")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Profissional/ })).toHaveTextContent("Popular");
    expect(screen.getByRole("button", { name: /Teste/ })).toHaveTextContent("Só admins");
    // Small white text: the dark green keeps it above 4.5:1.
    expect(within(group).getByText("Popular")).toHaveClass("bg-primary-strong");
  });

  it("shows skeletons while loading and an empty state without plans", () => {
    const { rerender } = render(<PlanPicker heading="1. Plano" plans={[]} selectedId={null} onSelect={vi.fn()} loading />);
    expect(screen.getByTestId("plans-loading")).toBeInTheDocument();
    rerender(<PlanPicker heading="1. Plano" plans={[]} selectedId={null} onSelect={vi.fn()} loading={false} />);
    expect(screen.getByText("Nenhum plano disponível no momento.")).toBeInTheDocument();
  });
});
