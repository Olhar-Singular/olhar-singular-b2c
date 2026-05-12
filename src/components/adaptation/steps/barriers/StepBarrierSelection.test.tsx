import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StepBarrierSelection } from "./StepBarrierSelection";
import type { WizardData } from "@/lib/domain/adaptationWizardHelpers";

const mockBarrierProfiles = [
  {
    id: "prof-1",
    user_id: "user-1",
    barriers: ["tea_sensory", "attention_sustained"],
    observation: "Aluno com TEA leve",
    created_at: "2026-01-01",
  },
];

vi.mock("@/hooks/useBarrierProfiles", () => ({
  useBarrierProfiles: vi.fn(() => ({
    data: mockBarrierProfiles,
    isLoading: false,
  })),
}));

const mockUseAuth = vi.fn(() => ({
  profile: { free_adaptation_used: false, credit_balance: 30 },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const baseData: WizardData = {
  activityType: "exercício",
  activityText: "Texto da atividade",
  barriers: [],
  barrierProfileId: null,
  result: null,
  wizardMode: "ai",
};

const mockUpdateData = vi.fn();
const mockOnNext = vi.fn();
const mockOnPrev = vi.fn();

function renderStep(data: WizardData = baseData) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StepBarrierSelection
        data={data}
        updateData={mockUpdateData}
        onNext={mockOnNext}
        onPrev={mockOnPrev}
      />
    </QueryClientProvider>
  );
}

describe("StepBarrierSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ profile: { free_adaptation_used: false, credit_balance: 30 } });
  });

  it("renders barrier dimension checkboxes", () => {
    renderStep();
    expect(screen.getByRole("heading", { name: /barreiras de aprendizagem/i })).toBeInTheDocument();
  });

  it("shows barrier profiles in selector", () => {
    renderStep();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("shows validation error when submitting with no barriers", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole("button", { name: /próximo/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("allows selecting a barrier checkbox", async () => {
    const user = userEvent.setup();
    renderStep();
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    expect(mockUpdateData).toHaveBeenCalled();
  });

  it("calls onNext when barriers are selected", async () => {
    const user = userEvent.setup();
    const dataWithBarriers: WizardData = {
      ...baseData,
      barriers: [{ dimension: "attention", barrier_key: "attention_sustained", label: "Atenção", is_active: true }],
    };
    renderStep(dataWithBarriers);
    await user.click(screen.getByRole("button", { name: /próximo/i }));
    expect(mockOnNext).toHaveBeenCalled();
  });

  it("has a back button that calls onPrev", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole("button", { name: /voltar/i }));
    expect(mockOnPrev).toHaveBeenCalled();
  });

  it("loads barriers from a saved profile when selected", async () => {
    const user = userEvent.setup();
    renderStep();
    const select = screen.getByLabelText(/Carregar perfil/i) as HTMLSelectElement;
    await user.selectOptions(select, "prof-1");
    expect(mockUpdateData).toHaveBeenCalledWith(
      expect.objectContaining({ barrierProfileId: "prof-1" }),
    );
  });

  it("clears selection when profile is reset to empty", async () => {
    const user = userEvent.setup();
    renderStep({ ...baseData, barrierProfileId: "prof-1" });
    const select = screen.getByLabelText(/Carregar perfil/i) as HTMLSelectElement;
    await user.selectOptions(select, "");
    expect(mockUpdateData).toHaveBeenCalledWith({ barrierProfileId: null, barriers: [] });
  });

  it("forwards observation notes to updateData", () => {
    renderStep();
    const ta = screen.getByLabelText(/Observações adicionais/i);
    fireEvent.change(ta, { target: { value: "obs extra" } });
    expect(mockUpdateData).toHaveBeenCalledWith({ observationNotes: "obs extra" });
  });

  it("does not show credit badge when no barriers are selected", () => {
    renderStep();
    expect(screen.queryByText(/Grátis/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/créditos/i)).not.toBeInTheDocument();
  });

  it("shows 'Grátis' badge when barriers are selected and first adaptation is free", () => {
    mockUseAuth.mockReturnValue({ profile: { free_adaptation_used: false, credit_balance: 30 } });
    renderStep({
      ...baseData,
      barriers: [{ dimension: "tea", barrier_key: "tea_abstracao", label: "TEA", is_active: true }],
    });
    expect(screen.getByText(/Grátis/i)).toBeInTheDocument();
    expect(screen.getByText(/primeira adaptação por IA/i)).toBeInTheDocument();
  });

  it("shows credit cost badge when barriers are selected and free adaptation was used", () => {
    mockUseAuth.mockReturnValue({ profile: { free_adaptation_used: true, credit_balance: 30 } });
    renderStep({
      ...baseData,
      barriers: [{ dimension: "tea", barrier_key: "tea_abstracao", label: "TEA", is_active: true }],
    });
    expect(screen.getByText(/12 créditos/i)).toBeInTheDocument();
    expect(screen.getByText(/complexidade alta/i)).toBeInTheDocument();
  });

  it("shows lower credit cost for low-complexity barriers", () => {
    mockUseAuth.mockReturnValue({ profile: { free_adaptation_used: true, credit_balance: 30 } });
    renderStep({
      ...baseData,
      barriers: [{ dimension: "dislexia", barrier_key: "dislexia_leitura", label: "Dislexia", is_active: true }],
    });
    expect(screen.getByText(/5 créditos/i)).toBeInTheDocument();
    expect(screen.getByText(/complexidade baixa/i)).toBeInTheDocument();
  });

  it("escalates to highest complexity when multiple dimensions are selected", () => {
    mockUseAuth.mockReturnValue({ profile: { free_adaptation_used: true, credit_balance: 30 } });
    renderStep({
      ...baseData,
      barriers: [
        { dimension: "dislexia", barrier_key: "dislexia_leitura", label: "Dislexia", is_active: true },
        { dimension: "tea", barrier_key: "tea_abstracao", label: "TEA", is_active: true },
      ],
    });
    expect(screen.getByText(/12 créditos/i)).toBeInTheDocument();
    expect(screen.getByText(/complexidade alta/i)).toBeInTheDocument();
  });

  it("clears the alert after a successful next", async () => {
    const user = userEvent.setup();
    const { rerender } = renderStep();
    await user.click(screen.getByRole("button", { name: /próximo/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={qc}>
        <StepBarrierSelection
          data={{
            ...baseData,
            barriers: [{ dimension: "tea", barrier_key: "x", label: "X", is_active: true }],
          }}
          updateData={mockUpdateData}
          onNext={mockOnNext}
          onPrev={mockOnPrev}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: /próximo/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
