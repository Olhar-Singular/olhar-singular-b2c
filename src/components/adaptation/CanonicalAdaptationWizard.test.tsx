import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers";
import CanonicalAdaptationWizard from "./CanonicalAdaptationWizard";
import type { AdaptationResult, CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { validateDocument } from "@/lib/adaptation/canonical/validate";
import * as repo from "@/lib/adaptation/persistence/adaptationsRepo";
import * as mirror from "@/lib/adaptation/persistence/draftMirror";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockNavGuard = vi.fn();
vi.mock("@/hooks/useNavigationGuard", () => ({
  useNavigationGuard: (...args: unknown[]) => mockNavGuard(...args),
}));

// --- persistence seams ------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => mockNavigate,
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

vi.mock("@/lib/adaptation/persistence/adaptationsRepo");
vi.mock("@/lib/adaptation/persistence/draftMirror");

const mockDraftStatus = { value: "idle" as string };
const mockCurrentUpdatedAt = { value: "2026-01-01T00:00:00Z" as string | null };
const mockFlush = vi.fn().mockResolvedValue("2026-01-01T00:00:00Z");
// Captures the latest props the wizard passes into the hook + the onConflict cb.
const draftHookCalls: Array<{
  draftId: string | null;
  initialUpdatedAt: string | null;
  onConflict?: () => void;
}> = [];
vi.mock("@/hooks/useAdaptationDraft", () => ({
  useAdaptationDraft: (opts: {
    draftId: string | null;
    initialUpdatedAt: string | null;
    onConflict?: () => void;
  }) => {
    draftHookCalls.push({
      draftId: opts.draftId,
      initialUpdatedAt: opts.initialUpdatedAt,
      onConflict: opts.onConflict,
    });
    return {
      status: mockDraftStatus.value,
      flush: mockFlush,
      restoreFromMirror: vi.fn().mockResolvedValue(null),
      currentUpdatedAt: mockCurrentUpdatedAt.value,
    };
  },
}));

const mockMarkReady = vi.fn();
vi.mock("@/hooks/useAdaptations", () => ({
  useMarkReady: () => ({ mutateAsync: mockMarkReady, isPending: false }),
}));

const DRAFT_ROW = {
  id: "draft-1",
  user_id: "u1",
  barrier_profile_id: null,
  title: "T",
  original_activity: "",
  activity_type: "exercício",
  barriers_used: [],
  adaptation_result: {} as AdaptationResult,
  status: "draft" as const,
  credits_spent: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeResult(): AdaptationResult {
  return {
    schemaVersion: 1,
    document: {
      schemaVersion: 1,
      blocks: [{ id: id(1), type: "paragraph", content: [{ type: "text", text: "gerado" }] }],
    },
    strategies_applied: [],
    pedagogical_justification: "",
    implementation_tips: [],
  };
}

// --- Input steps stubbed to drive the wizard quickly ------------------------

vi.mock("./steps/activity-type/StepActivityType", () => ({
  StepActivityType: ({ onSelect }: { onSelect: (t: string) => void }) => (
    <button data-testid="pick-type" onClick={() => onSelect("exercício")}>type</button>
  ),
}));

vi.mock("./steps/activity-input/StepActivityInput", () => ({
  StepActivityInput: ({ onNext }: { onNext: () => void }) => (
    <button data-testid="input-next" onClick={onNext}>input</button>
  ),
}));

vi.mock("./steps/barriers/StepBarrierSelection", () => ({
  StepBarrierSelection: ({ onNext }: { onNext: () => void }) => (
    <button data-testid="barriers-next" onClick={onNext}>barriers</button>
  ),
}));

vi.mock("./steps/generate/StepGenerate", () => ({
  StepGenerate: ({
    onResult,
    onNext,
    onLoadingChange,
  }: {
    onResult: (r: AdaptationResult) => void;
    onNext: () => void;
    onLoadingChange?: (loading: boolean) => void;
  }) => (
    <>
      <button
        data-testid="simulate-loading"
        onClick={() => onLoadingChange?.(true)}
      >
        start loading
      </button>
      <button
        data-testid="do-generate"
        onClick={() => {
          onLoadingChange?.(false);
          onResult(makeResult());
          onNext();
        }}
      >
        generate
      </button>
      {/* Simulates React 18 unmount race: onLoadingChange(false) is NOT called
          before onNext, mimicking the real StepGenerate where the useEffect
          may not fire when the component is unmounted in the same batch. */}
      <button
        data-testid="do-generate-no-lc"
        onClick={() => {
          onResult(makeResult());
          onNext();
        }}
      >
        generate-no-lc
      </button>
    </>
  ),
}));

// StepReview — the unified edit step is mocked at its boundary: the wizard test
// only cares about SSOT/navigation wiring, not the editor internals (covered by
// StepReview's own tests). `edit-content` doubles as a readout of the live
// document and an edit trigger; `review-doc` exposes the whole document as JSON.
vi.mock("./steps/review/StepReview", () => ({
  StepReview: ({
    document,
    pageStyle,
    onDocumentChange,
    onPageStyleChange,
    onRegenerate,
    onNext,
    onPrev,
  }: {
    document: CanonicalDocument;
    pageStyle?: unknown;
    onDocumentChange: (d: CanonicalDocument) => void;
    onPageStyleChange: (ps: { fontFamily?: string; fontSize?: number; blockSpacing?: number }) => void;
    onRegenerate: () => void;
    onNext: () => void;
    onPrev: () => void;
  }) => (
    <div>
      <pre data-testid="review-doc">{JSON.stringify(document)}</pre>
      <pre data-testid="review-pagestyle">{JSON.stringify(pageStyle ?? null)}</pre>
      <button
        data-testid="edit-content"
        onClick={() =>
          onDocumentChange({
            ...document,
            blocks: [{ id: id(1), type: "paragraph", content: [{ type: "text", text: "EDITADO" }] }],
          })
        }
      >
        {(document.blocks[0] as { content: { text: string }[] }).content[0].text}
      </button>
      <button data-testid="set-pagestyle" onClick={() => onPageStyleChange({ fontFamily: "lexend", fontSize: 14 })}>
        Aparência
      </button>
      <button onClick={onRegenerate}>Regerar</button>
      <button aria-label="Voltar" onClick={onPrev}>Voltar</button>
      <button aria-label="Avançar para exportação" onClick={onNext}>Exportar</button>
    </div>
  ),
}));

// CanonicalRenderer (used by the export step) — exposes the doc as JSON.
vi.mock("./render/CanonicalRenderer", () => ({
  CanonicalRenderer: ({ document }: { document: CanonicalDocument }) => (
    <pre data-testid="render-doc">{JSON.stringify(document)}</pre>
  ),
}));

// --- helpers ----------------------------------------------------------------

function advanceToReview() {
  fireEvent.click(screen.getByTestId("pick-type"));
  fireEvent.click(screen.getByTestId("input-next"));
  fireEvent.click(screen.getByTestId("barriers-next"));
  fireEvent.click(screen.getByTestId("do-generate"));
}

beforeEach(() => {
  vi.clearAllMocks();
  draftHookCalls.length = 0;
  mockDraftStatus.value = "idle";
  mockCurrentUpdatedAt.value = "2026-01-01T00:00:00Z";
  mockFlush.mockResolvedValue("2026-01-01T00:00:00Z");
  vi.mocked(repo.saveDraft).mockResolvedValue(DRAFT_ROW);
  vi.mocked(repo.getAdaptation).mockResolvedValue(DRAFT_ROW);
  vi.mocked(mirror.readMirror).mockResolvedValue(null);
  vi.mocked(mirror.clearMirror).mockResolvedValue(undefined);
  mockMarkReady.mockResolvedValue({ ok: true, updatedAt: "2026-01-02T00:00:00Z" });
  mockNavGuard.mockReturnValue({ state: "unblocked", reset: vi.fn(), proceed: vi.fn() });
});

describe("CanonicalAdaptationWizard", () => {
  it("walks the input steps and renders the content step after generation", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    expect(screen.getByTestId("edit-content")).toHaveTextContent("gerado");
  });

  it("generation sets a valid canonical document", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    const doc = JSON.parse(screen.getByTestId("review-doc").textContent!);
    expect(validateDocument(doc)).toBeTruthy();
  });

  it("content edits propagate into the single document", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    fireEvent.click(screen.getByTestId("edit-content"));
    expect(screen.getByTestId("edit-content")).toHaveTextContent("EDITADO");
  });

  it("SSOT: a content edit survives navigating review ↔ export", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();

    // 1) edit content
    fireEvent.click(screen.getByTestId("edit-content"));
    expect(screen.getByTestId("edit-content")).toHaveTextContent("EDITADO");

    // 2) go to export, then back to review — the edit is still there
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(screen.getByTestId("edit-content")).toHaveTextContent("EDITADO");

    // 3) the single document carries the edit
    const doc = JSON.parse(screen.getByTestId("review-doc").textContent!) as CanonicalDocument;
    expect((doc.blocks[0] as { content: { text: string }[] }).content[0].text).toBe("EDITADO");
  });

  it("SSOT: a pageStyle change persists and survives navigating review ↔ export", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();

    // no pageStyle initially
    expect(screen.getByTestId("review-pagestyle")).toHaveTextContent("null");

    // set a document-level appearance
    fireEvent.click(screen.getByTestId("set-pagestyle"));
    expect(screen.getByTestId("review-pagestyle")).toHaveTextContent(
      JSON.stringify({ fontFamily: "lexend", fontSize: 14 }),
    );

    // it survives a round-trip to export and back (single source of truth)
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(screen.getByTestId("review-pagestyle")).toHaveTextContent(
      JSON.stringify({ fontFamily: "lexend", fontSize: 14 }),
    );
  });

  it("SSOT: a manual header title persists and survives navigating export ↔ review", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));

    // Type a title in the real ExportPanel — it is controlled by the wizard, so
    // it only reflects (and persists) if the change is lifted into result.header.
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Prova Final" } });
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Prova Final");

    // It survives a round-trip to review and back (single source of truth).
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Prova Final");
  });

  it("the step indicator navigates back to a visited step", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    fireEvent.click(screen.getByRole("button", { name: /1.*Tipo/i }));
    expect(screen.getByTestId("pick-type")).toBeInTheDocument();
  });

  it("regenerate is confirmed and replaces the document via the generate step", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();

    // edit content first so we can prove the replacement
    fireEvent.click(screen.getByTestId("edit-content"));
    expect(screen.getByTestId("edit-content")).toHaveTextContent("EDITADO");

    fireEvent.click(screen.getByRole("button", { name: /Regerar/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Regerar$/i }));

    // back on the generate step
    fireEvent.click(screen.getByTestId("do-generate"));
    // fresh document (content reset to "gerado")
    expect(screen.getByTestId("edit-content")).toHaveTextContent("gerado");
  });

  it("cancelling the regenerate dialog keeps the current document", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    fireEvent.click(screen.getByTestId("edit-content"));
    fireEvent.click(screen.getByRole("button", { name: /Regerar/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Cancelar/i }));
    expect(screen.getByTestId("edit-content")).toHaveTextContent("EDITADO");
  });

  it("export step copies and restarts back to the first step", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));

    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));
    expect(writeText).toHaveBeenCalledWith("gerado");

    fireEvent.click(screen.getByRole("button", { name: /Nova adaptação/i }));
    expect(screen.getByTestId("pick-type")).toBeInTheDocument();
  });

  it("export step navigates back to review with Voltar", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(screen.getByTestId("edit-content")).toBeInTheDocument();
  });

  // --- M6 persistence wiring -------------------------------------------------

  it("creates a draft on first generation", async () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalledTimes(1));
    expect(repo.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", activity_type: "exercício" }),
    );
  });

  it("toasts when draft creation fails", async () => {
    vi.mocked(repo.saveDraft).mockRejectedValue(new Error("db down"));
    const { toast } = await import("sonner");
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("shows the autosave status indicator once a draft exists", async () => {
    mockDraftStatus.value = "saving";
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    expect(await screen.findByRole("status")).toHaveTextContent(/Salvando/i);
  });

  it("Salvar marks the draft ready, toasts, and stays on page (no navigation)", async () => {
    const { toast } = await import("sonner");
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() =>
      expect(mockMarkReady).toHaveBeenCalledWith({
        id: "draft-1",
        expectedUpdatedAt: "2026-01-01T00:00:00Z",
      }),
    );
    expect(toast.success).toHaveBeenCalled();
    // After saving, the wizard stays on the current page — no navigate() call.
    expect(mockNavigate).not.toHaveBeenCalledWith("/historico");
  });

  it("Salvar uses the freshest updated_at returned by flush for the guard", async () => {
    // flush advanced the row (autosave landed) → its returned token, not the
    // render-time currentUpdatedAt, must be the one markReady receives.
    mockFlush.mockResolvedValue("2026-09-09T00:00:00Z");
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() =>
      expect(mockMarkReady).toHaveBeenCalledWith({
        id: "draft-1",
        expectedUpdatedAt: "2026-09-09T00:00:00Z",
      }),
    );
  });

  it("Salvar falls back to currentUpdatedAt when flush returns null", async () => {
    mockFlush.mockResolvedValue(null);
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() =>
      expect(mockMarkReady).toHaveBeenCalledWith({
        id: "draft-1",
        expectedUpdatedAt: "2026-01-01T00:00:00Z",
      }),
    );
  });

  it("Salvar surfaces a conflict (toast + reload) instead of navigating", async () => {
    const { toast } = await import("sonner");
    mockMarkReady.mockResolvedValue({ ok: false, conflict: true });
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(mockMarkReady).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/alterada em outro lugar/i),
    );
    expect(mockNavigate).toHaveBeenCalledWith(0);
    expect(mockNavigate).not.toHaveBeenCalledWith("/historico");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not create a second draft when regenerating", async () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalledTimes(1));

    // regenerate, then generate again — draftId already exists, so no new draft
    fireEvent.click(screen.getByRole("button", { name: /Regerar/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Regerar$/i }));
    fireEvent.click(screen.getByTestId("do-generate"));
    await waitFor(() => expect(screen.getByTestId("edit-content")).toHaveTextContent("gerado"));
    expect(repo.saveDraft).toHaveBeenCalledTimes(1);
  });

  // --- C1-a crash-mirror restore -------------------------------------------

  function editSeed(updatedAt = "2026-01-01T00:00:00Z") {
    return {
      adaptationId: "edit-1",
      initialData: {
        activityType: "exercício",
        activityText: "texto",
        selectedQuestions: [],
        barriers: [],
        barrierProfileId: null,
        result: makeResult(),
      },
      initialUpdatedAt: updatedAt,
    };
  }

  function mirrorResult(text: string): AdaptationResult {
    return {
      schemaVersion: 1,
      document: {
        schemaVersion: 1,
        blocks: [{ id: id(2), type: "paragraph", content: [{ type: "text", text }] }],
      },
      strategies_applied: [],
      pedagogical_justification: "",
      implementation_tips: [],
    };
  }

  it("offers restore when a newer mirror survives, and recovers the doc on confirm", async () => {
    vi.mocked(mirror.readMirror).mockResolvedValue({
      draftId: "edit-1",
      result: mirrorResult("RECUPERADO"),
      savedAt: Date.parse("2026-02-01T00:00:00Z"), // newer than the row
    });
    renderWithProviders(<CanonicalAdaptationWizard editMode={editSeed()} />);
    // Seeded doc shows first.
    expect(screen.getByTestId("edit-content")).toHaveTextContent("gerado");
    // Prompt appears.
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Recuperar alterações não salvas/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Recuperar/i }));
    // Doc is re-seeded from the mirror.
    await waitFor(() =>
      expect(screen.getByTestId("edit-content")).toHaveTextContent("RECUPERADO"),
    );
  });

  it("dismissing the restore prompt clears the mirror and keeps the loaded doc", async () => {
    vi.mocked(mirror.readMirror).mockResolvedValue({
      draftId: "edit-1",
      result: mirrorResult("RECUPERADO"),
      savedAt: Date.parse("2026-02-01T00:00:00Z"),
    });
    renderWithProviders(<CanonicalAdaptationWizard editMode={editSeed()} />);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Descartar/i }));
    await waitFor(() => expect(mirror.clearMirror).toHaveBeenCalledWith("edit-1"));
    expect(screen.getByTestId("edit-content")).toHaveTextContent("gerado");
  });

  it("does not prompt and clears an older mirror (server row is newer)", async () => {
    vi.mocked(mirror.readMirror).mockResolvedValue({
      draftId: "edit-1",
      result: mirrorResult("OLD"),
      savedAt: Date.parse("2025-01-01T00:00:00Z"), // older than the row
    });
    renderWithProviders(<CanonicalAdaptationWizard editMode={editSeed()} />);
    await waitFor(() => expect(mirror.clearMirror).toHaveBeenCalledWith("edit-1"));
    expect(screen.queryByText(/Recuperar alterações não salvas/i)).not.toBeInTheDocument();
  });

  it("ignores a late mirror read after unmount (no state update)", async () => {
    let resolveRead: (e: Awaited<ReturnType<typeof mirror.readMirror>>) => void = () => {};
    vi.mocked(mirror.readMirror).mockImplementation(
      () => new Promise((res) => { resolveRead = res; }),
    );
    const { unmount } = renderWithProviders(<CanonicalAdaptationWizard editMode={editSeed()} />);
    await waitFor(() => expect(mirror.readMirror).toHaveBeenCalledWith("edit-1"));
    // Unmount BEFORE the read resolves → the cancelled guard must short-circuit.
    unmount();
    await act(async () => {
      resolveRead({ draftId: "edit-1", result: mirrorResult("LATE"), savedAt: Date.now() });
      await Promise.resolve();
    });
    // No prompt was ever shown.
    expect(screen.queryByText(/Recuperar alterações não salvas/i)).not.toBeInTheDocument();
  });

  it("does not prompt when no mirror exists", async () => {
    vi.mocked(mirror.readMirror).mockResolvedValue(null);
    renderWithProviders(<CanonicalAdaptationWizard editMode={editSeed()} />);
    await waitFor(() => expect(mirror.readMirror).toHaveBeenCalledWith("edit-1"));
    expect(screen.queryByText(/Recuperar alterações não salvas/i)).not.toBeInTheDocument();
    expect(mirror.clearMirror).not.toHaveBeenCalled();
  });

  it("offers restore in the create flow for any surviving mirror", async () => {
    // Create flow: no editMode, draft is created on first generation. Mirror
    // appears keyed by the new draft id → any surviving mirror is unsaved.
    vi.mocked(mirror.readMirror).mockResolvedValue({
      draftId: "draft-1",
      result: mirrorResult("CREATE-RECOVER"),
      savedAt: 1,
    });
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Recuperar/i }));
    await waitFor(() =>
      expect(screen.getByTestId("edit-content")).toHaveTextContent("CREATE-RECOVER"),
    );
  });

  it("opens in edit mode at the review step seeded from a row", () => {
    const seededResult = makeResult();
    renderWithProviders(
      <CanonicalAdaptationWizard
        editMode={{
          adaptationId: "edit-1",
          initialData: {
            activityType: "exercício",
            activityText: "texto",
            selectedQuestions: [],
            barriers: [],
            barrierProfileId: null,
            result: seededResult,
          },
          initialUpdatedAt: "2026-01-01T00:00:00Z",
        }}
      />,
    );
    // Lands directly on the content step with the seeded document.
    expect(screen.getByTestId("edit-content")).toHaveTextContent("gerado");
    // No new draft is created in edit mode.
    expect(repo.saveDraft).not.toHaveBeenCalled();
  });

  it("passes draftId + updated_at into the autosave hook from STATE after generation", async () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    // Before generation the hook is wired with a null draft.
    expect(draftHookCalls[0]).toMatchObject({ draftId: null, initialUpdatedAt: null });
    advanceToReview();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    // After generation the latest hook call carries the row's id + updated_at,
    // proving the values propagated as props (state, not a ref).
    await waitFor(() => {
      const last = draftHookCalls[draftHookCalls.length - 1];
      expect(last.draftId).toBe(DRAFT_ROW.id);
      expect(last.initialUpdatedAt).toBe(DRAFT_ROW.updated_at);
    });
  });

  it("Salvar flushes the pending autosave before marking ready", async () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() =>
      expect(mockMarkReady).toHaveBeenCalledWith(
        expect.objectContaining({ id: "draft-1" }),
      ),
    );
    // flush must have run, and before markReady.
    expect(mockFlush).toHaveBeenCalled();
    expect(mockFlush.mock.invocationCallOrder[0]).toBeLessThan(
      mockMarkReady.mock.invocationCallOrder[0],
    );
  });

  it("onConflict surfaces a toast and reloads via navigate(0)", async () => {
    const { toast } = await import("sonner");
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    const onConflict = draftHookCalls[draftHookCalls.length - 1].onConflict;
    expect(onConflict).toBeTypeOf("function");
    onConflict!();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/alterada em outro lugar/i),
    );
    expect(mockNavigate).toHaveBeenCalledWith(0);
  });
});

describe("CanonicalAdaptationWizard — navigation guard", () => {
  it("calls useNavigationGuard with false initially (no result, not generating)", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    expect(mockNavGuard).toHaveBeenCalledWith(false);
  });

  it("calls useNavigationGuard with true while StepGenerate reports loading", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    fireEvent.click(screen.getByTestId("pick-type"));
    fireEvent.click(screen.getByTestId("input-next"));
    fireEvent.click(screen.getByTestId("barriers-next"));
    fireEvent.click(screen.getByTestId("simulate-loading"));
    expect(mockNavGuard).toHaveBeenCalledWith(true);
  });

  it("calls useNavigationGuard with true after generation completes (unsaved result)", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    fireEvent.click(screen.getByTestId("pick-type"));
    fireEvent.click(screen.getByTestId("input-next"));
    fireEvent.click(screen.getByTestId("barriers-next"));
    fireEvent.click(screen.getByTestId("do-generate"));
    // Result exists, not saved → guard active for "unsaved" reason.
    expect(mockNavGuard).toHaveBeenLastCalledWith(true);
  });

  it("resets isGenerating via handleResult when onLoadingChange is not called before onNext (unmount race)", () => {
    // do-generate-no-lc mimics the React 18 unmount race: StepGenerate's useEffect
    // doesn't fire because the component is unmounted in the same batch as onNext().
    // handleResult must explicitly reset isGenerating to prevent the generation dialog
    // from showing after navigation is unblocked.
    mockNavGuard.mockReturnValue({ state: "blocked", reset: vi.fn(), proceed: vi.fn() });
    renderWithProviders(<CanonicalAdaptationWizard />);
    fireEvent.click(screen.getByTestId("pick-type"));
    fireEvent.click(screen.getByTestId("input-next"));
    fireEvent.click(screen.getByTestId("barriers-next"));
    fireEvent.click(screen.getByTestId("simulate-loading")); // isGenerating=true
    fireEvent.click(screen.getByTestId("do-generate-no-lc")); // no onLoadingChange(false)
    // Without the fix: isGenerating stays true → generation dialog visible (bug).
    // With the fix: handleResult resets isGenerating → unsaved dialog shows instead.
    expect(screen.queryByText(/adaptação ainda está em andamento/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sair sem salvar/i)).toBeInTheDocument();
  });

  it("calls useNavigationGuard with false after saving (isSaved=true)", async () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(mockMarkReady).toHaveBeenCalled());
    expect(mockNavGuard).toHaveBeenLastCalledWith(false);
  });

  // --- generation guard dialog ------------------------------------------------

  it("shows 'A adaptação ainda está em andamento' dialog when generating and blocked", () => {
    mockNavGuard.mockReturnValue({ state: "blocked", reset: vi.fn(), proceed: vi.fn() });
    renderWithProviders(<CanonicalAdaptationWizard />);
    fireEvent.click(screen.getByTestId("pick-type"));
    fireEvent.click(screen.getByTestId("input-next"));
    fireEvent.click(screen.getByTestId("barriers-next"));
    fireEvent.click(screen.getByTestId("simulate-loading"));
    expect(screen.getByText(/adaptação ainda está em andamento/i)).toBeInTheDocument();
  });

  it("calls reset() when user clicks 'Continuar aqui' (generation dialog)", () => {
    const reset = vi.fn();
    mockNavGuard.mockReturnValue({ state: "blocked", reset, proceed: vi.fn() });
    renderWithProviders(<CanonicalAdaptationWizard />);
    fireEvent.click(screen.getByTestId("pick-type"));
    fireEvent.click(screen.getByTestId("input-next"));
    fireEvent.click(screen.getByTestId("barriers-next"));
    fireEvent.click(screen.getByTestId("simulate-loading"));
    fireEvent.click(screen.getByRole("button", { name: /Continuar aqui/i }));
    expect(reset).toHaveBeenCalled();
  });

  it("calls proceed() when user clicks 'Sair mesmo assim' (generation dialog)", () => {
    const proceed = vi.fn();
    mockNavGuard.mockReturnValue({ state: "blocked", reset: vi.fn(), proceed });
    renderWithProviders(<CanonicalAdaptationWizard />);
    fireEvent.click(screen.getByTestId("pick-type"));
    fireEvent.click(screen.getByTestId("input-next"));
    fireEvent.click(screen.getByTestId("barriers-next"));
    fireEvent.click(screen.getByTestId("simulate-loading"));
    fireEvent.click(screen.getByRole("button", { name: /Sair mesmo assim/i }));
    expect(proceed).toHaveBeenCalled();
  });

  it("calls reset() when generation dialog is dismissed via Escape key", () => {
    const reset = vi.fn();
    mockNavGuard.mockReturnValue({ state: "blocked", reset, proceed: vi.fn() });
    renderWithProviders(<CanonicalAdaptationWizard />);
    fireEvent.click(screen.getByTestId("pick-type"));
    fireEvent.click(screen.getByTestId("input-next"));
    fireEvent.click(screen.getByTestId("barriers-next"));
    fireEvent.click(screen.getByTestId("simulate-loading"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(reset).toHaveBeenCalled();
  });

  // --- unsaved guard dialog ---------------------------------------------------

  it("shows 'Sair sem salvar?' dialog when blocked after generation (unsaved result)", () => {
    mockNavGuard.mockReturnValue({ state: "blocked", reset: vi.fn(), proceed: vi.fn() });
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview(); // result set, isGenerating=false
    expect(screen.getByText(/sair sem salvar/i)).toBeInTheDocument();
    expect(screen.getByText(/rascunho ficará disponível no Histórico/i)).toBeInTheDocument();
  });

  it("calls reset() on 'Voltar e salvar' in unsaved dialog", () => {
    const reset = vi.fn();
    mockNavGuard.mockReturnValue({ state: "blocked", reset, proceed: vi.fn() });
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    fireEvent.click(screen.getByRole("button", { name: /Voltar e salvar/i }));
    expect(reset).toHaveBeenCalled();
  });

  it("calls proceed() on 'Sair assim mesmo' in unsaved dialog", () => {
    const proceed = vi.fn();
    mockNavGuard.mockReturnValue({ state: "blocked", reset: vi.fn(), proceed });
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    fireEvent.click(screen.getByRole("button", { name: /Sair assim mesmo/i }));
    expect(proceed).toHaveBeenCalled();
  });

  it("calls reset() when unsaved dialog is dismissed via Escape key", () => {
    const reset = vi.fn();
    mockNavGuard.mockReturnValue({ state: "blocked", reset, proceed: vi.fn() });
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToReview();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(reset).toHaveBeenCalled();
  });
});
