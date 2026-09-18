import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FaqSection from "./FaqSection";
import { renderWithProviders } from "@/test/helpers";

const { mockUsePlans } = vi.hoisted(() => ({ mockUsePlans: vi.fn() }));
vi.mock("@/hooks/useSubscription", () => ({ usePlans: mockUsePlans }));

beforeEach(() => {
  mockUsePlans.mockReturnValue({ data: undefined, isLoading: true });
});

describe("FaqSection", () => {
  it("renders the FAQ heading", () => {
    renderWithProviders(<FaqSection />);
    expect(screen.getByRole("heading", { name: /Perguntas frequentes/i })).toBeInTheDocument();
  });

  it("starts with all questions collapsed (aria-expanded=false)", () => {
    renderWithProviders(<FaqSection />);
    const buttons = screen.getAllByRole("button", { expanded: false });
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });

  it("expands a question on click and shows the answer", () => {
    renderWithProviders(<FaqSection />);
    const button = screen.getByRole("button", { name: /diagnóstico/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/barreiras pedagógicas observáveis/i)).toBeInTheDocument();
  });

  it("states the real adaptation cost range (5–12 credits), not the legacy flat 3", () => {
    renderWithProviders(<FaqSection />);
    const button = screen.getByRole("button", { name: /Quanto vale 1 crédito/i });
    fireEvent.click(button);
    expect(screen.getByText(/5 a 12 créditos/i)).toBeInTheDocument();
  });

  it("collapses again on second click", () => {
    renderWithProviders(<FaqSection />);
    const button = screen.getByRole("button", { name: /créditos expiram/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});

describe("FaqSection (subscription)", () => {
  it("answers how the subscription, cancelling, plan change and refund work", () => {
    renderWithProviders(<FaqSection />);
    expect(screen.getByRole("button", { name: /Como funciona a assinatura/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Posso cancelar quando quiser/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Como troco de plano/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /E se eu me arrepender/ })).toBeInTheDocument();
  });

  it("explains the 7-day trial with card and the cancel rule inside it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FaqSection />);
    await user.click(screen.getByRole("button", { name: "Como funciona o teste grátis de 7 dias?" }));
    expect(screen.getByText(/cartão de crédito/i)).toBeInTheDocument();
    expect(screen.getByText(/No 8º dia cobramos R\$ 39,90/)).toBeInTheDocument();
    expect(screen.getByText(/um teste por CPF/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Posso cancelar quando quiser?" }));
    expect(screen.getByText(/Durante o teste grátis, cancelar encerra o acesso na hora/)).toBeInTheDocument();
  });

  it("follows the catalogue for the plan the trial converts to, instead of a hardcoded price/name/quota", async () => {
    mockUsePlans.mockReturnValue({
      data: [{ id: "x", slug: "unico", name: "Único", priceBrl: 42, monthlyCredits: 120, highlight: false, adminOnly: false }],
      isLoading: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<FaqSection />);
    await user.click(screen.getByRole("button", { name: "Como funciona o teste grátis de 7 dias?" }));
    expect(screen.getByText(/No 8º dia cobramos R\$\s*42,00 e sua conta vira o plano Único, com 120 créditos por mês/)).toBeInTheDocument();
  });

  it("answers the regret question with the self-service refund of the last charge", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FaqSection />);
    await user.click(screen.getByRole("button", { name: /E se eu me arrepender/ }));
    expect(screen.getByText(/estorno integral da última cobrança/)).toBeInTheDocument();
    expect(screen.getByText(/até 30 dias depois de cancelar/)).toBeInTheDocument();
    expect(screen.getByText(/em até duas faturas/)).toBeInTheDocument();
  });
});
