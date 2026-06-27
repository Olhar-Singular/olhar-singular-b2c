import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import MyAdaptationsPage from "./MyAdaptationsPage";
import type { ActivityLogItem } from "@/hooks/useActivityLog";

vi.mock("@/hooks/useActivityLog", () => ({
  useActivityLog: vi.fn(),
}));

const items: ActivityLogItem[] = [
  { kind: "adaptation", id: "a1", title: "Prova de Física", activityType: "prova", status: "ready", creditsSpent: 5, date: "2026-06-01T00:00:00Z" },
  { kind: "extraction", id: "e1", fileName: "gabarito.pdf", questionsExtracted: 8, creditsSpent: 2, wasFree: false, date: "2026-06-02T00:00:00Z" },
  { kind: "adaptation", id: "a2", title: "Adaptação sem título", activityType: null, status: "draft", creditsSpent: 0, date: "2026-06-03T00:00:00Z" },
];

function renderPage() {
  return render(<MemoryRouter><MyAdaptationsPage /></MemoryRouter>);
}

describe("MyAdaptationsPage (Histórico)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const m = await import("@/hooks/useActivityLog");
    vi.mocked(m.useActivityLog).mockReturnValue({ data: items, isLoading: false } as never);
  });

  it("renders 'Histórico' heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /histórico/i })).toBeInTheDocument();
  });

  it("shows loading state", async () => {
    const m = await import("@/hooks/useActivityLog");
    vi.mocked(m.useActivityLog).mockReturnValue({ data: undefined, isLoading: true } as never);
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it("shows empty state", async () => {
    const m = await import("@/hooks/useActivityLog");
    vi.mocked(m.useActivityLog).mockReturnValue({ data: [], isLoading: false } as never);
    renderPage();
    expect(screen.getByText(/nenhuma atividade/i)).toBeInTheDocument();
  });

  it("shows adaptation items with title and credits", () => {
    renderPage();
    expect(screen.getByText("Prova de Física")).toBeInTheDocument();
    expect(screen.getByText(/5 crédito/i)).toBeInTheDocument();
  });

  it("shows 'Adaptação sem título' for untitled adaptations", () => {
    renderPage();
    expect(screen.getByText("Adaptação sem título")).toBeInTheDocument();
  });

  it("shows extraction items with file name and questions count", () => {
    renderPage();
    expect(screen.getByText("gabarito.pdf")).toBeInTheDocument();
    expect(screen.getByText(/8 questões/i)).toBeInTheDocument();
  });

  it("shows 'Gratuita' for zero-credit items", () => {
    renderPage();
    expect(screen.getAllByText(/gratuita/i).length).toBeGreaterThan(0);
  });

  it("does NOT render edit buttons (read-only)", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
  });

  it("does NOT render delete buttons (read-only)", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: /excluir/i })).not.toBeInTheDocument();
  });

  it("shows '1 crédito' (singular) for single-credit items", async () => {
    const m = await import("@/hooks/useActivityLog");
    vi.mocked(m.useActivityLog).mockReturnValue({
      data: [{ kind: "adaptation", id: "x1", title: "Teste singular", activityType: null, status: "ready", creditsSpent: 1, date: "2026-06-01T00:00:00Z" }],
      isLoading: false,
    } as never);
    renderPage();
    expect(screen.getByText("1 crédito")).toBeInTheDocument();
  });
});
