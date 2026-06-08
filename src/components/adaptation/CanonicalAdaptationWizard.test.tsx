import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers";
import CanonicalAdaptationWizard from "./CanonicalAdaptationWizard";
import type { AdaptationResult, CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { validateDocument } from "@/lib/adaptation/canonical/validate";
import * as repo from "@/lib/adaptation/persistence/adaptationsRepo";
import * as mirror from "@/lib/adaptation/persistence/draftMirror";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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
  }: {
    onResult: (r: AdaptationResult) => void;
    onNext: () => void;
  }) => (
    <button
      data-testid="do-generate"
      onClick={() => {
        onResult(makeResult());
        onNext();
      }}
    >
      generate
    </button>
  ),
}));

// CanonicalEditor (used by StepContent) — edits the first block's text.
vi.mock("./canonical-editor/CanonicalEditor", () => ({
  CanonicalEditor: ({
    value,
    onChange,
  }: {
    value: CanonicalDocument;
    onChange: (d: CanonicalDocument) => void;
  }) => (
    <button
      data-testid="edit-content"
      onClick={() =>
        onChange({
          ...value,
          blocks: [{ id: id(1), type: "paragraph", content: [{ type: "text", text: "EDITADO" }] }],
        })
      }
    >
      {(value.blocks[0] as { content: { text: string }[] }).content[0].text}
    </button>
  ),
}));

// CanonicalRenderer (used by the export step) — exposes the doc as JSON.
vi.mock("./render/CanonicalRenderer", () => ({
  CanonicalRenderer: ({ document }: { document: CanonicalDocument }) => (
    <pre data-testid="render-doc">{JSON.stringify(document)}</pre>
  ),
}));

// StylingSurface (the click-to-edit editor surface) — the wizard test only
// cares about SSOT wiring, not the editor internals (covered by its own tests).
// Expose a readout of the live document and a button that applies a block style.
vi.mock("./steps/styling/StylingSurface", () => ({
  StylingSurface: ({
    document,
    onChange,
  }: {
    document: CanonicalDocument;
    onChange: (d: CanonicalDocument) => void;
  }) => (
    <div>
      <pre data-testid="style-doc">{JSON.stringify(document)}</pre>
      <button
        data-testid="edit-style"
        onClick={() =>
          onChange({
            ...document,
            blocks: document.blocks.map((b, i) =>
              i === 0 ? { ...b, style: { align: "center" } } : b,
            ),
          })
        }
      >
        editar estilo
      </button>
    </div>
  ),
}));

// --- helpers ----------------------------------------------------------------

function advanceToContent() {
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
});

describe("CanonicalAdaptationWizard", () => {
  it("walks the input steps and renders the content step after generation", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    expect(screen.getByTestId("edit-content")).toHaveTextContent("gerado");
  });

  it("generation sets a valid canonical document", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    // Move to styling to read the document out of the surface.
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    const doc = JSON.parse(screen.getByTestId("style-doc").textContent!);
    expect(validateDocument(doc)).toBeTruthy();
  });

  it("content edits propagate into the single document", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    fireEvent.click(screen.getByTestId("edit-content"));
    expect(screen.getByTestId("edit-content")).toHaveTextContent("EDITADO");
  });

  it("styling edits propagate to the same document", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    fireEvent.click(screen.getByTestId("edit-style"));
    const doc = JSON.parse(screen.getByTestId("style-doc").textContent!) as CanonicalDocument;
    expect(doc.blocks[0].style).toEqual({ align: "center" });
  });

  it("SSOT: content edit + style edit both survive navigating content ↔ styling", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();

    // 1) edit content
    fireEvent.click(screen.getByTestId("edit-content"));

    // 2) go to styling, edit a style
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    fireEvent.click(screen.getByTestId("edit-style"));

    // 3) go back to content — content edit must still be there
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(screen.getByTestId("edit-content")).toHaveTextContent("EDITADO");

    // 4) forward to styling again — both edits present in the one document
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    const doc = JSON.parse(screen.getByTestId("style-doc").textContent!) as CanonicalDocument;
    expect((doc.blocks[0] as { content: { text: string }[] }).content[0].text).toBe("EDITADO");
    expect(doc.blocks[0].style).toEqual({ align: "center" });
  });

  it("the step indicator navigates back to a visited step", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    fireEvent.click(screen.getByRole("button", { name: /1.*Tipo/i }));
    expect(screen.getByTestId("pick-type")).toBeInTheDocument();
  });

  it("regenerate is confirmed and replaces the document via the generate step", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();

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

  it("regenerate can also be triggered from the styling step", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    fireEvent.click(screen.getByRole("button", { name: /Regerar/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Regerar$/i }));
    // lands back on the generate step
    expect(screen.getByTestId("do-generate")).toBeInTheDocument();
  });

  it("cancelling the regenerate dialog keeps the current document", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
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
    advanceToContent();
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));

    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));
    expect(writeText).toHaveBeenCalledWith("gerado");

    fireEvent.click(screen.getByRole("button", { name: /Nova adaptação/i }));
    expect(screen.getByTestId("pick-type")).toBeInTheDocument();
  });

  it("export step navigates back to styling with Voltar", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(screen.getByTestId("edit-style")).toBeInTheDocument();
  });

  // --- M6 persistence wiring -------------------------------------------------

  it("creates a draft on first generation", async () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalledTimes(1));
    expect(repo.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", activity_type: "exercício" }),
    );
  });

  it("toasts when draft creation fails", async () => {
    vi.mocked(repo.saveDraft).mockRejectedValue(new Error("db down"));
    const { toast } = await import("sonner");
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("shows the autosave status indicator once a draft exists", async () => {
    mockDraftStatus.value = "saving";
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    expect(await screen.findByRole("status")).toHaveTextContent(/Salvando/i);
  });

  it("Salvar marks the draft ready, toasts, and navigates to history", async () => {
    const { toast } = await import("sonner");
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() =>
      expect(mockMarkReady).toHaveBeenCalledWith({
        id: "draft-1",
        expectedUpdatedAt: "2026-01-01T00:00:00Z",
      }),
    );
    expect(toast.success).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/historico");
  });

  it("Salvar uses the freshest updated_at returned by flush for the guard", async () => {
    // flush advanced the row (autosave landed) → its returned token, not the
    // render-time currentUpdatedAt, must be the one markReady receives.
    mockFlush.mockResolvedValue("2026-09-09T00:00:00Z");
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
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
    advanceToContent();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
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
    advanceToContent();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
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
    advanceToContent();
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
    advanceToContent();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Recuperar/i }));
    await waitFor(() =>
      expect(screen.getByTestId("edit-content")).toHaveTextContent("CREATE-RECOVER"),
    );
  });

  it("opens in edit mode at the content step seeded from a row", () => {
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
    advanceToContent();
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
    advanceToContent();
    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
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
    advanceToContent();
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
