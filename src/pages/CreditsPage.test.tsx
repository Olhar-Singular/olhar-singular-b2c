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
  {
    id: "t3",
    user_id: "u1",
    delta: 5,
    type: "mystery_type",
    ref_id: null,
    payment_id: null,
    created_at: "2026-04-18T10:00:00Z",
  },
];

const PACKAGES = [
  { id: "pkg-basic", credits: 30, amountBrl: 9.9, label: "Básico", highlight: false, adminOnly: false },
  { id: "pkg-pro", credits: 120, amountBrl: 29.9, label: "Profissional", highlight: true, adminOnly: false },
  { id: "pkg-max", credits: 300, amountBrl: 59.9, label: "Avançado", highlight: false, adminOnly: false },
];

const TEST_PACKAGE = { id: "pkg-test", credits: 1, amountBrl: 1, label: "Teste (admin)", highlight: false, adminOnly: true };

const { mockPixPayment, cardDialogProps } = vi.hoisted(() => ({ mockPixPayment: vi.fn(), cardDialogProps: vi.fn() }));

const PIX_PAYMENT = {
  qrCode: "00020126580014br.gov.bcb.pix0136abc",
  qrCodeBase64: "iVBORw0KGgo=",
  purchaseId: "purchase-1",
};

vi.mock("@/hooks/useCredits", () => ({
  useTransactionHistory: vi.fn(() => ({ data: mockTransactions, isLoading: false })),
  usePackages: vi.fn(() => ({ data: PACKAGES, isLoading: false })),
  useCreatePixPayment: vi.fn(() => ({ mutateAsync: mockPixPayment, isPending: false })),
  usePurchaseStatus: vi.fn(() => ({ data: { status: "pending" } })),
}));

// The card dialog has its own suite; here only the wiring matters.
vi.mock("@/components/credits/CardPaymentDialog", () => ({
  default: (props: { pkg: { label: string } | null; onOpenChange: (open: boolean) => void }) => {
    cardDialogProps(props);
    return props.pkg ? (
      <div role="dialog" aria-label="card-dialog">
        Cartão: {props.pkg.label}
        <button type="button" onClick={() => props.onOpenChange(false)}>
          fechar cartão
        </button>
      </div>
    ) : null;
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    profile: { credit_balance: 9 },
  })),
}));

function renderPage() {
  return renderWithProviders(<CreditsPage />);
}

async function setPackages(data: typeof PACKAGES | undefined, isLoading = false) {
  const m = await import("@/hooks/useCredits");
  vi.mocked(m.usePackages).mockReturnValue({ data, isLoading } as never);
}

describe("CreditsPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const m = await import("@/hooks/useCredits");
    vi.mocked(m.useTransactionHistory).mockReturnValue({
      data: mockTransactions,
      isLoading: false,
    } as never);
    vi.mocked(m.useCreatePixPayment).mockReturnValue({
      mutateAsync: mockPixPayment,
      isPending: false,
    } as never);
    vi.mocked(m.usePurchaseStatus).mockReturnValue({ data: { status: "pending" } } as never);
    await setPackages(PACKAGES);
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

  it("renders a placeholder when the profile has not loaded", async () => {
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue({ profile: null } as never);
    renderPage();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the packages from the catalogue with their prices", () => {
    renderPage();
    expect(screen.getByText(/30 créditos/i)).toBeInTheDocument();
    expect(screen.getByText(/120 créditos/i)).toBeInTheDocument();
    expect(screen.getByText(/300 créditos/i)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*9[,.]90/i)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*29[,.]90/i)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*59[,.]90/i)).toBeInTheDocument();
    expect(screen.getByText("Popular")).toBeInTheDocument();
  });

  it("shows skeletons while the catalogue loads", async () => {
    await setPackages(undefined, true);
    renderPage();
    expect(screen.getByTestId("packages-loading")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cartão de crédito/i })).toBeNull();
  });

  it("explains when the catalogue is empty", async () => {
    await setPackages([]);
    renderPage();
    expect(screen.getByText(/nenhum pacote disponível/i)).toBeInTheDocument();
  });

  // RLS decides who sees the admin-only smoke package; the page just renders what it gets.
  it("renders the admin-only smoke package with its badge when the catalogue includes it", async () => {
    await setPackages([...PACKAGES, TEST_PACKAGE]);
    renderPage();
    expect(screen.getByText(/teste \(admin\)/i)).toBeInTheDocument();
    expect(screen.getByText(/^1 crédito$/i)).toBeInTheDocument();
    expect(screen.getByText("Só admins")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /cartão de crédito/i })).toHaveLength(4);
  });

  it("renders transaction history with labels and a raw fallback", () => {
    renderPage();
    expect(screen.getByText(/\+10/)).toBeInTheDocument();
    expect(screen.getByText(/-1/)).toBeInTheDocument();
    expect(screen.getByText(/adaptação/i)).toBeInTheDocument();
    expect(screen.getByText(/bônus/i)).toBeInTheDocument();
    expect(screen.getByText("mystery_type")).toBeInTheDocument();
  });

  it("shows the loading and empty states of the history", async () => {
    const m = await import("@/hooks/useCredits");
    vi.mocked(m.useTransactionHistory).mockReturnValue({ data: undefined, isLoading: true } as never);
    const { unmount } = renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
    unmount();

    vi.mocked(m.useTransactionHistory).mockReturnValue({ data: [], isLoading: false } as never);
    renderPage();
    expect(screen.getByText(/nenhuma movimentação/i)).toBeInTheDocument();
  });

  it("renders a credit-card and a Pix button for every package", () => {
    renderPage();
    expect(screen.getAllByRole("button", { name: /cartão de crédito/i })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^pix$/i })).toHaveLength(3);
  });

  it("opens the inline card dialog for the clicked package and closes it on request", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getAllByRole("button", { name: /cartão de crédito/i })[1]);

    const dialog = await screen.findByRole("dialog", { name: "card-dialog" });
    expect(dialog).toHaveTextContent("Cartão: Profissional");
    expect(cardDialogProps).toHaveBeenLastCalledWith(expect.objectContaining({ pkg: PACKAGES[1] }));

    await user.click(screen.getByRole("button", { name: /fechar cartão/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("sends the Pix click to the inline Pix payment with the package id", async () => {
    const user = userEvent.setup();
    renderPage();

    const pixButtons = screen.getAllByRole("button", { name: /^pix$/i });
    pixButtons.forEach((button) => expect(button).toBeEnabled());
    await user.click(pixButtons[1]);

    await waitFor(() => expect(mockPixPayment).toHaveBeenCalledWith({ packageId: "pkg-pro" }));
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

  it("disables both buttons while a Pix is being created", async () => {
    const m = await import("@/hooks/useCredits");
    vi.mocked(m.useCreatePixPayment).mockReturnValue({ mutateAsync: mockPixPayment, isPending: true } as never);
    renderPage();
    screen.getAllByRole("button", { name: /^pix$/i }).forEach((b) => expect(b).toBeDisabled());
    screen.getAllByRole("button", { name: /cartão de crédito/i }).forEach((b) => expect(b).toBeDisabled());
  });

  it("names Mercado Pago as the provider for both rails", () => {
    renderPage();
    expect(screen.getByText(/via Mercado Pago/i)).toBeInTheDocument();
    expect(screen.queryByText(/stripe/i)).toBeNull();
  });
});
