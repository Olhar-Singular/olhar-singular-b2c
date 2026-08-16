import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, createTestQueryClient, buildAuthState } from "@/test/helpers";
import PixPaymentDialog from "./PixPaymentDialog";

const mockRefreshProfile = vi.fn();

vi.mock("@/hooks/useCredits", () => ({
  usePixPurchaseStatus: vi.fn(() => ({ data: { status: "pending" } })),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const PAYMENT = {
  qrCode: "00020126580014br.gov.bcb.pix0136abc",
  qrCodeBase64: "iVBORw0KGgo=",
  purchaseId: "purchase-1",
  ticketUrl: "https://mp.test/ticket/1",
};

// jsdom exposes navigator.clipboard through a getter only, so it has to be
// redefined rather than assigned. userEvent.setup() installs its own stub, so
// this must run AFTER setup() in a test that asserts on the write.
function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

async function setStatus(status: string) {
  const m = await import("@/hooks/useCredits");
  vi.mocked(m.usePixPurchaseStatus).mockReturnValue({ data: { status } } as never);
}

function renderDialog(payment: typeof PAYMENT | null = PAYMENT, queryClient = createTestQueryClient()) {
  return renderWithProviders(
    <PixPaymentDialog payment={payment} onOpenChange={vi.fn()} />,
    { queryClient },
  );
}

describe("PixPaymentDialog", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const m = await import("@/hooks/useCredits");
    vi.mocked(m.usePixPurchaseStatus).mockReturnValue({ data: { status: "pending" } } as never);
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue(
      buildAuthState({ refreshProfile: mockRefreshProfile }) as never,
    );
    stubClipboard(vi.fn().mockResolvedValue(undefined));
  });

  it("stays closed while there is no Pix payment", () => {
    renderDialog(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the QR image inline, without leaving the app", () => {
    renderDialog();
    const img = screen.getByRole("img", { name: /qr code/i }) as HTMLImageElement;
    expect(img.src).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("shows the copy-and-paste code", () => {
    renderDialog();
    expect(screen.getByText(PAYMENT.qrCode)).toBeInTheDocument();
  });

  it("copies the code to the clipboard", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    const writeText = stubClipboard(vi.fn().mockResolvedValue(undefined));
    renderDialog();

    await user.click(screen.getByRole("button", { name: /copiar/i }));

    expect(writeText).toHaveBeenCalledWith(PAYMENT.qrCode);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("tells the user to copy by hand when the clipboard is blocked", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    renderDialog();

    await user.click(screen.getByRole("button", { name: /copiar/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("waits for the webhook while the payment is pending", () => {
    renderDialog();
    expect(screen.getByText(/aguardando pagamento/i)).toBeInTheDocument();
  });

  it("watches the purchase row created for this payment", async () => {
    const m = await import("@/hooks/useCredits");
    renderDialog();
    expect(m.usePixPurchaseStatus).toHaveBeenCalledWith("purchase-1");
  });

  it("stops watching once the dialog has no payment", async () => {
    const m = await import("@/hooks/useCredits");
    renderDialog(null);
    expect(m.usePixPurchaseStatus).toHaveBeenCalledWith(null);
  });

  it("announces the confirmation when the webhook approves the payment", async () => {
    await setStatus("approved");
    renderDialog();
    expect(screen.getByText(/pagamento confirmado/i)).toBeInTheDocument();
  });

  it("refreshes the balance and the history once the payment is approved", async () => {
    const qc = createTestQueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    await setStatus("approved");

    renderDialog(PAYMENT, qc);

    await waitFor(() => expect(mockRefreshProfile).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["credit_transactions"] });
  });

  it("refreshes the balance only once for the same approval", async () => {
    await setStatus("approved");
    const { rerender } = renderDialog();
    rerender(<PixPaymentDialog payment={PAYMENT} onOpenChange={vi.fn()} />);

    await waitFor(() => expect(mockRefreshProfile).toHaveBeenCalledTimes(1));
  });

  it("does not touch the balance while the payment is still pending", async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText(/aguardando pagamento/i)).toBeInTheDocument());
    expect(mockRefreshProfile).not.toHaveBeenCalled();
  });

  it("reports a Pix that will never be paid", async () => {
    await setStatus("rejected");
    renderDialog();
    expect(screen.getByText(/não foi concluído/i)).toBeInTheDocument();
    expect(mockRefreshProfile).not.toHaveBeenCalled();
  });

  // Nothing to credit for: a closed dialog has no purchase behind it.
  it("does not refresh the balance when there is no purchase to approve", async () => {
    await setStatus("approved");
    renderDialog(null);
    expect(mockRefreshProfile).not.toHaveBeenCalled();
  });

  it("keeps the code usable when MP sent no QR image", () => {
    renderDialog({ ...PAYMENT, qrCodeBase64: "" });
    expect(screen.queryByRole("img", { name: /qr code/i })).toBeNull();
    expect(screen.getByText(PAYMENT.qrCode)).toBeInTheDocument();
  });

  it("survives a purchase row that has not been read yet", async () => {
    const m = await import("@/hooks/useCredits");
    vi.mocked(m.usePixPurchaseStatus).mockReturnValue({ data: null } as never);
    renderDialog();
    expect(screen.getByText(/aguardando pagamento/i)).toBeInTheDocument();
  });
});
