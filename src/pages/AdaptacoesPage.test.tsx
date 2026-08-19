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
  adaptationKeys: { all: ["adaptations"], list: () => ["adaptations", "list"] },
}));

const mockCreateFolder = vi.fn();
const mockRenameFolder = vi.fn();
const mockDeleteFolder = vi.fn();
const mockMove = vi.fn();
vi.mock("@/hooks/useFolders", () => ({
  useFolders: vi.fn(),
  useCreateFolder: vi.fn(() => ({ mutateAsync: mockCreateFolder, isPending: false })),
  useRenameFolder: vi.fn(() => ({ mutateAsync: mockRenameFolder, isPending: false })),
  useDeleteFolder: vi.fn(() => ({ mutateAsync: mockDeleteFolder, isPending: false })),
  useMoveAdaptation: vi.fn(() => ({ mutateAsync: mockMove, isPending: false })),
}));

const items = [
  { id: "a1", title: "Prova de Física", activity_type: "prova", subject: "Física", folder_id: "f1", status: "ready", credits_spent: 3, updated_at: "2026-06-01T00:00:00Z" },
  { id: "a2", title: "Exercício de Português", activity_type: "exercício", subject: "Português", folder_id: null, status: "ready", credits_spent: 0, updated_at: "2026-06-02T00:00:00Z" },
  { id: "a3", title: "Rascunho inacabado", activity_type: null, subject: null, folder_id: null, status: "draft", credits_spent: 0, updated_at: "2026-06-03T00:00:00Z" },
  { id: "a4", title: "", activity_type: null, subject: null, folder_id: null, status: "ready", credits_spent: 1, updated_at: "2026-06-04T00:00:00Z" },
  { id: "a5", title: "Sem custo", activity_type: null, subject: null, folder_id: null, status: "ready", credits_spent: null, updated_at: "2026-06-05T00:00:00Z" },
];

const folders = [
  { id: "f1", name: "6º ano B" },
  { id: "f2", name: "Recuperação" },
];

function renderPage() {
  return render(<MemoryRouter><AdaptacoesPage /></MemoryRouter>);
}

async function setAdaptations(data: unknown[]) {
  const m = await import("@/hooks/useAdaptations");
  vi.mocked(m.useAdaptations).mockReturnValue({ data, isLoading: false } as never);
}

describe("AdaptacoesPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const a = await import("@/hooks/useAdaptations");
    vi.mocked(a.useAdaptations).mockReturnValue({ data: items, isLoading: false } as never);
    vi.mocked(a.useDeleteAdaptation).mockReturnValue({ mutateAsync: mockDelete, isPending: false } as never);
    vi.mocked(a.useDuplicateAdaptation).mockReturnValue({ mutateAsync: mockDuplicate, isPending: false } as never);
    const f = await import("@/hooks/useFolders");
    vi.mocked(f.useFolders).mockReturnValue({ data: folders, isLoading: false } as never);
    vi.mocked(f.useCreateFolder).mockReturnValue({ mutateAsync: mockCreateFolder, isPending: false } as never);
    vi.mocked(f.useRenameFolder).mockReturnValue({ mutateAsync: mockRenameFolder, isPending: false } as never);
    vi.mocked(f.useDeleteFolder).mockReturnValue({ mutateAsync: mockDeleteFolder, isPending: false } as never);
    vi.mocked(f.useMoveAdaptation).mockReturnValue({ mutateAsync: mockMove, isPending: false } as never);
  });

  it("renders the page heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /adaptações/i, level: 1 })).toBeInTheDocument();
  });

  // This page used to filter to `status === "ready"`, hiding every adaptation
  // the teacher had not explicitly finished. The row is written by the edge
  // function BEFORE the credit reservation is settled, so a draft is already
  // paid for — hiding it was the bug. `status` is information, not permission.
  it("lists drafts alongside finished adaptations", () => {
    renderPage();
    expect(screen.getByText("Prova de Física")).toBeInTheDocument();
    expect(screen.getByText("Rascunho inacabado")).toBeInTheDocument();
  });

  it("badges a draft as Rascunho and a finished one as Concluída", () => {
    renderPage();
    const draftCard = screen.getByText("Rascunho inacabado").closest("li")!;
    expect(within(draftCard).getByText("Rascunho")).toBeInTheDocument();
    const readyCard = screen.getByText("Prova de Física").closest("li")!;
    expect(within(readyCard).getByText("Concluída")).toBeInTheDocument();
  });

  it("shows loading state", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptations).mockReturnValue({ data: undefined, isLoading: true } as never);
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it("shows the empty state only when there is genuinely nothing", async () => {
    await setAdaptations([]);
    renderPage();
    expect(screen.getByText(/nenhuma adaptação ainda/i)).toBeInTheDocument();
  });

  it("shows credits spent per card (non-zero)", () => {
    renderPage();
    expect(screen.getByText(/3 crédito/i)).toBeInTheDocument();
  });

  it("shows 'Gratuita' for zero-credit adaptations", () => {
    renderPage();
    expect(screen.getAllByText(/gratuita/i).length).toBeGreaterThanOrEqual(1);
  });

  it("navigates to the wizard from Nova adaptação", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Nova adaptação/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/adaptar");
  });

  it("navigates to the wizard from the empty state", async () => {
    await setAdaptations([]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Criar primeira adaptação/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/adaptar");
  });

  it("opens the editor for an adaptation", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Editar Prova de Física/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/adaptar/editar/a1");
  });

  describe("excluir adaptação", () => {
    it("asks before deleting and then deletes", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Excluir Prova de Física/i }));
      expect(screen.getByText(/Excluir adaptação\?/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Excluir$/i }));
      await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("a1"));
    });

    it("closes the confirmation without deleting on Cancelar", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Excluir Prova de Física/i }));
      fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

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

  describe("pastas", () => {
    it("groups each adaptation under its folder", () => {
      renderPage();
      const filed = screen.getByRole("heading", { name: "6º ano B" }).closest("section")!;
      expect(within(filed).getByText("Prova de Física")).toBeInTheDocument();
    });

    // The whole reason folders are rows and not a text column: a folder just
    // created has to be visible before anything is in it, or there is nowhere
    // to move the first adaptation to.
    it("shows a folder that is still empty", () => {
      renderPage();
      const empty = screen.getByRole("heading", { name: "Recuperação" }).closest("section")!;
      expect(within(empty).getByText(/pasta vazia/i)).toBeInTheDocument();
    });

    it("collects the unfiled ones under Sem pasta", () => {
      renderPage();
      const unfiled = screen.getByRole("heading", { name: "Sem pasta" }).closest("section")!;
      expect(within(unfiled).getByText("Exercício de Português")).toBeInTheDocument();
    });

    it("creates a folder with the typed name", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Nova pasta/i }));
      fireEvent.change(screen.getByLabelText("Nome da nova pasta"), {
        target: { value: "7º ano A" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^Criar$/i }));
      await waitFor(() => expect(mockCreateFolder).toHaveBeenCalledWith("7º ano A"));
    });

    it("will not create a folder with a blank name", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Nova pasta/i }));
      expect(screen.getByRole("button", { name: /^Criar$/i })).toBeDisabled();
    });

    it("creates the folder on Enter, without reaching for the button", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Nova pasta/i }));
      const field = screen.getByLabelText("Nome da nova pasta");
      fireEvent.change(field, { target: { value: "8º ano" } });
      fireEvent.keyDown(field, { key: "Enter" });
      await waitFor(() => expect(mockCreateFolder).toHaveBeenCalledWith("8º ano"));
    });

    it("ignores Enter on a blank name instead of creating an unnamed folder", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Nova pasta/i }));
      fireEvent.keyDown(screen.getByLabelText("Nome da nova pasta"), { key: "Enter" });
      expect(mockCreateFolder).not.toHaveBeenCalled();
    });

    it("abandons the new folder on Cancelar", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Nova pasta/i }));
      fireEvent.click(screen.getByRole("button", { name: /^Cancelar$/i }));
      expect(screen.queryByLabelText("Nome da nova pasta")).not.toBeInTheDocument();
    });

    it("renames a folder", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Renomear pasta 6º ano B/i }));
      fireEvent.change(screen.getByLabelText("Novo nome da pasta"), {
        target: { value: "6º ano C" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^Salvar$/i }));
      await waitFor(() =>
        expect(mockRenameFolder).toHaveBeenCalledWith({ id: "f1", name: "6º ano C" }),
      );
    });

    it("abandons a rename on Cancelar", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Renomear pasta 6º ano B/i }));
      fireEvent.click(screen.getByRole("button", { name: /^Cancelar$/i }));
      expect(screen.queryByLabelText("Novo nome da pasta")).not.toBeInTheDocument();
      expect(mockRenameFolder).not.toHaveBeenCalled();
    });

    // People fear exactly the opposite, so the dialog has to say it outright:
    // the adaptations are paid work and the FK is ON DELETE SET NULL.
    it("promises that deleting a folder keeps the adaptations", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Excluir pasta 6º ano B/i }));
      expect(screen.getByText(/NÃO serão excluídas/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Excluir pasta$/i }));
      await waitFor(() => expect(mockDeleteFolder).toHaveBeenCalledWith("f1"));
    });

    it("moves an adaptation into another folder", async () => {
      renderPage();
      fireEvent.change(screen.getByLabelText(/Mover Prova de Física/i), {
        target: { value: "f2" },
      });
      await waitFor(() =>
        expect(mockMove).toHaveBeenCalledWith({ adaptationId: "a1", folderId: "f2" }),
      );
    });

    it("takes an adaptation out of every folder", async () => {
      renderPage();
      fireEvent.change(screen.getByLabelText(/Mover Prova de Física/i), { target: { value: "" } });
      await waitFor(() =>
        expect(mockMove).toHaveBeenCalledWith({ adaptationId: "a1", folderId: null }),
      );
    });

    it("hides Sem pasta when everything is filed", async () => {
      await setAdaptations([items[0]]);
      renderPage();
      expect(screen.queryByRole("heading", { name: "Sem pasta" })).not.toBeInTheDocument();
    });
  });

  describe("filtros", () => {
    it("filters by matéria", () => {
      renderPage();
      fireEvent.change(screen.getByLabelText("Filtrar por matéria"), {
        target: { value: "Física" },
      });
      expect(screen.getByText("Prova de Física")).toBeInTheDocument();
      expect(screen.queryByText("Exercício de Português")).not.toBeInTheDocument();
    });

    it("filters by tipo", () => {
      renderPage();
      fireEvent.change(screen.getByLabelText("Filtrar por tipo"), { target: { value: "prova" } });
      expect(screen.getByText("Prova de Física")).toBeInTheDocument();
      expect(screen.queryByText("Exercício de Português")).not.toBeInTheDocument();
    });

    it("shows the type by its human label, not the stored value", () => {
      renderPage();
      const card = screen.getByText("Exercício de Português").closest("li")!;
      expect(within(card).getByText("Exercício")).toBeInTheDocument();
    });

    it("shows the matéria as its own badge", () => {
      renderPage();
      const card = screen.getByText("Prova de Física").closest("li")!;
      expect(within(card).getByText("Física")).toBeInTheDocument();
    });

    it("resets the tipo filter back to all", () => {
      renderPage();
      const select = screen.getByLabelText("Filtrar por tipo");
      fireEvent.change(select, { target: { value: "prova" } });
      fireEvent.change(select, { target: { value: "" } });
      expect(screen.getByText("Exercício de Português")).toBeInTheDocument();
    });

    it("offers to clear the filters only once one is on", () => {
      renderPage();
      expect(screen.queryByRole("button", { name: /Limpar filtros/i })).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Filtrar por tipo"), { target: { value: "prova" } });
      fireEvent.click(screen.getByRole("button", { name: /Limpar filtros/i }));
      expect(screen.getByText("Exercício de Português")).toBeInTheDocument();
    });

    it("resets the matéria filter back to all", () => {
      renderPage();
      const select = screen.getByLabelText("Filtrar por matéria");
      fireEvent.change(select, { target: { value: "Física" } });
      fireEvent.change(select, { target: { value: "" } });
      expect(screen.getByText("Exercício de Português")).toBeInTheDocument();
    });
  });
});
