import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FaqSection from "./FaqSection";
import { renderWithProviders } from "@/test/helpers";
import {
  ADAPTATION_COST_LABEL,
  EXTRAS_REFUND_DAYS,
  REFUND_WINDOW_DAYS,
  TRIAL_CREDITS,
  TRIAL_DAYS,
} from "@/lib/domain/subscriptionUi";
import { EXTRACTION_COST } from "@/lib/domain/extractionCost";

const { mockUsePlans } = vi.hoisted(() => ({ mockUsePlans: vi.fn() }));
vi.mock("@/hooks/useSubscription", () => ({ usePlans: mockUsePlans }));

// Sentinels that differ from the real figures: a copy that hardcodes a number
// instead of reading the constant cannot pass. The real cost label is pinned
// once, below, through vi.importActual.
vi.mock("@/lib/domain/subscriptionUi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domain/subscriptionUi")>()),
  ADAPTATION_COST_LABEL: "4, 7 ou 9",
  EXTRAS_REFUND_DAYS: 9,
  TRIAL_DAYS: 5,
}));
vi.mock("@/lib/domain/extractionCost", () => ({ EXTRACTION_COST: 6 }));

beforeEach(() => {
  mockUsePlans.mockReturnValue({ data: undefined, isLoading: true });
});

function panelOf(button: HTMLElement): HTMLElement {
  return document.getElementById(button.getAttribute("aria-controls")!)!;
}

async function openQuestion(name: string | RegExp): Promise<HTMLElement> {
  const user = userEvent.setup();
  const button = screen.getByRole("button", { name });
  await user.click(button);
  return panelOf(button);
}

describe("FaqSection", () => {
  it("renders the FAQ heading, labelled by the section and anchored for the header", () => {
    const { container } = renderWithProviders(<FaqSection />);
    const heading = screen.getByRole("heading", { level: 2, name: /Perguntas frequentes/i });
    const section = container.querySelector("section")!;
    expect(section).toHaveAttribute("id", "faq");
    expect(section).toHaveClass("scroll-mt-20");
    expect(section).toHaveAttribute("aria-labelledby", heading.id);
  });

  it("puts every question button inside an h3", () => {
    renderWithProviders(<FaqSection />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(10);
    for (const button of buttons) {
      expect(button).toHaveAttribute("type", "button");
      expect(button.parentElement?.tagName).toBe("H3");
    }
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(buttons.length);
  });

  it("starts with every question collapsed and its panel hidden", () => {
    renderWithProviders(<FaqSection />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(panelOf(button)).toHaveAttribute("hidden");
    }
  });

  it("points aria-controls at an existing panel labelled by its own button", () => {
    renderWithProviders(<FaqSection />);
    const ids = new Set<string>();
    for (const button of screen.getAllByRole("button")) {
      const panel = panelOf(button);
      expect(panel).not.toBeNull();
      expect(panel).toHaveAttribute("aria-labelledby", button.id);
      ids.add(panel.id);
    }
    expect(ids.size).toBe(screen.getAllByRole("button").length);
  });

  it("keeps the panels out of the landmark list: only the section itself is a region", () => {
    const { container } = renderWithProviders(<FaqSection />);
    for (const button of screen.getAllByRole("button")) {
      expect(panelOf(button)).not.toHaveAttribute("role");
    }
    // hidden: true also counts the collapsed panels, which are the ones that used to flood the list.
    expect(screen.getAllByRole("region", { hidden: true })).toEqual([container.querySelector("section")]);
  });

  it("expands a question on click and reveals the answer", () => {
    renderWithProviders(<FaqSection />);
    const button = screen.getByRole("button", { name: /diagnóstico/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panelOf(button)).not.toHaveAttribute("hidden");
    expect(within(panelOf(button)).getByText(/barreiras pedagógicas observáveis/i)).toBeInTheDocument();
  });

  it("collapses again on second click", () => {
    renderWithProviders(<FaqSection />);
    const button = screen.getByRole("button", { name: /créditos expiram/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panelOf(button)).toHaveAttribute("hidden");
  });

  it("keeps items independent: opening one does not close another", () => {
    renderWithProviders(<FaqSection />);
    const first = screen.getByRole("button", { name: /diagnóstico/i });
    const second = screen.getByRole("button", { name: /laudo/i });
    fireEvent.click(first);
    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "true");
  });

  it("draws the plus icon as decorative and respects reduced motion", () => {
    renderWithProviders(<FaqSection />);
    const button = screen.getByRole("button", { name: /diagnóstico/i });
    const icon = button.querySelector('[aria-hidden="true"]')!;
    expect(icon).toHaveTextContent("+");
    expect(icon).toHaveClass("motion-reduce:transition-none");
    expect(icon).not.toHaveClass("rotate-45");
    fireEvent.click(button);
    expect(icon).toHaveClass("rotate-45");
  });

  it("states the adaptation, exam reading and ISA costs, the first two read from the shared constants", async () => {
    renderWithProviders(<FaqSection />);
    const panel = await openQuestion(/Quanto vale 1 crédito/i);
    expect(within(panel).getByText(new RegExp(`Cada adaptação custa ${ADAPTATION_COST_LABEL} créditos`))).toBeInTheDocument();
    expect(
      within(panel).getByText(new RegExp(`prova enviada \\(PDF ou DOCX\\) custa ${EXTRACTION_COST}\\.`)),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/conversa nova com a ISA custa 3 créditos/)).toBeInTheDocument();
  });

  it("pins the real adaptation cost label the constant resolves to", async () => {
    const real = await vi.importActual<typeof import("@/lib/domain/subscriptionUi")>("@/lib/domain/subscriptionUi");
    expect(real.ADAPTATION_COST_LABEL).toBe("5, 8 ou 12");
  });

  it("separates plan credits (renew monthly) from extra credits (do not expire)", async () => {
    renderWithProviders(<FaqSection />);
    const panel = await openQuestion(/Os créditos expiram/);
    expect(within(panel).getByText(/renovam todo mês/)).toBeInTheDocument();
    expect(within(panel).getByText(/extras, comprados avulsos, não expiram/)).toBeInTheDocument();
  });

  it("answers the mobile question without promising the full editor", async () => {
    renderWithProviders(<FaqSection />);
    const panel = await openQuestion(/Funciona no celular/);
    expect(within(panel).getByText(/navegador do celular/)).toBeInTheDocument();
    expect(panel.textContent).not.toMatch(/editor completo/i);
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

  it("says the subscription is paid by card and processed by Mercado Pago", async () => {
    renderWithProviders(<FaqSection />);
    const panel = await openQuestion(/Como funciona a assinatura/);
    expect(within(panel).getByText(/cartão de crédito/)).toBeInTheDocument();
    expect(within(panel).getByText(/Mercado Pago/)).toBeInTheDocument();
  });

  it("explains the trial with card using the trial constants and the cancel rule inside it", async () => {
    renderWithProviders(<FaqSection />);
    const panel = await openQuestion(`Como funciona o teste grátis de ${TRIAL_DAYS} dias?`);
    expect(within(panel).getByText(/cartão de crédito/i)).toBeInTheDocument();
    expect(within(panel).getByText(new RegExp(`nada é cobrado por ${TRIAL_DAYS} dias`))).toBeInTheDocument();
    expect(within(panel).getByText(new RegExp(`você recebe ${TRIAL_CREDITS} créditos`))).toBeInTheDocument();
    expect(within(panel).getByText(new RegExp(`No ${TRIAL_DAYS + 1}º dia cobramos R\\$\\s*39,90`))).toBeInTheDocument();
    expect(within(panel).getByText(new RegExp(`Cancelou antes do ${TRIAL_DAYS + 1}º dia\\?`))).toBeInTheDocument();
    expect(within(panel).getByText(/um teste por CPF/i)).toBeInTheDocument();
    const cancel = await openQuestion("Posso cancelar quando quiser?");
    expect(
      within(cancel).getByText(/No teste grátis, cancelando até o dia anterior ao da primeira cobrança, o acesso encerra na hora/),
    ).toBeInTheDocument();
  });

  it("caps the free follow-up messages of an ISA conversation at the limit shown on screen (Termos)", async () => {
    renderWithProviders(<FaqSection />);
    const panel = await openQuestion('Quanto vale 1 crédito?'.replace(/^'|'$/g, ""));
    expect(
      within(panel).getByText(/não custam, até o limite de mensagens por conversa indicado na tela/),
    ).toBeInTheDocument();
  });

  it("follows the catalogue for the plan the trial converts to, instead of a hardcoded price/name/quota", async () => {
    mockUsePlans.mockReturnValue({
      data: [{ id: "x", slug: "unico", name: "Único", priceBrl: 42, monthlyCredits: 120, highlight: false, adminOnly: false }],
      isLoading: false,
    });
    renderWithProviders(<FaqSection />);
    const panel = await openQuestion(`Como funciona o teste grátis de ${TRIAL_DAYS} dias?`);
    expect(
      within(panel).getByText(
        new RegExp(`No ${TRIAL_DAYS + 1}º dia cobramos R\\$\\s*42,00 e sua conta vira o plano Único, com 120 créditos por mês`),
      ),
    ).toBeInTheDocument();
  });

  it("ignores the admin-only plan when picking the trial price", async () => {
    mockUsePlans.mockReturnValue({
      data: [
        { id: "a", slug: "smoke", name: "Smoke", priceBrl: 1, monthlyCredits: 5, highlight: false, adminOnly: true },
        { id: "b", slug: "pro", name: "Pro", priceBrl: 41.9, monthlyCredits: 310, highlight: true, adminOnly: false },
      ],
      isLoading: false,
    });
    renderWithProviders(<FaqSection />);
    const panel = await openQuestion(`Como funciona o teste grátis de ${TRIAL_DAYS} dias?`);
    expect(within(panel).getByText(/R\$\s*41,90 e sua conta vira o plano Pro/)).toBeInTheDocument();
  });

  it("answers the regret question with the self-service refund of the last charge", async () => {
    renderWithProviders(<FaqSection />);
    const panel = await openQuestion(/E se eu me arrepender/);
    expect(within(panel).getByText(/estorno integral da última cobrança/)).toBeInTheDocument();
    expect(within(panel).getByText(new RegExp(`até ${REFUND_WINDOW_DAYS} dias depois de cancelar`))).toBeInTheDocument();
    expect(within(panel).getByText(/em até duas faturas/)).toBeInTheDocument();
  });

  it("covers the unused extras refund window, handled by support through the account menu", async () => {
    renderWithProviders(<FaqSection />);
    const panel = await openQuestion(/E se eu me arrepender/);
    expect(
      within(panel).getByText(
        new RegExp(`extras não usados podem ser reembolsados em até ${EXTRAS_REFUND_DAYS} dias após a compra, pelo suporte no menu da sua conta\\.`),
      ),
    ).toBeInTheDocument();
  });
});

describe("FaqSection (limits and data)", () => {
  it("says the tool never replaces the teacher", async () => {
    renderWithProviders(<FaqSection />);
    const panel = await openQuestion(/substitui o professor/);
    expect(within(panel).getByText(/decisor final/)).toBeInTheDocument();
  });

  it("tells the teacher not to enter the student's full name or personal data, and links the privacy policy", async () => {
    renderWithProviders(<FaqSection />);
    const panel = await openQuestion(/nome do aluno/);
    expect(panel).toHaveTextContent(/Não informe nome completo nem dados pessoais do aluno/);
    expect(within(panel).getByRole("link", { name: /Política de Privacidade/ })).toHaveAttribute("href", "/privacidade");
  });

  it("does not carry copy the product cannot back", () => {
    renderWithProviders(<FaqSection />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/nota fiscal/i);
    expect(text).not.toMatch(/LGPD/);
    expect(text).not.toMatch(/educação básica/i);
    expect(text).not.toMatch(/nomeia condições/i);
    for (const code of [0x2013, 0x2014]) expect(text).not.toContain(String.fromCharCode(code));
    expect(text).not.toMatch(/Isa\b/);
    expect(text).not.toMatch(/undefined|NaN|\{\{/);
  });
});
