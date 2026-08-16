import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "@/test/helpers";
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

const mockStripeCheckout = vi.fn();
const mockPixPayment = vi.fn();

const PIX_PAYMENT = {
  qrCode: "00020126580014br.gov.bcb.pix0136abc",
  qrCodeBase64: "iVBORw0KGgo=",
  purchaseId: "purchase-1",
};

vi.mock("@/hooks/useCredits", () => ({
  useTransactionHistory: vi.fn(() => ({ data: mockTransactions, isLoading: false })),
  useCreateStripeCheckout: vi.fn(() => ({ mutateAsync: mockStripeCheckout, isPending: false })),
  useCreatePixPayment: vi.fn(() => ({ mutateAsync: mockPixPayment, isPending: false })),
  usePixPurchaseStatus: vi.fn(() => ({ data: { status: "pending" } })),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    profile: { credit_balance: 9, free_adaptation_used: false },
  })),
}));

function renderPage() {
  return renderWithProviders(<CreditsPage />);
}

describe("CreditsPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const m = await import("@/hooks/useCredits");
    vi.mocked(m.useTransactionHistory).mockReturnValue({
      data: mockTransactions,
      isLoading: false,
    } as never);
    vi.mocked(m.useCreateStripeCheckout).mockReturnValue({
      mutateAsync: mockStripeCheckout,
      isPending: false,
    } as never);
    vi.mocked(m.useCreatePixPayment).mockReturnValue({
      mutateAsync: mockPixPayment,
      isPending: false,
    } as never);
    vi.mocked(m.usePixPurchaseStatus).mockReturnValue({ data: { status: "pending" } } as never);
    mockPixPayment.mockResolvedValue(PIX_PAYMENT);
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

  it("renders a credit-card and a Pix button for every package", () => {
    renderPage();
    expect(screen.getAllByRole("button", { name: /cartão de crédito/i })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^pix$/i })).toHaveLength(3);
  });

  it("calls the Stripe checkout with the correct package on credit-card click", async () => {
    const user = userEvent.setup();
    mockStripeCheckout.mockResolvedValue({ url: "https://stripe.com/checkout" });
    renderPage();

    const cardButtons = screen.getAllByRole("button", { name: /cartão de crédito/i });
    await user.click(cardButtons[0]);

    await waitFor(() =>
      expect(mockStripeCheckout).toHaveBeenCalledWith({
        credits: 30,
        amountBrl: 9.9,
        method: "card",
      })
    );
  });

  it("sends the Pix click to the inline Pix payment, not Stripe", async () => {
    const user = userEvent.setup();
    renderPage();

    const pixButtons = screen.getAllByRole("button", { name: /^pix$/i });
    pixButtons.forEach((button) => expect(button).toBeEnabled());
    await user.click(pixButtons[1]);

    await waitFor(() =>
      expect(mockPixPayment).toHaveBeenCalledWith({
        credits: 120,
        amountBrl: 29.9,
      })
    );
    expect(mockStripeCheckout).not.toHaveBeenCalled();
  });

  // The whole point of Checkout Transparente: the QR shows up right here.
  it("shows the QR code on the page itself after the Pix payment is created", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole("button", { name: /^pix$/i })[0]);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /qr code/i })).toBeInTheDocument();
    expect(screen.getByText(PIX_PAYMENT.qrCode)).toBeInTheDocument();
  });

  it("keeps the QR dialog closed until a Pix payment exists", () => {
    renderPage();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears the Pix when the buyer closes the QR dialog", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole("button", { name: /^pix$/i })[0]);
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  // A failed create must not leave an empty QR dialog on screen.
  it("does not open the QR dialog when the Pix payment fails", async () => {
    const user = userEvent.setup();
    mockPixPayment.mockRejectedValue(new Error("Pix indisponível."));
    renderPage();

    await user.click(screen.getAllByRole("button", { name: /^pix$/i })[0]);

    await waitFor(() => expect(mockPixPayment).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not render the R$1 test package for regular users", () => {
    renderPage();
    expect(screen.queryByText(/teste \(admin\)/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /cartão de crédito/i })).toHaveLength(3);
  });

  it("renders the R$1 test package card for super-admins, with both payment methods", async () => {
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue({
      profile: { credit_balance: 9, is_super_admin: true },
    } as never);
    renderPage();

    expect(screen.getByText(/teste \(admin\)/i)).toBeInTheDocument();
    expect(screen.getByText(/1 crédito$/i)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*1[,.]00/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /cartão de crédito/i })).toHaveLength(4);
    // R$1 clears the R$0,50 Pix minimum, so the smoke test covers both rails.
    expect(screen.getAllByRole("button", { name: /^pix$/i })).toHaveLength(4);
  });

  it("calls the Stripe checkout with 1 credit / R$1 when the super-admin buys the test package", async () => {
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue({
      profile: { credit_balance: 9, is_super_admin: true },
    } as never);
    const user = userEvent.setup();
    mockStripeCheckout.mockResolvedValue({ url: "https://stripe.com/checkout" });
    renderPage();

    const cardButtons = screen.getAllByRole("button", { name: /cartão de crédito/i });
    await user.click(cardButtons[3]);

    await waitFor(() =>
      expect(mockStripeCheckout).toHaveBeenCalledWith({
        credits: 1,
        amountBrl: 1,
        method: "card",
      })
    );
  });

  it("lets the super-admin smoke-test a real Pix payment with the R$1 package", async () => {
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue({
      profile: { credit_balance: 9, is_super_admin: true },
    } as never);
    const user = userEvent.setup();
    renderPage();

    const pixButtons = screen.getAllByRole("button", { name: /^pix$/i });
    await user.click(pixButtons[3]);

    await waitFor(() =>
      expect(mockPixPayment).toHaveBeenCalledWith({
        credits: 1,
        amountBrl: 1,
      })
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
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
