import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AdaptacoesPage from "./AdaptacoesPage";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => mockNavigate,
}));

const mockDelete = vi.fn();
const mockDuplicate = vi.fn();
vi.mock("@/hooks/useAdaptations", () => ({
  useAdaptations: vi.fn(),
  useDeleteAdaptation: vi.fn(() => ({ mutateAsync: mockDelete, isPending: false })),
  useDuplicateAdaptation: vi.fn(() => ({ mutateAsync: mockDuplicate, isPending: false })),
}));

const items = [
  { id: "a1", title: "Prova de Física", activity_type: "prova", status: "ready", credits_spent: 3, updated_at: "2026-06-01T00:00:00Z" },
  { id: "a2", title: "Exercício de Português", activity_type: "exercício", status: "ready", credits_spent: 0, updated_at: "2026-06-02T00:00:00Z" },
  { id: "a3", title: "Rascunho inacabado", activity_type: null, status: "draft", credits_spent: 0, updated_at: "2026-06-03T00:00:00Z" },
  { id: "a4", title: "", activity_type: null, status: "ready", credits_spent: 1, updated_at: "2026-06-04T00:00:00Z" },
  { id: "a5", title: "Sem custo", activity_type: null, status: "ready", credits_spent: null, updated_at: "2026-06-05T00:00:00Z" },
];

function renderPage() {
  return render(<MemoryRouter><AdaptacoesPage /></MemoryRouter>);
}

describe("AdaptacoesPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptations).mockReturnValue({ data: items, isLoading: false } as never);
    vi.mocked(m.useDeleteAdaptation).mockReturnValue({ mutateAsync: mockDelete, isPending: false } as never);
    vi.mocked(m.useDuplicateAdaptation).mockReturnValue({ mutateAsync: mockDuplicate, isPending: false } as never);
  });

  // The safe half of "salvar como nova": from the list there is no autosave in
  // flight racing the copy, so it needs none of the roll-the-original-back
  // machinery the same choice would require inside the editor.
  describe("duplicar", () => {
    it("copies an adaptation under a clearly derived name", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Duplicar Prova de Física/i }));
      await waitFor(() =>
        expect(mockDuplicate).toHaveBeenCalledWith({ id: "a1", title: "Prova de Física (cópia)" }),
      );
    });

    it("names the copy of an untitled adaptation without inheriting the blank", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Duplicar adaptação/i }));
      await waitFor(() =>
        expect(mockDuplicate).toHaveBeenCalledWith({
          id: "a4",
          title: "Adaptação sem título (cópia)",
        }),
      );
    });
  });

  it("renders the page heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /adaptações/i })).toBeInTheDocument();
  });

  // This page used to filter to `status === "ready"`, which hid every
  // adaptation the teacher had not explicitly "finished". The row is written
  // by the edge function BEFORE the credit reservation is settled, so a draft
  // is something already paid for — hiding it was the bug, not the feature.
  // `status` is information now, not permission.
  it("lists drafts alongside finished adaptations", () => {
    renderPage();
    expect(screen.getByText("Prova de Física")).toBeInTheDocument();
    expect(screen.getByText("Exercício de Português")).toBeInTheDocument();
    expect(screen.getByText("Rascunho inacabado")).toBeInTheDocument();
  });

  it("badges a draft as Rascunho and a finished one as Concluída", () => {
    renderPage();
    const draftCard = screen.getByText("Rascunho inacabado").closest("li")!;
    expect(within(draftCard).getByText("Rascunho")).toBeInTheDocument();
    const readyCard = screen.getByText("Prova de Física").closest("li")!;
    expect(within(readyCard).getByText("Concluída")).toBeInTheDocument();
  });

  describe("pastas por matéria", () => {
    const filed = [
      { id: "f1", title: "Prova de Geografia", activity_type: "prova", status: "ready", subject: "Geografia", credits_spent: 1, updated_at: "2026-06-01T00:00:00Z" },
      { id: "f2", title: "Prova de Física", activity_type: "prova", status: "ready", subject: "Física", credits_spent: 1, updated_at: "2026-06-02T00:00:00Z" },
      { id: "f3", title: "Outra de Geografia", activity_type: "prova", status: "draft", subject: "Geografia", credits_spent: 1, updated_at: "2026-06-03T00:00:00Z" },
      { id: "f4", title: "Ainda sem pasta", activity_type: null, status: "draft", subject: null, credits_spent: 0, updated_at: "2026-06-04T00:00:00Z" },
    ];

    async function renderFiled() {
      const m = await import("@/hooks/useAdaptations");
      vi.mocked(m.useAdaptations).mockReturnValue({ data: filed, isLoading: false } as never);
      renderPage();
    }

    it("groups the adaptations under a heading per subject", async () => {
      await renderFiled();
      expect(screen.getByRole("heading", { name: "Geografia" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Física" })).toBeInTheDocument();
    });

    it("puts the unclassified ones in their own group", async () => {
      await renderFiled();
      expect(screen.getByRole("heading", { name: "Sem matéria" })).toBeInTheDocument();
    });

    it("files each adaptation under its own subject", async () => {
      await renderFiled();
      const geografia = screen.getByRole("heading", { name: "Geografia" }).closest("section")!;
      expect(within(geografia).getByText("Prova de Geografia")).toBeInTheDocument();
      expect(within(geografia).getByText("Outra de Geografia")).toBeInTheDocument();
      expect(within(geografia).queryByText("Prova de Física")).not.toBeInTheDocument();
    });

    it("keeps the unclassified group last, after the named folders", async () => {
      await renderFiled();
      const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
      expect(headings[headings.length - 1]).toBe("Sem matéria");
    });

    it("does not render a folder heading when nothing is classified", () => {
      // Every fixture in `items` predates the subject column.
      renderPage();
      expect(screen.queryByRole("heading", { name: "Sem matéria" })).not.toBeInTheDocument();
    });
  });

  it("shows loading state", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptations).mockReturnValue({ data: undefined, isLoading: true } as never);
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it("shows the empty state only when there is genuinely nothing", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptations).mockReturnValue({ data: [], isLoading: false } as never);
    renderPage();
    expect(screen.getByText(/nenhuma adaptação ainda/i)).toBeInTheDocument();
  });

  it("shows the draft instead of an empty state when only drafts exist", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptations).mockReturnValue({ data: [items[2]], isLoading: false } as never);
    renderPage();
    expect(screen.getByText("Rascunho inacabado")).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma adaptação/i)).not.toBeInTheDocument();
  });

  it("shows credits spent per card (non-zero)", () => {
    renderPage();
    expect(screen.getByText(/3 crédito/i)).toBeInTheDocument();
  });

  it("shows 'Gratuita' for zero-credit adaptations", () => {
    renderPage();
    expect(screen.getAllByText(/gratuita/i).length).toBeGreaterThanOrEqual(1);
  });

  it("navigates to editor on Editar click", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /editar prova de física/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/adaptar/editar/a1");
  });

  it("navigates to new adaptation", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /nova adaptação/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/adaptar");
  });

  it("opens delete confirmation on Excluir click", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /excluir prova de física/i }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("confirms deletion and calls mutation", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /excluir prova de física/i }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(dialog.querySelector("button.bg-destructive")!);
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("a1"));
  });

  it("cancels deletion without calling mutation", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /excluir prova de física/i }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /cancelar/i }));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("navigates to /adaptar when 'Criar primeira adaptação' is clicked in empty state", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptations).mockReturnValue({ data: [], isLoading: false } as never);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /criar primeira adaptação/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/adaptar");
  });

  it("shows '1 crédito' (singular) for a single-credit adaptation", () => {
    renderPage();
    expect(screen.getByText("1 crédito")).toBeInTheDocument();
  });

  it("renders card without activity_type badge when activity_type is null", () => {
    renderPage();
    // a4 has activity_type: null — badge not rendered; only a1 and a2 show badges
    expect(screen.getByText("prova")).toBeInTheDocument();
    expect(screen.getByText("exercício")).toBeInTheDocument();
    // no "null" text leaks into the DOM
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("shows 'Adaptação sem título' fallback for empty-title ready adaptations", () => {
    renderPage();
    expect(screen.getByText("Adaptação sem título")).toBeInTheDocument();
  });
});
