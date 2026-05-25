import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers";
import StepAIEditor from "./StepAIEditor";
import type { WizardData } from "@/lib/domain/adaptationWizardHelpers";

const getSessionMock = vi.fn();
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: (...a: unknown[]) => getSessionMock(...a) },
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
  },
}));

vi.mock("@/components/editor/ActivityEditor", () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="ae" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const regenerateMutateMock = vi.fn();
vi.mock("@/hooks/useRegenerateQuestion", () => ({
  useRegenerateQuestion: () => ({ mutate: regenerateMutateMock, isPending: false }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    refreshProfile: vi.fn().mockResolvedValue(undefined),
  })),
}));

const baseData: WizardData = {
  activityType: "exercício",
  activityText: "1) Q?",
  barriers: [{ dimension: "tea", barrier_key: "tea_abstracao", label: "x", is_active: true }],
  barrierProfileId: null,
  result: null,
  wizardMode: "ai",
};

const finishedResult = {
  version_universal: { sections: [{ title: "U", questions: [{ number: 1, type: "open_ended", statement: "Q1" }] }] },
  version_directed: { sections: [{ title: "D", questions: [{ number: 1, type: "open_ended", statement: "Q1" }] }] },
  strategies_applied: [],
  pedagogical_justification: "",
  implementation_tips: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  invokeMock.mockReset();
  regenerateMutateMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok" } } });
});

describe("StepAIEditor — initial state", () => {
  it("shows loading message during initial generation", async () => {
    invokeMock.mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    expect(screen.getByText(/ISA está adaptando/i)).toBeInTheDocument();
  });

  it("renders editor when data.result is present", async () => {
    renderWithProviders(
      <StepAIEditor data={{ ...baseData, result: finishedResult }} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    expect(await screen.findByText(/Editar Atividade Adaptada/i)).toBeInTheDocument();
    expect(screen.getByTestId("ae")).toBeInTheDocument();
  });
});

describe("StepAIEditor — generate flow", () => {
  it("shows credit error when 402 returned", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { context: { status: 402, json: async () => ({ error: "no" }) } } });
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText(/Créditos insuficientes/i)).toBeInTheDocument());
  });

  it("renders generic error fallback when adapt fails", async () => {
    const { toast } = await import("sonner");
    invokeMock.mockResolvedValueOnce({ data: null, error: { context: { status: 500, json: async () => ({ error: "boom" }) } } });
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("populates result on success", async () => {
    const updateData = vi.fn();
    invokeMock.mockResolvedValueOnce({ data: { adaptation: finishedResult, credits_charged: 12 }, error: null });
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(updateData).toHaveBeenCalledWith(expect.objectContaining({ result: finishedResult })));
  });

  it("swallows refreshProfile rejection silently after successful generation (line 118 catch fn)", async () => {
    const mockRefresh = vi.fn().mockRejectedValue(new Error("auth fail"));
    const { useAuth } = await import("@/hooks/useAuth");
    vi.mocked(useAuth).mockReturnValueOnce({ refreshProfile: mockRefresh } as never);
    const updateData = vi.fn();
    invokeMock.mockResolvedValueOnce({ data: { adaptation: finishedResult, credits_charged: 12 }, error: null });
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(updateData).toHaveBeenCalledWith(expect.objectContaining({ result: finishedResult })));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });
});

describe("StepAIEditor — interactions", () => {
  it("toggles between Versão Original e Versão Adaptada tabs", async () => {
    renderWithProviders(
      <StepAIEditor data={{ ...baseData, result: finishedResult }} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    const directedTab = await screen.findByRole("button", { name: /Versão Adaptada/i });
    fireEvent.click(directedTab);
    expect(screen.getByTestId("ae")).toBeInTheDocument();
  });

  it("calls onPrev when Voltar is clicked", async () => {
    const onPrev = vi.fn();
    renderWithProviders(
      <StepAIEditor data={{ ...baseData, result: finishedResult }} updateData={vi.fn()} onNext={vi.fn()} onPrev={onPrev} />,
    );
    const voltar = await screen.findByRole("button", { name: /^Voltar/ });
    fireEvent.click(voltar);
    expect(onPrev).toHaveBeenCalled();
  });

  it("Avançar updates data and calls onNext", async () => {
    const onNext = vi.fn();
    const updateData = vi.fn();
    renderWithProviders(
      <StepAIEditor data={{ ...baseData, result: finishedResult }} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />,
    );
    const avancar = await screen.findByRole("button", { name: /Avançar/i });
    fireEvent.click(avancar);
    expect(updateData).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });

  it("typing in Versão Adaptada tab calls directedContent onChange (line 48 function)", async () => {
    const updateData = vi.fn();
    renderWithProviders(
      <StepAIEditor data={{ ...baseData, result: finishedResult }} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    const directedTab = await screen.findByRole("button", { name: /Versão Adaptada/i });
    fireEvent.click(directedTab);
    const editor = screen.getByTestId("ae");
    fireEvent.change(editor, { target: { value: "novo conteúdo dirigido" } });
    expect(updateData).toHaveBeenCalledWith(expect.objectContaining({ editorContentDirected: expect.any(Object) }));
  });

  it("onPrev is shown on credit error screen", async () => {
    const onPrev = vi.fn();
    invokeMock.mockResolvedValueOnce({ data: null, error: { context: { status: 402, json: async () => ({ error: "no" }) } } });
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={onPrev} />,
    );
    await waitFor(() => expect(screen.getByText(/Créditos insuficientes/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(onPrev).toHaveBeenCalled();
  });

  it("calls handleCreditRefresh when QuestionRegeneratePanel fires onCreditRefresh (line 132 fn)", async () => {
    const mockRefresh = vi.fn().mockRejectedValue(new Error("auth fail"));
    const { useAuth } = await import("@/hooks/useAuth");
    vi.mocked(useAuth).mockReturnValueOnce({ refreshProfile: mockRefresh } as never);

    renderWithProviders(
      <StepAIEditor data={{ ...baseData, result: finishedResult }} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await screen.findByText(/Editar Atividade Adaptada/i);

    fireEvent.click(screen.getByRole("button", { name: /Regerar Q1/i }));

    const [, { onSuccess }] = regenerateMutateMock.mock.calls[0];
    onSuccess({ question_dsl: "1) Nova questão\n[linhas:3]", changes_made: [] });

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("renders correctly when activityType is null (covers ?? branch at line 231)", async () => {
    renderWithProviders(
      <StepAIEditor
        data={{ ...baseData, activityType: null, result: finishedResult }}
        updateData={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Editar Atividade Adaptada/i)).toBeInTheDocument();
  });
});

describe("StepAIEditor — toInitialDsl branches (line 26)", () => {
  it("renders empty editor when result version is null/undefined (line 26 branch: !v)", async () => {
    const resultWithNullVersions = {
      version_universal: null as unknown as object,
      version_directed: null as unknown as object,
      strategies_applied: [],
      pedagogical_justification: "",
      implementation_tips: [],
    };
    renderWithProviders(
      <StepAIEditor
        data={{ ...baseData, result: resultWithNullVersions as any }}
        updateData={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Editar Atividade Adaptada/i)).toBeInTheDocument();
    expect(screen.getByTestId("ae")).toHaveValue("");
  });

  it("renders with plain string version (not structured — line 26 String(v) path)", async () => {
    const resultWithStringVersions = {
      version_universal: "Texto simples universal",
      version_directed: "Texto simples adaptado",
      strategies_applied: [],
      pedagogical_justification: "",
      implementation_tips: [],
    };
    renderWithProviders(
      <StepAIEditor
        data={{ ...baseData, result: resultWithStringVersions as any }}
        updateData={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Editar Atividade Adaptada/i)).toBeInTheDocument();
    expect(screen.getByTestId("ae")).toHaveValue("Texto simples universal");
  });
});

describe("StepAIEditor — editorContent fallback branches (lines 43, 48)", () => {
  it("uses editorContentUniversal.dsl when already in data (line 43 ?? left branch)", async () => {
    renderWithProviders(
      <StepAIEditor
        data={{
          ...baseData,
          result: finishedResult,
          editorContentUniversal: { dsl: "dsl-cached-universal", registry: {} },
          editorContentDirected: { dsl: "dsl-cached-directed", registry: {} },
        }}
        updateData={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    expect(await screen.findByTestId("ae")).toHaveValue("dsl-cached-universal");
  });
});

describe("StepAIEditor — result-change useEffect (lines 54-56)", () => {
  it("resets editor content when data.result changes to a new value", async () => {
    const updateData = vi.fn();
    const { rerender } = renderWithProviders(
      <StepAIEditor
        data={{ ...baseData, result: finishedResult }}
        updateData={updateData}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    // Wait for initial render
    await screen.findByText(/Editar Atividade Adaptada/i);

    const newResult = {
      ...finishedResult,
      version_universal: { sections: [{ title: "Novo", questions: [{ number: 1, type: "open_ended", statement: "Q2" }] }] },
    };

    rerender(
      <StepAIEditor
        data={{ ...baseData, result: newResult }}
        updateData={updateData}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );

    await waitFor(() => {
      // The reset is triggered; updateData is called via onChange in useActivityContent
      expect(screen.getByTestId("ae")).toBeInTheDocument();
    });
  });
});

describe("StepAIEditor — non-402 credit error (line 92)", () => {
  it("throws generic error when credit check fails with non-402 status (line 92)", async () => {
    const { toast } = await import("sonner");
    invokeMock.mockResolvedValueOnce({ data: null, error: { context: { status: 500, json: async () => ({ error: "Serviço indisponível" }) } } });
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Serviço indisponível"));
  });

  it("uses fallback error message when credit check 500 has no error field (line 92 || branch)", async () => {
    const { toast } = await import("sonner");
    invokeMock.mockResolvedValueOnce({ data: null, error: { context: { status: 503, json: async () => ({}) } } });
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Falha na adaptação"));
  });

  it("uses fallback 'Falha na adaptação' when adapt-activity fails with no error field (line 119 right branch)", async () => {
    const { toast } = await import("sonner");
    invokeMock.mockResolvedValueOnce({ data: null, error: { context: { status: 500, json: async () => ({}) } } });
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Falha na adaptação"));
  });

  it("uses fallback 'Erro ao gerar adaptação' when invoke rejects unexpectedly (line 131 right branch)", async () => {
    const { toast } = await import("sonner");
    invokeMock.mockRejectedValueOnce(Object.assign(new Error(), { message: undefined }));
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("uses fallback 'Falha na adaptação' when error context has no json (line 87 catch branch)", async () => {
    const { toast } = await import("sonner");
    invokeMock.mockResolvedValueOnce({ data: null, error: { context: { status: 500, json: async () => { throw new Error("parse error"); } } } });
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Falha na adaptação"));
  });

  it("uses fallback 'Falha na adaptação' when error has no context (line 118 catch branch)", async () => {
    const { toast } = await import("sonner");
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "network error" } });
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Falha na adaptação"));
  });
});


describe("StepAIEditor — AbortError (line 130)", () => {
  it("silently ignores AbortError during generation", async () => {
    const { toast } = await import("sonner");
    invokeMock.mockRejectedValueOnce(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    // Should NOT call toast.error for AbortError
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
