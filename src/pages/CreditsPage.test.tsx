import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import CreditsPage from "./CreditsPage";

const mockTransactions = [
  {
    id: "t1",
    user_id: "u1",
    delta: -1,
    type: "adapt",
    ref_id: null,
    payment_id: null,
    created_at: "2026-04-20T10:00:00Z",
  },
  {
    id: "t2",
    user_id: "u1",
    delta: 10,
    type: "signup_bonus",
    ref_id: null,
    payment_id: null,
    created_at: "2026-04-19T10:00:00Z",
  },
];

const mockCheckout = vi.fn();

vi.mock("@/hooks/useCredits", () => ({
  useTransactionHistory: vi.fn(() => ({ data: mockTransactions, isLoading: false })),
  useCreateCheckout: vi.fn(() => ({ mutateAsync: mockCheckout, isPending: false })),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    profile: { credit_balance: 9, free_adaptation_used: false },
  })),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <CreditsPage />
    </MemoryRouter>
  );
}

describe("CreditsPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const m = await import("@/hooks/useCredits");
    vi.mocked(m.useTransactionHistory).mockReturnValue({
      data: mockTransactions,
      isLoading: false,
    } as never);
    vi.mocked(m.useCreateCheckout).mockReturnValue({
      mutateAsync: mockCheckout,
      isPending: false,
    } as never);
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue({
      profile: { credit_balance: 9 },
    } as never);
  });

  it("renders current credit balance", () => {
    renderPage();
    expect(screen.getByText(/^9$/)).toBeInTheDocument();
  });

  it("renders all three purchase packages", () => {
    renderPage();
    expect(screen.getByText(/30 créditos/i)).toBeInTheDocument();
    expect(screen.getByText(/120 créditos/i)).toBeInTheDocument();
    expect(screen.getByText(/300 créditos/i)).toBeInTheDocument();
  });

  it("renders package prices", () => {
    renderPage();
    expect(screen.getByText(/R\$\s*9[,.]90/i)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*29[,.]90/i)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*59[,.]90/i)).toBeInTheDocument();
  });

  it("renders transaction history", () => {
    renderPage();
    // signup bonus +10
    expect(screen.getByText(/\+10/)).toBeInTheDocument();
    // adapt debit -1
    expect(screen.getByText(/-1/)).toBeInTheDocument();
  });

  it("renders transaction type labels", () => {
    renderPage();
    expect(screen.getByText(/adaptação/i)).toBeInTheDocument();
    expect(screen.getByText(/bônus/i)).toBeInTheDocument();
  });

  it("calls createCheckout with correct package on button click", async () => {
    const user = userEvent.setup();
    mockCheckout.mockResolvedValue({ url: "https://mp.com/checkout" });
    renderPage();

    const buyButtons = screen.getAllByRole("button", { name: /comprar/i });
    await user.click(buyButtons[0]);

    await waitFor(() =>
      expect(mockCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ credits: 30 })
      )
    );
  });

  it("shows empty state when no transactions", async () => {
    const m = await import("@/hooks/useCredits");
    vi.mocked(m.useTransactionHistory).mockReturnValue({
      data: [],
      isLoading: false,
    } as never);
    renderPage();
    expect(screen.getByText(/nenhuma movimentação/i)).toBeInTheDocument();
  });

  it("shows dash when profile is null (branch 46: credit_balance ?? '—')", async () => {
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue({ profile: null } as never);
    renderPage();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows loading state for transactions (branch 104)", async () => {
    const m = await import("@/hooks/useCredits");
    vi.mocked(m.useTransactionHistory).mockReturnValue({
      data: [],
      isLoading: true,
    } as never);
    renderPage();
    expect(screen.getByText(/Carregando/i)).toBeInTheDocument();
  });

  it("falls back to raw type key when tx.type is unknown (branch 121: TYPE_LABELS ?? tx.type)", async () => {
    const m = await import("@/hooks/useCredits");
    vi.mocked(m.useTransactionHistory).mockReturnValue({
      data: [
        {
          id: "t99",
          user_id: "u1",
          delta: 5,
          type: "unknown_type_xyz",
          ref_id: null,
          payment_id: null,
          created_at: "2026-04-20T10:00:00Z",
        },
      ],
      isLoading: false,
    } as never);
    renderPage();
    expect(screen.getByText("unknown_type_xyz")).toBeInTheDocument();
  });
});
