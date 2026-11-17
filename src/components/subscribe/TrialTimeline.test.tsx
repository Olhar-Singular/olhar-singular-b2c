import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TrialTimeline from "./TrialTimeline";
import type { PlanView } from "@/hooks/useSubscription";

const PLAN: PlanView = { id: "p1", slug: "basico", name: "Básico", priceBrl: 39.9, monthlyCredits: 300, highlight: false, adminOnly: false };

describe("TrialTimeline", () => {
  it("shows today, the e-mail reminder on day 6 and the first charge on day 8, with computed dates", () => {
    render(<TrialTimeline start={new Date(2026, 10, 13, 10)} plan={PLAN} />);
    const items = screen.getAllByRole("listitem");
    expect(screen.getByRole("list", { name: "Como funciona o teste" })).toBeInTheDocument();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Hoje");
    expect(screen.getByText("Hoje")).toHaveClass("text-primary-strong");
    expect(items[0]).toHaveTextContent(/R\$\s0,00/);
    expect(items[0]).toHaveTextContent("Acesso liberado na hora, com 50 créditos para testar.");
    expect(items[1]).toHaveTextContent("18/11 · 6º dia");
    expect(items[1]).toHaveTextContent("Aviso por e-mail");
    expect(items[1]).toHaveTextContent("Lembramos você 2 dias antes. Sem cobrança surpresa.");
    expect(items[2]).toHaveTextContent("20/11 · 8º dia");
    expect(items[2]).toHaveTextContent(/R\$\s39,90\/mês/);
    expect(items[2]).toHaveTextContent("Só se você continuar. Cancele antes e não paga nada.");
  });
});
