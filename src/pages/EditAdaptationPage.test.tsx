import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import EditAdaptationPage from "./EditAdaptationPage";
import { validResult } from "@/lib/adaptation/persistence/__fixtures__/result";

vi.mock("@/hooks/useAdaptations", () => ({ useAdaptation: vi.fn() }));

// Stub the wizard to assert it receives the right edit-mode seed. It also
// counts mounts, so a remount (lost cursor, lost scroll, back to Revisar) is
// visible to the tests.
const mountSpy = vi.fn();
vi.mock("@/components/adaptation/CanonicalAdaptationWizard", () => {
  function WizardStub({
    editMode,
  }: {
    editMode?: { adaptationId: string; initialUpdatedAt: string };
  }) {
    useEffect(() => {
      mountSpy();
    }, []);
    return (
      <div data-testid="wizard">
        {editMode?.adaptationId}:{editMode?.initialUpdatedAt}
      </div>
    );
  }
  return { default: WizardStub };
});

const ROW = {
  id: "a1",
  user_id: "u1",
  barrier_profile_id: null,
  title: "T",
  original_activity: "atividade",
  activity_type: "prova",
  barriers_used: [],
  adaptation_result: validResult,
  status: "draft",
  credits_spent: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

function renderAt(id = "a1") {
  return render(
    <MemoryRouter initialEntries={[`/adaptar/editar/${id}`]}>
      <Routes>
        <Route path="/adaptar/editar/:id" element={<EditAdaptationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EditAdaptationPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading state", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptation).mockReturnValue({ data: undefined, isLoading: true, isError: false } as never);
    renderAt();
    expect(screen.getByText(/carregando adaptação/i)).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptation).mockReturnValue({ data: undefined, isLoading: false, isError: true } as never);
    renderAt();
    expect(screen.getByText(/não foi possível carregar/i)).toBeInTheDocument();
  });

  it("shows the error state when there is no row", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptation).mockReturnValue({ data: undefined, isLoading: false, isError: false } as never);
    renderAt();
    expect(screen.getByText(/não foi possível carregar/i)).toBeInTheDocument();
  });

  it("mounts the wizard in edit mode seeded from the row", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptation).mockReturnValue({ data: ROW, isLoading: false, isError: false } as never);
    renderAt();
    expect(screen.getByTestId("wizard")).toHaveTextContent("a1:2026-01-02T00:00:00Z");
  });

  // --- B13: the wizard must survive a refetch --------------------------------

  it("does NOT remount the wizard when the row's updated_at advances", async () => {
    // Every autosave bumps updated_at. While the key contained it, any refetch
    // that observed a newer row — a window refocus, the invalidation fired by
    // Salvar — threw the live wizard away mid-edit: cursor, scroll position and
    // the current step all reset back to Revisar.
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptation).mockReturnValue({ data: ROW, isLoading: false, isError: false } as never);
    const { rerender } = renderAt();
    expect(mountSpy).toHaveBeenCalledTimes(1);

    vi.mocked(m.useAdaptation).mockReturnValue({
      data: { ...ROW, updated_at: "2026-01-03T00:00:00Z" },
      isLoading: false,
      isError: false,
    } as never);
    rerender(
      <MemoryRouter initialEntries={["/adaptar/editar/a1"]}>
        <Routes>
          <Route path="/adaptar/editar/:id" element={<EditAdaptationPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(mountSpy).toHaveBeenCalledTimes(1);
  });
});
