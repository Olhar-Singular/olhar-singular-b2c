import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StepBarrierSelection } from "./StepBarrierSelection";
import type { WizardData } from "@/lib/adaptation/wizard/wizardState";
import { useBarrierProfiles, useCreateBarrierProfile } from "@/hooks/useBarrierProfiles";

const mockBarrierProfiles = [
  {
    id: "prof-1",
    user_id: "user-1",
    barriers: ["tea_sensory", "attention_sustained"],
    observation: "Aluno com TEA leve",
    name: "Aluno TEA",
    created_at: "2026-01-01",
  },
];

const mockMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/useBarrierProfiles", () => ({
  useBarrierProfiles: vi.fn(() => ({
    data: mockBarrierProfiles,
    isLoading: false,
  })),
  useCreateBarrierProfile: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
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
    mockMutateAsync.mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({ profile: { free_adaptation_used: false, credit_balance: 30 } });
    vi.mocked(useBarrierProfiles).mockReturnValue({ data: mockBarrierProfiles, isLoading: false } as never);
    vi.mocked(useCreateBarrierProfile).mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false } as never);
  });

  it("renders the barrier step heading", () => {
    renderStep();
    expect(screen.getByRole("heading", { name: /barreiras de aprendizagem/i })).toBeInTheDocument();
  });

  it("shows barrier profiles in the selector dropdown", () => {
    renderStep();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("shows empty-state message when there are no barrier profiles", () => {
    vi.mocked(useBarrierProfiles).mockReturnValueOnce({ data: [], isLoading: false } as never);
    renderStep();
    expect(screen.getByText(/Nenhum perfil criado/i)).toBeInTheDocument();
  });

  it("shows profile name in dropdown", () => {
    renderStep();
    expect(screen.getByRole("combobox").textContent).toContain("Aluno TEA");
  });

  it("shows 'Perfil sem nome' in dropdown when profile has no name", () => {
    vi.mocked(useBarrierProfiles).mockReturnValueOnce({
      data: [{ id: "p-1", user_id: "u1", barriers: ["tea_abstracao"], observation: "", name: null, created_at: "2026-01-01" }],
      isLoading: false,
    } as never);
    renderStep();
    expect(screen.getByRole("combobox").textContent).toContain("Perfil sem nome");
  });

  it("does not show barrier checkboxes on the main page", () => {
    renderStep();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("loads barriers from a selected profile into updateData", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.selectOptions(screen.getByRole("combobox"), "prof-1");
    expect(mockUpdateData).toHaveBeenCalledWith(
      expect.objectContaining({ barrierProfileId: "prof-1" }),
    );
  });

  it("clears selection when profile is reset to empty", async () => {
    const user = userEvent.setup();
    renderStep({ ...baseData, barrierProfileId: "prof-1" });
    await user.selectOptions(screen.getByRole("combobox"), "");
    expect(mockUpdateData).toHaveBeenCalledWith({ barrierProfileId: null, barriers: [] });
  });

  it("maps profile barrier to known dimension when key exists in BARRIER_DIMENSIONS", async () => {
    const user = userEvent.setup();
    vi.mocked(useBarrierProfiles).mockReturnValueOnce({
      data: [{ id: "p-known", user_id: "u1", barriers: ["tea_abstracao"], observation: "", name: "Known", created_at: "2026-01-01" }],
      isLoading: false,
    } as never);
    renderStep();
    await user.selectOptions(screen.getByRole("combobox"), "p-known");
    expect(mockUpdateData).toHaveBeenCalledWith(
      expect.objectContaining({ barriers: [expect.objectContaining({ dimension: "tea" })] }),
    );
  });

  it("maps unknown barrier key to dimension 'other'", async () => {
    const user = userEvent.setup();
    vi.mocked(useBarrierProfiles).mockReturnValueOnce({
      data: [{ id: "p-unk", user_id: "u1", barriers: ["totally_unknown_key"], observation: "", name: "Unk", created_at: "2026-01-01" }],
      isLoading: false,
    } as never);
    renderStep();
    await user.selectOptions(screen.getByRole("combobox"), "p-unk");
    expect(mockUpdateData).toHaveBeenCalledWith(
      expect.objectContaining({
        barriers: [expect.objectContaining({ dimension: "other", barrier_key: "totally_unknown_key" })],
      }),
    );
  });

  it("shows barrier tags when a profile is selected and barriers are loaded", () => {
    renderStep({
      ...baseData,
      barrierProfileId: "prof-1",
      barriers: [
        { dimension: "tea", barrier_key: "tea_sensory", label: "Sobrecarga sensorial", is_active: true },
        { dimension: "attention", barrier_key: "attention_sustained", label: "Atenção sustentada", is_active: true },
      ],
    });
    expect(screen.getByText("Sobrecarga sensorial")).toBeInTheDocument();
    expect(screen.getByText("Atenção sustentada")).toBeInTheDocument();
  });

  it("does not show barrier tags section when no profile is selected", () => {
    renderStep();
    expect(screen.queryByText(/Barreiras do perfil/i)).not.toBeInTheDocument();
  });

  it("shows error when no profile is selected and user clicks Adaptar", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole("button", { name: /adaptar/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/selecione um perfil/i);
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it("shows error when profile has no barriers and user clicks Adaptar", async () => {
    const user = userEvent.setup();
    renderStep({ ...baseData, barrierProfileId: "prof-1", barriers: [] });
    await user.click(screen.getByRole("button", { name: /adaptar/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/não possui barreiras/i);
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it("calls onNext when a profile and barriers are set", async () => {
    const user = userEvent.setup();
    renderStep({
      ...baseData,
      barrierProfileId: "prof-1",
      barriers: [{ dimension: "tea", barrier_key: "tea_abstracao", label: "TEA", is_active: true }],
    });
    await user.click(screen.getByRole("button", { name: /adaptar/i }));
    expect(mockOnNext).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("calls onPrev when Voltar is clicked", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole("button", { name: /voltar/i }));
    expect(mockOnPrev).toHaveBeenCalled();
  });

  it("does not show credit badge when no barriers are selected", () => {
    renderStep();
    expect(screen.queryByText(/Grátis/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/créditos/i)).not.toBeInTheDocument();
  });

  it("shows 'Grátis' badge when barriers exist and first adaptation is free", () => {
    mockUseAuth.mockReturnValue({ profile: { free_adaptation_used: false, credit_balance: 30 } });
    renderStep({
      ...baseData,
      barrierProfileId: "prof-1",
      barriers: [{ dimension: "tea", barrier_key: "tea_abstracao", label: "TEA", is_active: true }],
    });
    expect(screen.getByText(/Grátis/i)).toBeInTheDocument();
    expect(screen.getByText(/primeira adaptação por IA/i)).toBeInTheDocument();
  });

  it("shows credit cost badge when barriers exist and free adaptation was used", () => {
    mockUseAuth.mockReturnValue({ profile: { free_adaptation_used: true, credit_balance: 30 } });
    renderStep({
      ...baseData,
      barrierProfileId: "prof-1",
      barriers: [{ dimension: "tea", barrier_key: "tea_abstracao", label: "TEA", is_active: true }],
    });
    expect(screen.getByText(/12 créditos/i)).toBeInTheDocument();
    expect(screen.getByText(/complexidade alta/i)).toBeInTheDocument();
  });

  it("shows lower credit cost for low-complexity barriers", () => {
    mockUseAuth.mockReturnValue({ profile: { free_adaptation_used: true, credit_balance: 30 } });
    renderStep({
      ...baseData,
      barrierProfileId: "prof-1",
      barriers: [{ dimension: "dislexia", barrier_key: "dislexia_leitura", label: "Dislexia", is_active: true }],
    });
    expect(screen.getByText(/5 créditos/i)).toBeInTheDocument();
    expect(screen.getByText(/complexidade baixa/i)).toBeInTheDocument();
  });

  it("escalates to highest complexity when multiple dimensions are selected", () => {
    mockUseAuth.mockReturnValue({ profile: { free_adaptation_used: true, credit_balance: 30 } });
    renderStep({
      ...baseData,
      barrierProfileId: "prof-1",
      barriers: [
        { dimension: "dislexia", barrier_key: "dislexia_leitura", label: "Dislexia", is_active: true },
        { dimension: "tea", barrier_key: "tea_abstracao", label: "TEA", is_active: true },
      ],
    });
    expect(screen.getByText(/12 créditos/i)).toBeInTheDocument();
    expect(screen.getByText(/complexidade alta/i)).toBeInTheDocument();
  });

  it("clears the error after a successful Adaptar", async () => {
    const user = userEvent.setup();
    const { rerender } = renderStep();
    await user.click(screen.getByRole("button", { name: /adaptar/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={qc}>
        <StepBarrierSelection
          data={{ ...baseData, barrierProfileId: "prof-1", barriers: [{ dimension: "tea", barrier_key: "x", label: "X", is_active: true }] }}
          updateData={mockUpdateData}
          onNext={mockOnNext}
          onPrev={mockOnPrev}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: /adaptar/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // ── Profile creation ────────────────────────────────────────────────────────

  describe("profile creation", () => {
    it("shows 'Criar perfil' button when no profiles exist", () => {
      vi.mocked(useBarrierProfiles).mockReturnValueOnce({ data: [], isLoading: false } as never);
      renderStep();
      expect(screen.getByRole("button", { name: /criar perfil/i })).toBeInTheDocument();
    });

    it("shows '+ Novo' button when profiles exist", () => {
      renderStep();
      expect(screen.getByRole("button", { name: /novo/i })).toBeInTheDocument();
    });

    it("clicking 'Criar perfil' opens the creation dialog", async () => {
      const user = userEvent.setup();
      vi.mocked(useBarrierProfiles).mockReturnValueOnce({ data: [], isLoading: false } as never);
      renderStep();
      await user.click(screen.getByRole("button", { name: /criar perfil/i }));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      expect(screen.getByText(/Criar perfil de barreira/i)).toBeInTheDocument();
    });

    it("clicking '+ Novo' opens the creation dialog", async () => {
      const user = userEvent.setup();
      renderStep();
      await user.click(screen.getByRole("button", { name: /novo/i }));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    });

    it("closing the dialog hides it", async () => {
      const user = userEvent.setup();
      vi.mocked(useBarrierProfiles).mockReturnValueOnce({ data: [], isLoading: false } as never);
      renderStep();
      await user.click(screen.getByRole("button", { name: /criar perfil/i }));
      await waitFor(() => screen.getByRole("dialog"));
      fireEvent.click(screen.getByRole("button", { name: /close/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("submitting the form calls mutateAsync with the form values", async () => {
      const user = userEvent.setup();
      vi.mocked(useBarrierProfiles).mockReturnValue({ data: [], isLoading: false } as never);
      renderStep();
      await user.click(screen.getByRole("button", { name: /criar perfil/i }));
      await waitFor(() => screen.getByRole("dialog"));

      await user.type(screen.getByLabelText(/Nome do perfil/i), "Perfil Teste");
      await user.click(within(screen.getByRole("dialog")).getAllByRole("checkbox")[0]);
      await user.click(screen.getByRole("button", { name: /salvar perfil/i }));

      await waitFor(() =>
        expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: "Perfil Teste" })),
      );
    });

    it("dialog closes after successful submission", async () => {
      const user = userEvent.setup();
      vi.mocked(useBarrierProfiles).mockReturnValue({ data: [], isLoading: false } as never);
      renderStep();
      await user.click(screen.getByRole("button", { name: /criar perfil/i }));
      await waitFor(() => screen.getByRole("dialog"));

      await user.type(screen.getByLabelText(/Nome do perfil/i), "Novo");
      await user.click(within(screen.getByRole("dialog")).getAllByRole("checkbox")[0]);
      await user.click(screen.getByRole("button", { name: /salvar perfil/i }));

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("auto-selects the newest profile after creation when profiles list updates", async () => {
      const user = userEvent.setup();
      vi.mocked(useBarrierProfiles).mockReturnValue({ data: [], isLoading: false } as never);
      const { rerender } = renderStep();

      await user.click(screen.getByRole("button", { name: /criar perfil/i }));
      await waitFor(() => screen.getByRole("dialog"));
      await user.type(screen.getByLabelText(/Nome do perfil/i), "Novo Perfil");
      await user.click(within(screen.getByRole("dialog")).getAllByRole("checkbox")[0]);
      await user.click(screen.getByRole("button", { name: /salvar perfil/i }));
      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());

      const newProfile = { id: "new-1", user_id: "u1", barriers: ["tea_abstracao"], name: "Novo Perfil", observation: null, created_at: "2026-06-18" };
      vi.mocked(useBarrierProfiles).mockReturnValue({ data: [newProfile], isLoading: false } as never);

      const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      rerender(
        <QueryClientProvider client={qc2}>
          <StepBarrierSelection data={baseData} updateData={mockUpdateData} onNext={mockOnNext} onPrev={mockOnPrev} />
        </QueryClientProvider>,
      );

      await waitFor(() =>
        expect(mockUpdateData).toHaveBeenCalledWith(expect.objectContaining({ barrierProfileId: "new-1" })),
      );
    });

    it("auto-select: maps unknown key to dimension 'other' when profiles refetch", async () => {
      const user = userEvent.setup();
      vi.mocked(useBarrierProfiles).mockReturnValue({ data: [], isLoading: false } as never);
      const { rerender } = renderStep();

      await user.click(screen.getByRole("button", { name: /criar perfil/i }));
      await waitFor(() => screen.getByRole("dialog"));
      await user.type(screen.getByLabelText(/Nome do perfil/i), "Perfil X");
      await user.click(within(screen.getByRole("dialog")).getAllByRole("checkbox")[0]);
      await user.click(screen.getByRole("button", { name: /salvar perfil/i }));
      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());

      const profileWithUnknown = { id: "p-unk", user_id: "u1", barriers: ["totally_unknown_key_xyz"], name: "Perfil X", observation: null, created_at: "2026-06-18" };
      vi.mocked(useBarrierProfiles).mockReturnValue({ data: [profileWithUnknown], isLoading: false } as never);

      const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      rerender(
        <QueryClientProvider client={qc2}>
          <StepBarrierSelection data={baseData} updateData={mockUpdateData} onNext={mockOnNext} onPrev={mockOnPrev} />
        </QueryClientProvider>,
      );

      await waitFor(() =>
        expect(mockUpdateData).toHaveBeenCalledWith(
          expect.objectContaining({
            barriers: expect.arrayContaining([
              expect.objectContaining({ dimension: "other", barrier_key: "totally_unknown_key_xyz" }),
            ]),
          }),
        ),
      );
    });

    it("shows 'Salvando...' button (disabled) while mutation is pending", async () => {
      const user = userEvent.setup();
      vi.mocked(useCreateBarrierProfile).mockReturnValue({ mutateAsync: vi.fn(), isPending: true } as never);
      vi.mocked(useBarrierProfiles).mockReturnValue({ data: [], isLoading: false } as never);
      renderStep();
      await user.click(screen.getByRole("button", { name: /criar perfil/i }));
      await waitFor(() => screen.getByRole("dialog"));
      expect(screen.getByRole("button", { name: /salvando/i })).toBeDisabled();
    });
  });
});
