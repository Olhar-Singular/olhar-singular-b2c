import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import MyAdaptationsPage from "./MyAdaptationsPage";

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
  {
    id: "a1",
    user_id: "u1",
    barrier_profile_id: null,
    title: "Atividade de frações",
    original_activity: "x",
    activity_type: "prova",
    barriers_used: [],
    status: "ready",
    credits_spent: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-10T00:00:00Z",
  },
  {
    id: "a2",
    user_id: "u1",
    barrier_profile_id: null,
    title: "",
    original_activity: "y",
    activity_type: null,
    barriers_used: [],
    status: "draft",
    credits_spent: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-11T00:00:00Z",
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <MyAdaptationsPage />
    </MemoryRouter>,
  );
}

describe("MyAdaptationsPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptations).mockReturnValue({ data: items, isLoading: false } as never);
    vi.mocked(m.useDeleteAdaptation).mockReturnValue({ mutateAsync: mockDelete, isPending: false } as never);
  });

  it("renders the page title", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /minhas adaptações/i })).toBeInTheDocument();
  });

  it("shows a loading state", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptations).mockReturnValue({ data: undefined, isLoading: true } as never);
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no adaptations", async () => {
    const m = await import("@/hooks/useAdaptations");
    vi.mocked(m.useAdaptations).mockReturnValue({ data: [], isLoading: false } as never);
    renderPage();
    expect(screen.getByText(/ainda não salvou nenhuma/i)).toBeInTheDocument();
  });

  it("lists adaptations with status badges and placeholder titles", () => {
    renderPage();
    expect(screen.getByText("Atividade de frações")).toBeInTheDocument();
    expect(screen.getByText("Salva")).toBeInTheDocument();
    expect(screen.getByText("Adaptação sem título")).toBeInTheDocument();
    expect(screen.getByText("Rascunho")).toBeInTheDocument();
  });

  it("navigates to the editor on Editar", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /editar atividade de frações/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/adaptar/editar/a1");
  });

  it("navigates to a new adaptation", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /nova adaptação/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/adaptar");
  });

  it("confirms and deletes an adaptation", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /excluir atividade de frações/i }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(dialog.querySelector("button.bg-destructive")!);
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("a1"));
  });

  it("cancels deletion without calling the mutation", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /excluir atividade de frações/i }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /cancelar/i }));
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
