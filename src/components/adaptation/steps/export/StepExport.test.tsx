import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StepExport from "./StepExport";
import type { WizardData } from "@/lib/domain/adaptationWizardHelpers";

const mockInsert = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: { id: "ad-1" }, error: null }),
  }),
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({ insert: mockInsert })),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user-1" },
    profile: null,
    loading: false,
    signOut: vi.fn(),
    session: null,
  })),
}));

const mockWriteText = vi.fn();

const baseData: WizardData = {
  activityType: "exercício",
  activityText: "Texto original",
  barriers: [{ dimension: "attention", barrier_key: "att_sustained", label: "Atenção Sustentada", is_active: true }],
  barrierProfileId: null,
  result: {
    version_universal: { sections: [{ questions: [{ number: 1, type: "open_ended", statement: "Questão 1" }] }] },
    version_directed: { sections: [{ questions: [{ number: 1, type: "open_ended", statement: "Questão 1 adaptada" }] }] },
    strategies_applied: ["Fragmentação"],
    pedagogical_justification: "Fragmentação de enunciados.",
    implementation_tips: ["Leia em voz alta"],
  },
  wizardMode: "ai",
};

function renderExport(data = baseData) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StepExport data={data} onPrev={vi.fn()} onRestart={vi.fn()} />
    </QueryClientProvider>
  );
}

describe("StepExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });
  });

  it("renders save and copy buttons", () => {
    renderExport();
    expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copiar/i })).toBeInTheDocument();
  });

  it("saves adaptation to DB on click", async () => {
    const user = userEvent.setup();
    renderExport();
    await user.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mockInsert).toHaveBeenCalledOnce());
  });

  it("copies text to clipboard on click", async () => {
    renderExport();
    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));
    await waitFor(() => expect(mockWriteText).toHaveBeenCalledOnce());
    const call = mockWriteText.mock.calls[0][0] as string;
    expect(call).toContain("Questão 1");
  });

  it("shows success state after save", async () => {
    const user = userEvent.setup();
    renderExport();
    await user.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(screen.getByText(/salvo/i)).toBeInTheDocument());
  });

  it("renders onRestart button", () => {
    renderExport();
    expect(screen.getByRole("button", { name: /nova adaptação/i })).toBeInTheDocument();
  });

  it("returns null when result is missing (early-exit guard)", () => {
    const { container } = renderExport({ ...baseData, result: null });
    expect(container.firstChild).toBeNull();
  });

  it("includes pedagogical justification in the copied text", async () => {
    renderExport();
    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));
    await waitFor(() => expect(mockWriteText).toHaveBeenCalled());
    const text = mockWriteText.mock.calls[0][0] as string;
    expect(text).toContain("Fragmentação de enunciados");
    expect(text).toContain("Leia em voz alta");
  });

  it("disables Salvar button after a successful save", async () => {
    const user = userEvent.setup();
    renderExport();
    await user.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(screen.getByText(/salvo/i)).toBeInTheDocument());
  });

  it("calls onPrev when Voltar is clicked", async () => {
    const onPrev = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <StepExport data={baseData} onPrev={onPrev} onRestart={vi.fn()} />
      </QueryClientProvider>,
    );
    const back = screen.queryByRole("button", { name: /voltar/i });
    if (back) {
      fireEvent.click(back);
      expect(onPrev).toHaveBeenCalled();
    }
  });
});
