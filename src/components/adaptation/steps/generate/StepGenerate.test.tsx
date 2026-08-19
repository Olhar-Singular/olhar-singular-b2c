import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers";
import { StepGenerate } from "./StepGenerate";
import { validateDocument } from "@/lib/adaptation/canonical/validate";
import type { AdaptationResult } from "@/lib/adaptation/canonical/schema";
import type { UploadedExam, WizardData } from "@/lib/adaptation/wizard/wizardState";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ user: { id: "user-1" }, refreshProfile: vi.fn().mockResolvedValue(undefined) })),
}));

const extractExamQuestionsMock = vi.fn();
vi.mock("../upload-exam/extractExamQuestions", () => ({
  extractExamQuestions: (...a: unknown[]) => extractExamQuestionsMock(...a),
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

/**
 * The server persists the adaptation and hands back the row it created (A7),
 * so every successful invoke answers with the document AND its row identity.
 */
const SERVER_ROW = { id: "row-1", updatedAt: "2026-07-23T10:00:00Z" };

const okResponse = () => ({
  data: {
    adaptation: result,
    adaptation_id: SERVER_ROW.id,
    adaptation_updated_at: SERVER_ROW.updatedAt,
  },
  error: null,
});

const baseData: WizardData = {
  activityType: "exercício",
  activityText: "1) Q?",
  activityInputMode: "bank",
  uploadedExam: null,
  selectedQuestions: [],
  barriers: [{ dimension: "tea", barrier_key: "tea_abstracao", label: "x", is_active: true }],
  barrierProfileId: null,
  result: null,
};

const uploadedExam: UploadedExam = {
  fileName: "prova.pdf",
  fileType: "pdf",
  text: "1) Q1 (bruto)",
  pageImages: [],
  file: new File(["pdf-bytes"], "prova.pdf", { type: "application/pdf" }),
};

const uploadData: WizardData = { ...baseData, activityInputMode: "upload", activityText: "", uploadedExam };

beforeEach(() => {
  vi.clearAllMocks();
  invokeMock.mockReset();
  extractExamQuestionsMock.mockReset();
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
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={baseData} onResult={onResult} onNext={onNext} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(result, SERVER_ROW));
    expect(validateDocument(onResult.mock.calls[0][0].document)).toBeTruthy();
    expect(onNext).toHaveBeenCalled();
  });

  it("sends the active barriers and observation notes in the request body", async () => {
    invokeMock.mockResolvedValueOnce(okResponse());
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
          // `label` rides along so the prompt can name the barrier in words
          // instead of making the model infer pedagogy from a snake_case key.
          barriers: [{ dimension: "tea", barrier_key: "tea_abstracao", label: "x", notes: undefined }],
        }),
      }),
    );
  });

  // MODO FIEL exists in the prompt and is accepted by the edge function, but
  // nothing ever sent the flag — so the promise the upload screen makes
  // ("preservando a ordem das questões e as imagens originais") was backed by
  // a block that never reached the model.
  it("turns on fidelity_mode when the activity came from an uploaded exam", async () => {
    extractExamQuestionsMock.mockResolvedValueOnce({
      status: "ok",
      questions: [{ text: "Primeira", options: null, image_url: null }],
    });
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={uploadData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock).toHaveBeenCalledWith(
      "adapt-activity",
      expect.objectContaining({ body: expect.objectContaining({ fidelity_mode: true }) }),
    );
  });

  // Lets the server tell "adapted all 12 questions" apart from "quietly came
  // back with 6" — today both look like success and both cost a credit.
  it("tells the server how many questions the extraction found", async () => {
    extractExamQuestionsMock.mockResolvedValueOnce({
      status: "ok",
      questions: [
        { text: "Primeira", options: null, image_url: null },
        { text: "Segunda", options: null, image_url: null },
      ],
    });
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={uploadData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock.mock.calls[0][1].body.expected_question_count).toBe(2);
  });

  it("counts the questions picked from the bank", async () => {
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate
        data={{
          ...baseData,
          selectedQuestions: [
            { id: "q1", text: "A" },
            { id: "q2", text: "B" },
            { id: "q3", text: "C" },
          ] as WizardData["selectedQuestions"],
        }}
        onResult={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock.mock.calls[0][1].body.expected_question_count).toBe(3);
  });

  it("reports zero for free-typed text, where no count is knowable", async () => {
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock.mock.calls[0][1].body.expected_question_count).toBe(0);
  });

  it("leaves fidelity_mode off for the bank/paste flow", async () => {
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock).toHaveBeenCalledWith(
      "adapt-activity",
      expect.objectContaining({ body: expect.objectContaining({ fidelity_mode: false }) }),
    );
  });

  it("sends barrier_profile_id so the server-written row keeps the profile link", async () => {
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate
        data={{ ...baseData, barrierProfileId: "33333333-3333-4333-8333-333333333333" }}
        onResult={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock.mock.calls[0][1].body.barrier_profile_id).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
  });

  it("hands the server-created row (id + updated_at) to the wizard", async () => {
    // A7: the row is born on the server, so the wizard adopts it instead of
    // inserting one itself. Losing this hand-off would put the wizard back to
    // editing a document with nowhere to save it.
    const onResult = vi.fn();
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={baseData} onResult={onResult} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onResult).toHaveBeenCalledWith(result, {
      id: "row-1",
      updatedAt: "2026-07-23T10:00:00Z",
    });
  });

  it("fails loudly when the server answers without a persisted row", async () => {
    // Silently continuing would recreate exactly the bug A7 fixes: an edited
    // document with no row behind it, lost the moment the tab closes.
    const onResult = vi.fn();
    const onNext = vi.fn();
    invokeMock.mockResolvedValueOnce({ data: { adaptation: result }, error: null });
    renderWithProviders(
      <StepGenerate data={baseData} onResult={onResult} onNext={onNext} onPrev={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Tentar novamente/i })).toBeInTheDocument(),
    );
    expect(onResult).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("sends a request_id so a replayed request cannot be charged twice", async () => {
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock.mock.calls[0][1].body.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("uses a FRESH request_id per attempt (a retry is a new charge, not a replay)", async () => {
    // Reusing the key would make the retry look like a duplicate and be refused.
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error("boom") });
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText("Tentar novamente")).toBeInTheDocument());

    invokeMock.mockResolvedValueOnce(okResponse());
    fireEvent.click(screen.getByText("Tentar novamente"));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock.mock.calls[0][1].body.request_id).not.toBe(
      invokeMock.mock.calls[1][1].body.request_id,
    );
  });

  it("calls refreshProfile after a successful generation", async () => {
    const mockRefresh = vi.fn().mockResolvedValue(undefined);
    const { useAuth } = await import("@/hooks/useAuth");
    vi.mocked(useAuth).mockReturnValueOnce({ user: { id: "user-1" }, refreshProfile: mockRefresh } as never);
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("swallows a refreshProfile rejection silently", async () => {
    const mockRefresh = vi.fn().mockRejectedValue(new Error("auth fail"));
    const { useAuth } = await import("@/hooks/useAuth");
    vi.mocked(useAuth).mockReturnValueOnce({ user: { id: "user-1" }, refreshProfile: mockRefresh } as never);
    const onResult = vi.fn();
    invokeMock.mockResolvedValueOnce(okResponse());
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
      .mockResolvedValueOnce(okResponse());
    const onResult = vi.fn();
    renderWithProviders(
      <StepGenerate data={baseData} onResult={onResult} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"));
    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/i }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(result, SERVER_ROW));
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

  it("calls onLoadingChange(true) when generation starts and onLoadingChange(false) when done", async () => {
    const onLoadingChange = vi.fn();
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onLoadingChange={onLoadingChange} />,
    );
    expect(onLoadingChange).toHaveBeenCalledWith(true);
    await waitFor(() => expect(onLoadingChange).toHaveBeenCalledWith(false));
  });

  it("calls onLoadingChange(false) even when generation fails", async () => {
    const onLoadingChange = vi.fn();
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onLoadingChange={onLoadingChange} />,
    );
    await waitFor(() => expect(onLoadingChange).toHaveBeenCalledWith(false));
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

  // ── Upload path: extraction runs here, bundled with the paid adaptation call ──

  it("does not call extractExamQuestions on the bank/text path (no uploadedExam)", async () => {
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(extractExamQuestionsMock).not.toHaveBeenCalled();
  });

  it("shows the extraction loading message first, before the adaptation one", async () => {
    extractExamQuestionsMock.mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(
      <StepGenerate data={uploadData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    expect(screen.getByText(/Lendo o arquivo enviado/i)).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("extracts the uploaded exam, builds the activity text, and sends it to adapt-activity", async () => {
    extractExamQuestionsMock.mockResolvedValueOnce({
      status: "ok",
      questions: [{ text: "Primeira", options: null, image_url: null }],
    });
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={uploadData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(extractExamQuestionsMock).toHaveBeenCalledWith(uploadedExam, "user-1", expect.any(AbortSignal));
    expect(invokeMock.mock.calls[0][1].body.original_activity).toBe("1) Primeira");
  });

  it("shows the adaptation loading message once extraction has finished", async () => {
    extractExamQuestionsMock.mockResolvedValueOnce({
      status: "ok",
      questions: [{ text: "Primeira", options: null, image_url: null }],
    });
    invokeMock.mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(
      <StepGenerate data={uploadData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText(/ISA está adaptando/i)).toBeInTheDocument());
  });

  it("shows a retry screen when no questions were extracted from the file", async () => {
    extractExamQuestionsMock.mockResolvedValueOnce({ status: "empty" });
    renderWithProviders(
      <StepGenerate data={uploadData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Tentar novamente/i })).toBeInTheDocument(),
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("surfaces the extraction's own error (e.g. AI rate limit) via toast", async () => {
    const { toast } = await import("sonner");
    extractExamQuestionsMock.mockRejectedValueOnce(
      new Error("Limite de requisições IA atingido. Tente novamente em alguns minutos."),
    );
    renderWithProviders(
      <StepGenerate data={uploadData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Limite de requisições IA atingido. Tente novamente em alguns minutos."),
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("warns before proceeding when more than 12 questions are extracted, without calling adapt-activity yet", async () => {
    const questions = Array.from({ length: 15 }, (_, i) => ({ text: `Questão ${i + 1}`, options: null, image_url: null }));
    extractExamQuestionsMock.mockResolvedValueOnce({ status: "ok", questions });
    renderWithProviders(
      <StepGenerate data={uploadData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText(/15 questões/i)).toBeInTheDocument());
    expect(screen.getByText(/limite para essa adaptação é 12/i)).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("truncates to the first 12 questions and proceeds to adapt-activity on confirm", async () => {
    const questions = Array.from({ length: 15 }, (_, i) => ({ text: `Questão ${i + 1}`, options: null, image_url: null }));
    extractExamQuestionsMock.mockResolvedValueOnce({ status: "ok", questions });
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={uploadData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => screen.getByText(/15 questões/i));
    fireEvent.click(screen.getByRole("button", { name: /^continuar$/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    const text = invokeMock.mock.calls[0][1].body.original_activity as string;
    expect(text).toContain("12) Questão 12");
    expect(text).not.toContain("Questão 13");
    // The expected count follows the truncation: 12 went in, so anything less
    // than 12 coming back is a real loss — not an echo of the 15 found.
    expect(invokeMock.mock.calls[0][1].body.expected_question_count).toBe(12);
  });

  it("cancelling the 12-question warning returns to the previous step without calling adapt-activity", async () => {
    const questions = Array.from({ length: 13 }, (_, i) => ({ text: `Questão ${i + 1}`, options: null, image_url: null }));
    extractExamQuestionsMock.mockResolvedValueOnce({ status: "ok", questions });
    const onPrev = vi.fn();
    renderWithProviders(
      <StepGenerate data={uploadData} onResult={vi.fn()} onNext={vi.fn()} onPrev={onPrev} />,
    );
    await waitFor(() => screen.getByText(/13 questões/i));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onPrev).toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("does not warn when exactly at the question cap", async () => {
    const questions = Array.from({ length: 12 }, (_, i) => ({ text: `Questão ${i + 1}`, options: null, image_url: null }));
    extractExamQuestionsMock.mockResolvedValueOnce({ status: "ok", questions });
    invokeMock.mockResolvedValueOnce(okResponse());
    renderWithProviders(
      <StepGenerate data={uploadData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock.mock.calls[0][1].body.original_activity as string).toContain("12) Questão 12");
  });

  // ── Rotating loading copy: long generations (real ones run for minutes)
  // shouldn't sit on one static line the whole time. ──
  describe("rotating loading messages", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("starts on the first adaptation-phase message, then rotates every ~2.8s", () => {
      invokeMock.mockImplementation(() => new Promise(() => undefined));
      renderWithProviders(
        <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
      );
      expect(screen.getByText("ISA está adaptando a atividade...")).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(2800); });
      expect(screen.getByText(/Desenho Universal para a Aprendizagem \(DUA\)/i)).toBeInTheDocument();
    });

    it("wraps back to the first adaptation message after a full cycle", () => {
      invokeMock.mockImplementation(() => new Promise(() => undefined));
      renderWithProviders(
        <StepGenerate data={baseData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
      );
      act(() => { vi.advanceTimersByTime(2800 * 5); }); // 5 = ADAPTING_MESSAGES.length
      expect(screen.getByText("ISA está adaptando a atividade...")).toBeInTheDocument();
    });

    it("rotates a separate message pool during extraction, reset to its own first message on phase change", () => {
      extractExamQuestionsMock.mockImplementation(() => new Promise(() => undefined));
      renderWithProviders(
        <StepGenerate data={uploadData} onResult={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
      );
      expect(screen.getByText("Lendo o arquivo enviado...")).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(2800); });
      expect(screen.getByText("Identificando as questões da prova...")).toBeInTheDocument();
    });
  });
});
