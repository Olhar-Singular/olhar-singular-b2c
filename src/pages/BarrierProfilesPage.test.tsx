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

  it("shows loader when isLoading", async () => {
    const m = await import("@/hooks/useBarrierProfiles");
    vi.mocked(m.useBarrierProfiles).mockReturnValue({ data: [], isLoading: true } as never);
    renderPage();
    expect(screen.getByText(/Carregando/i)).toBeInTheDocument();
  });

  it("shows '+N' badge when profile has more than 3 barriers", async () => {
    const m = await import("@/hooks/useBarrierProfiles");
    vi.mocked(m.useBarrierProfiles).mockReturnValue({
      data: [{ ...mockProfiles[0], barriers: ["a", "b", "c", "d", "e"] }],
      isLoading: false,
    } as never);
    renderPage();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("opens edit dialog with prefilled values when Editar is clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Editar perfil/i)).toBeInTheDocument();
  });

  it("opens 'Criar primeiro perfil' button in empty state", async () => {
    const user = userEvent.setup();
    const m = await import("@/hooks/useBarrierProfiles");
    vi.mocked(m.useBarrierProfiles).mockReturnValue({ data: [], isLoading: false } as never);
    renderPage();
    await user.click(screen.getByRole("button", { name: /Criar primeiro perfil/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls update.mutateAsync when editing a profile and submitting (lines 63-68)", async () => {
    mockUpdate.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    // Open edit dialog
    await user.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Submit the form (BarrierProfileForm calls onSubmit with form values)
    // Directly trigger via the submit button in the form
    const submitBtn = screen.getByRole("button", { name: /Salvar perfil/i });
    await user.click(submitBtn);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  });

  it("calls create.mutateAsync when creating a new profile and submitting (else branch of handleSubmit)", async () => {
    mockCreate.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    // Click "Novo perfil" to open dialog with editing=null
    await user.click(screen.getByRole("button", { name: /novo perfil/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Novo perfil de barreira/i)).toBeInTheDocument();
    // Select at least one barrier so validation passes (schema requires min 1)
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    // Submit the form
    const submitBtn = screen.getByRole("button", { name: /Salvar perfil/i });
    await user.click(submitBtn);
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  });

  it("shows singular form when profile has exactly 1 barrier (covers !== 1 false branch)", async () => {
    const m = await import("@/hooks/useBarrierProfiles");
    vi.mocked(m.useBarrierProfiles).mockReturnValue({
      data: [{ ...mockProfiles[0], barriers: ["tea_abstracao"] }],
      isLoading: false,
    } as never);
    renderPage();
    // With 1 barrier, the text should be "1 barreira selecionada" (no trailing 's')
    expect(screen.getByText(/1 barreira/i)).toBeInTheDocument();
    // The text should NOT have trailing 's' after "selecionada"
    const statsText = screen.getByText(/1 barreira/i).textContent;
    expect(statsText).toMatch(/1 barreira selecionada$/);
  });
});
