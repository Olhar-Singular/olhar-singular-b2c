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
vi.mock("@/hooks/useAdaptations", () => ({
  useAdaptations: vi.fn(),
  useDeleteAdaptation: vi.fn(() => ({ mutateAsync: mockDelete, isPending: false })),
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
  });

  it("renders the page heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /adaptações/i })).toBeInTheDocument();
  });

  it("shows only ready adaptations — drafts are excluded", () => {
    renderPage();
    expect(screen.getByText("Prova de Física")).toBeInTheDocument();
    expect(screen.getByText("Exercício de Português")).toBeInTheDocument();
    expect(screen.queryByText("Rascunho inacabado")).not.toBeInTheDocument();
  });

  it("shows loading state", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptations).mockReturnValue({ data: undefined, isLoading: true } as never);
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it("shows empty state when no ready adaptations exist", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptations).mockReturnValue({ data: [], isLoading: false } as never);
    renderPage();
    expect(screen.getByText(/nenhuma adaptação concluída/i)).toBeInTheDocument();
  });

  it("shows empty state even when only drafts exist", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptations).mockReturnValue({ data: [items[2]], isLoading: false } as never);
    renderPage();
    expect(screen.getByText(/nenhuma adaptação concluída/i)).toBeInTheDocument();
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
