import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers";
import { StepGenerate } from "./StepGenerate";
import { validateDocument } from "@/lib/adaptation/canonical/validate";
import type { AdaptationResult } from "@/lib/adaptation/canonical/schema";
import type { WizardData } from "@/lib/adaptation/wizard/wizardState";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ refreshProfile: vi.fn().mockResolvedValue(undefined) })),
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const result: AdaptationResult = {
  schemaVersion: 1,
  document: {
    schemaVersion: 1,
    blocks: [{ id: id(1), type: "paragraph", content: [{ type: "text", text: "adaptado" }] }],
  },
  strategies_applied: [],
  pedagogical_justification: "",
  implementation_tips: [],
};

const baseData: WizardData = {
  activityType: "exercício",
  activityText: "1) Q?",
  selectedQuestions: [],
  barriers: [{ dimension: "tea", barrier_key: "tea_abstracao", label: "x", is_active: true }],
  barrierProfileId: null,
  result: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  invokeMock.mockReset();
});

describe("StepGenerate", () => {
  it("shows the loading message during generation", () => {
    invokeMock.mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    expect(screen.getByText(/ISA está adaptando/i)).toBeInTheDocument();
  });

  it("sets a valid document on success and advances", async () => {
    const onResult = vi.fn();
    const onNext = vi.fn();
    invokeMock.mockResolvedValueOnce({ data: { adaptation: result }, error: null });
    renderWithProviders(
      <StepGenerate data={baseData} onResult={onResult} onNext={onNext} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(result));
    expect(validateDocument(onResult.mock.calls[0][0].document)).toBeTruthy();
    expect(onNext).toHaveBeenCalled();
  });

  it("sends the active barriers and observation notes in the request body", async () => {
    invokeMock.mockResolvedValueOnce({ data: { adaptation: result }, error: null });
    renderWithProviders(
      <StepGenerate
        data={{ ...baseData, observationNotes: "obs" }}
        onResult={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock).toHaveBeenCalledWith(
      "adapt-activity",
      expect.objectContaining({
        body: expect.objectContaining({
          original_activity: "1) Q?",
          activity_type: "exercício",
          observation_notes: "obs",
          barriers: [{ dimension: "tea", barrier_key: "tea_abstracao", notes: undefined }],
        }),
      }),
    );
  });

  it("calls refreshProfile after a successful generation", async () => {
    const mockRefresh = vi.fn().mockResolvedValue(undefined);
    const { useAuth } = await import("@/hooks/useAuth");
    vi.mocked(useAuth).mockReturnValueOnce({ refreshProfile: mockRefresh } as never);
    invokeMock.mockResolvedValueOnce({ data: { adaptation: result }, error: null });
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("swallows a refreshProfile rejection silently", async () => {
    const mockRefresh = vi.fn().mockRejectedValue(new Error("auth fail"));
    const { useAuth } = await import("@/hooks/useAuth");
    vi.mocked(useAuth).mockReturnValueOnce({ refreshProfile: mockRefresh } as never);
    const onResult = vi.fn();
    invokeMock.mockResolvedValueOnce({ data: { adaptation: result }, error: null });
    renderWithProviders(
      <StepGenerate data={baseData} onResult={onResult} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("shows the credit error with a link to /creditos on a 402", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { context: { status: 402, json: async () => ({ error: "no" }) } },
    });
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText(/Créditos insuficientes/i)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Comprar créditos/i })).toHaveAttribute("href", "/creditos");
  });

  it("returns to the previous step from the credit-error screen", async () => {
    const onPrev = vi.fn();
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { context: { status: 402, json: async () => ({ error: "no" }) } },
    });
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={onPrev} />,
    );
    await waitFor(() => expect(screen.getByText(/Créditos insuficientes/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(onPrev).toHaveBeenCalled();
  });

  it("shows a retry screen and re-runs generation on a generic failure", async () => {
    const { toast } = await import("sonner");
    invokeMock
      .mockResolvedValueOnce({ data: null, error: { context: { status: 500, json: async () => ({ error: "boom" }) } } })
      .mockResolvedValueOnce({ data: { adaptation: result }, error: null });
    const onResult = vi.fn();
    renderWithProviders(
      <StepGenerate data={baseData} onResult={onResult} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"));
    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/i }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(result));
  });

  it("uses the fallback message when the error body has no error field", async () => {
    const { toast } = await import("sonner");
    invokeMock.mockResolvedValueOnce({ data: null, error: { context: { status: 500, json: async () => ({}) } } });
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Falha na adaptação"));
  });

  it("uses the fallback message when the error context json throws", async () => {
    const { toast } = await import("sonner");
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { context: { status: 500, json: async () => { throw new Error("parse"); } } },
    });
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Falha na adaptação"));
  });

  it("uses the fallback message when the error has no context", async () => {
    const { toast } = await import("sonner");
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "network" } });
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Falha na adaptação"));
  });

  it("does not generate when a result is already present and offers navigation", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    renderWithProviders(
      <StepGenerate
        data={{ ...baseData, result }}
        onResult={vi.fn()}
        onNext={onNext}
        onPrev={onPrev}
      />,
    );
    expect(invokeMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Adaptação pronta/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));
    expect(onNext).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(onPrev).toHaveBeenCalled();
  });
});
