import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StepBarrierSelection } from "./StepBarrierSelection";
import type { WizardData } from "@/lib/adaptationWizardHelpers";

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
});
