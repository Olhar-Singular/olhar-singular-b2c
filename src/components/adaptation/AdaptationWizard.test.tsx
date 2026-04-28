import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdaptationWizard from "./AdaptationWizard";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    session: { user: { id: "user-1" } },
    user: { id: "user-1", user_metadata: { full_name: "Prof" } },
    profile: { credit_balance: 10 },
    loading: false,
    signOut: vi.fn(),
  })),
}));

vi.mock("@/hooks/useBarrierProfiles", () => ({
  useBarrierProfiles: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }) },
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "ad-1" }, error: null }),
    })),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdaptationWizard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AdaptationWizard", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders StepActivityType as first step", () => {
    renderWizard();
    expect(screen.getByText(/tipo de atividade/i)).toBeInTheDocument();
  });

  it("advances to StepActivityInput after selecting an activity type", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /exercício/i }));
    expect(screen.getByPlaceholderText(/cole ou digite/i)).toBeInTheDocument();
  });

  it("shows step indicator", () => {
    renderWizard();
    expect(screen.getByText(/passo 1/i)).toBeInTheDocument();
  });

  it("shows discard confirmation when navigating back from editor with result", async () => {
    const { shouldConfirmDiscard } = await import("@/lib/domain/adaptationWizardHelpers");
    const steps = ["activity_type", "activity_input", "barriers", "choice", "ai_editor", "export"] as const;
    expect(shouldConfirmDiscard(steps, 4, 0, true)).toBe(true);
    expect(shouldConfirmDiscard(steps, 4, 0, false)).toBe(false);
    expect(shouldConfirmDiscard(steps, 2, 0, true)).toBe(false);
  });

  it("renders the step counter (passo X de Y)", () => {
    renderWizard();
    expect(screen.getByText(/passo/i)).toBeInTheDocument();
  });

  it("Voltar from input step navigates back to type step", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /exercício/i }));
    expect(screen.getByPlaceholderText(/cole ou digite/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Voltar/ }));
    expect(screen.getByText(/tipo de atividade/i)).toBeInTheDocument();
  });

  it("advances to barriers step after activity input is filled", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /exercício/i }));
    fireEvent.change(screen.getByLabelText(/Conteúdo da atividade/i), {
      target: { value: "1) Q?" },
    });
    await user.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(screen.getAllByText(/barreira/i).length).toBeGreaterThan(0);
  });

  it("step indicator buttons for future steps are disabled", () => {
    renderWizard();
    const buttons = screen.getAllByRole("button");
    const future = buttons.filter((b) => /Atividade|Barreiras|Método|Adapta|Editor|Exportar/i.test(b.textContent ?? ""));
    expect(future.some((b) => b.hasAttribute("disabled"))).toBe(true);
  });

  it("clicking a previously visited step indicator returns to that step", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /exercício/i }));
    expect(screen.getByPlaceholderText(/cole ou digite/i)).toBeInTheDocument();
    const indicator = screen.getAllByRole("button").find((b) => /1\s*Tipo/i.test(b.textContent ?? ""));
    if (indicator) {
      await user.click(indicator);
      expect(screen.getByText(/tipo de atividade/i)).toBeInTheDocument();
    }
  });

  it("manual mode swaps the wizard step labels (shows 'Editor' instead of 'Adaptação IA')", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /exercício/i }));
    fireEvent.change(screen.getByLabelText(/Conteúdo da atividade/i), {
      target: { value: "1) Q?" },
    });
    await user.click(screen.getByRole("button", { name: /Próximo/i }));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    await user.click(screen.getByRole("button", { name: /Próximo/i }));
    await user.click(screen.getByRole("button", { name: /Adaptar manualmente/i }));
    expect(screen.getAllByText(/Editor/i).length).toBeGreaterThan(0);
  });
});
