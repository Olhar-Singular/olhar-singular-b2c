import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import TrustColumn from "./TrustColumn";
import type { PlanView } from "@/hooks/useSubscription";
import { DEFAULT_PREPAID_PLANS } from "@/lib/domain/prepaid";

const PLAN: PlanView = { id: "p1", slug: "basico", name: "Básico", priceBrl: 39.9, monthlyCredits: 300, highlight: false, adminOnly: false };

describe("TrustColumn", () => {
  it("trial: nothing to pay today, the first charge date with the reminder, the guarantee and the seals", () => {
    render(<TrustColumn plan={PLAN} trial firstCharge={new Date(2026, 10, 20)} />);
    const aside = screen.getByRole("complementary", { name: "Resumo e garantias" });
    expect(aside).toHaveTextContent("Plano Básico · mensal");
    expect(aside).toHaveTextContent(/R\$\s39,90\/mês/);
    expect(aside).toHaveTextContent(/Você paga hoje\s*R\$\s0,00/);
    expect(aside).toHaveTextContent("Primeira cobrança em 20/11/2026, com aviso por e-mail 2 dias antes.");
    expect(aside).toHaveTextContent("Cancele antes do 8º dia e nada é cobrado.");
    expect(aside).toHaveTextContent("até 30 dias após cancelar");
  });

  it("lists what the teacher gets", () => {
    render(<TrustColumn plan={PLAN} trial firstCharge={new Date(2026, 10, 20)} />);
    const list = screen.getByRole("list", { name: "O que você recebe" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Provas e atividades adaptadas em minutos",
      "Justificativa pedagógica pronta para a coordenação",
      "Perfis de barreira salvos por aluno",
      "Chat com a ISA e histórico completo",
    ]);
  });

  it("quotes a real testimonial without any photo or avatar (no image authorization)", () => {
    const { container } = render(<TrustColumn plan={PLAN} trial firstCharge={new Date(2026, 10, 20)} />);
    const figure = screen.getByRole("figure");
    expect(figure).toHaveTextContent("Eu passava o domingo reescrevendo prova.");
    expect(figure).toHaveTextContent("Cláudia M.");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByTestId("testimonial-avatar")).toBeNull();
  });

  it("names Mercado Pago, the LGPD and the no-diagnosis rule in the seals", () => {
    render(<TrustColumn plan={PLAN} trial firstCharge={new Date(2026, 10, 20)} />);
    const seals = screen.getByRole("list", { name: "Segurança" });
    expect(within(seals).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Pagamento processado pelo Mercado Pago",
      "Dados tratados conforme a LGPD",
      "Não realiza diagnóstico. A decisão é sempre do professor.",
    ]);
  });

  it("paid: the price is due today, it renews monthly, and the guarantee skips the trial", () => {
    render(<TrustColumn plan={PLAN} trial={false} firstCharge={null} />);
    const aside = screen.getByRole("complementary", { name: "Resumo e garantias" });
    expect(aside).toHaveTextContent(/Você paga hoje\s*R\$\s39,90/);
    expect(aside).toHaveTextContent("Renova todo mês na mesma data.");
    expect(aside).not.toHaveTextContent("Primeira cobrança em");
    expect(aside).not.toHaveTextContent("8º dia");
    expect(aside).toHaveTextContent("A última cobrança pode ser estornada integralmente na área Créditos");
  });

  it("pix: one-off payment summary and the 7-day guarantee, same benefits and seals", () => {
    render(<TrustColumn mode="pix" prepaid={DEFAULT_PREPAID_PLANS[1]} />);
    const aside = screen.getByRole("complementary", { name: "Resumo e garantias" });
    expect(aside).toHaveTextContent("Acesso por 3 meses");
    expect(aside).toHaveTextContent("900 créditos");
    expect(aside).toHaveTextContent(/Você paga hoje\s*R\$\s89,90/);
    expect(aside).toHaveTextContent("Pagamento único. Nada é cobrado de novo sem você pedir.");
    expect(screen.getByRole("heading", { level: 2, name: "7 dias de garantia" })).toBeInTheDocument();
    expect(aside).toHaveTextContent("Se não servir para a sua realidade de sala, devolvemos o valor integral em até 7 dias. É só pedir pelo suporte.");
    expect(aside).not.toHaveTextContent("Renova todo mês");
    expect(aside).not.toHaveTextContent("estornada integralmente na área Créditos");
    expect(screen.getByRole("list", { name: "O que você recebe" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Segurança" })).toBeInTheDocument();
    expect(aside.textContent).not.toContain("\u2014");
  });
});
