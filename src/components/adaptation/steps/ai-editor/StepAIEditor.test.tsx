import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers";
import StepAIEditor from "./StepAIEditor";
import type { WizardData } from "@/lib/domain/adaptationWizardHelpers";

const getSessionMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: (...a: unknown[]) => getSessionMock(...a) },
  },
}));

vi.mock("@/components/editor/ActivityEditor", () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="ae" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

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
  fetchMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok" } } });
});

describe("StepAIEditor — initial state", () => {
  it("shows loading message during initial generation", async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
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
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "no" }), { status: 402 }));
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText(/Créditos insuficientes/i)).toBeInTheDocument());
  });

  it("renders generic error fallback when adapt fails", async () => {
    const { toast } = await import("sonner");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("populates result on success", async () => {
    const updateData = vi.fn();
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ adaptation: finishedResult }), { status: 200 }));
    renderWithProviders(
      <StepAIEditor data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(updateData).toHaveBeenCalledWith(expect.objectContaining({ result: finishedResult })));
  });
});

describe("StepAIEditor — interactions", () => {
  it("toggles between Versão Original and Versão Adaptada tabs", async () => {
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
});
