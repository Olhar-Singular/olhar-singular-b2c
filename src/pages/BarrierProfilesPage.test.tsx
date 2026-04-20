import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import BarrierProfilesPage from "./BarrierProfilesPage";

const mockProfiles = [
  {
    id: "p1",
    user_id: "u1",
    barriers: ["tea_abstracao", "tdah_atencao_sustentada"],
    observation: "Precisa de apoio visual",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/hooks/useBarrierProfiles", () => ({
  useBarrierProfiles: vi.fn(() => ({ data: mockProfiles, isLoading: false })),
  useCreateBarrierProfile: vi.fn(() => ({ mutateAsync: mockCreate, isPending: false })),
  useUpdateBarrierProfile: vi.fn(() => ({ mutateAsync: mockUpdate, isPending: false })),
  useDeleteBarrierProfile: vi.fn(() => ({ mutateAsync: mockDelete, isPending: false })),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <BarrierProfilesPage />
    </MemoryRouter>
  );
}

describe("BarrierProfilesPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const m = await import("@/hooks/useBarrierProfiles");
    vi.mocked(m.useBarrierProfiles).mockReturnValue({ data: mockProfiles, isLoading: false } as never);
    vi.mocked(m.useCreateBarrierProfile).mockReturnValue({ mutateAsync: mockCreate, isPending: false } as never);
    vi.mocked(m.useUpdateBarrierProfile).mockReturnValue({ mutateAsync: mockUpdate, isPending: false } as never);
    vi.mocked(m.useDeleteBarrierProfile).mockReturnValue({ mutateAsync: mockDelete, isPending: false } as never);
  });

  it("renders page title", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /perfis de barreira/i })).toBeInTheDocument();
  });

  it("renders existing profile with barrier count", () => {
    renderPage();
    expect(screen.getByText(/2 barreira/i)).toBeInTheDocument();
  });

  it("renders observation text", () => {
    renderPage();
    expect(screen.getByText(/apoio visual/i)).toBeInTheDocument();
  });

  it("shows empty state when no profiles", async () => {
    const { useBarrierProfiles } = await import("@/hooks/useBarrierProfiles");
    vi.mocked(useBarrierProfiles).mockReturnValue({ data: [], isLoading: false } as never);
    renderPage();
    expect(screen.getByText(/nenhum perfil/i)).toBeInTheDocument();
  });

  it("opens create dialog on button click", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /novo perfil/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls delete when delete button clicked and confirmed", async () => {
    const user = userEvent.setup();
    mockDelete.mockResolvedValue(undefined);
    renderPage();
    await user.click(screen.getByRole("button", { name: /excluir/i }));
    await user.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("p1"));
  });
});
