import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, createTestQueryClient, buildAuthState } from "@/test/helpers";
import CardPaymentDialog from "./CardPaymentDialog";

const { mockPay, brickProps } = vi.hoisted(() => ({ mockPay: vi.fn(), brickProps: vi.fn() }));
const mockRefreshProfile = vi.fn();

const CARD = { token: "tok_1", payment_method_id: "master", payer: { email: "buyer@test.com" } };

// The Brick is an MP iframe; the fake exposes the wrapper's contract only.
vi.mock("@/components/payments/MpCardBrick", () => ({
  default: (props: { amount: number; payerEmail?: string; onSubmit: (c: unknown) => Promise<void>; onError?: (m: string) => void }) => {
    brickProps(props);
    return (
      <div data-testid="card-brick">
        <button type="button" onClick={() => props.onSubmit(CARD).catch(() => undefined)}>
          Pagar
        </button>
        <button type="button" onClick={() => props.onError?.("brick quebrou")}>
          Erro do Brick
        </button>
      </div>
    );
  },
}));

vi.mock("@/hooks/useCredits", () => ({
  useCreateCardPayment: vi.fn(() => ({ mutateAsync: mockPay, isPending: false })),
  usePurchaseStatus: vi.fn(() => ({ data: undefined })),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const PKG = { id: "pkg-pro", credits: 120, amountBrl: 29.9, label: "Profissional", highlight: true, adminOnly: false };

async function setPolled(status: string | undefined) {
  const m = await import("@/hooks/useCredits");
  vi.mocked(m.usePurchaseStatus).mockReturnValue({ data: status ? { status } : undefined } as never);
}

function renderDialog(pkg: typeof PKG | null = PKG, queryClient = createTestQueryClient()) {
  const onOpenChange = vi.fn();
  const utils = renderWithProviders(<CardPaymentDialog pkg={pkg} onOpenChange={onOpenChange} />, { queryClient });
  return { ...utils, onOpenChange, queryClient };
}

describe("CardPaymentDialog", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setPolled(undefined);
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue(
      buildAuthState({ refreshProfile: mockRefreshProfile, user: { id: "u1", email: "buyer@test.com" } }) as never,
    );
  });

  it("stays closed while there is no package", () => {
    renderDialog(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("describes the package and mounts the Brick with the amount and the account e-mail", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/120 créditos por R\$\s*29,90, em 1x/i)).toBeInTheDocument();
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
    expect(brickProps.mock.calls[0][0]).toMatchObject({ amount: 29.9, payerEmail: "buyer@test.com" });
  });

  it("sends the tokenized card with the package id and celebrates an approval", async () => {
    const user = userEvent.setup();
    mockPay.mockResolvedValue({ status: "approved", purchaseId: "p1", creditsGranted: 120 });
    const { queryClient } = renderDialog();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(screen.getByRole("button", { name: "Pagar" }));

    expect(mockPay).toHaveBeenCalledWith({ packageId: "pkg-pro", card: CARD });
    expect(await screen.findByRole("status")).toHaveTextContent(/aprovado/i);
    expect(screen.queryByTestId("card-brick")).toBeNull();
    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["credit_transactions"] });
  });

  it("shows MP's reason on a declined card and offers a fresh Brick to retry", async () => {
    const user = userEvent.setup();
    mockPay.mockResolvedValue({
      status: "rejected",
      purchaseId: "p1",
      statusDetail: "cc_rejected_insufficient_amount",
      message: "O cartão não tem limite ou saldo suficiente para esta compra.",
    });
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Pagar" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/não tem limite/i);
    expect(mockRefreshProfile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /tentar com outro cartão/i }));
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
    // A new Brick instance: the previous single-use token is gone.
    expect(brickProps.mock.calls.length).toBeGreaterThan(1);
  });

  it("falls back to a generic message when the rejection carries none", async () => {
    const user = userEvent.setup();
    mockPay.mockResolvedValue({ status: "rejected", purchaseId: "p1" });
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Pagar" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/não foi aprovado/i);
  });

  it("polls a pending purchase and settles once the webhook approves it", async () => {
    const user = userEvent.setup();
    mockPay.mockResolvedValue({ status: "pending", purchaseId: "p9" });
    const { rerender, onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Pagar" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/em análise/i);

    const m = await import("@/hooks/useCredits");
    expect(m.usePurchaseStatus).toHaveBeenLastCalledWith("p9");

    await setPolled("approved");
    rerender(<CardPaymentDialog pkg={PKG} onOpenChange={onOpenChange} />);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/aprovado/i));
    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
  });

  it("turns a pending purchase the webhook rejected into the retry state", async () => {
    const user = userEvent.setup();
    mockPay.mockResolvedValue({ status: "pending", purchaseId: "p9" });
    const { rerender, onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Pagar" }));
    await screen.findByRole("status");

    await setPolled("rejected");
    rerender(<CardPaymentDialog pkg={PKG} onOpenChange={onOpenChange} />);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/não foi aprovado/i));
    expect(screen.getByRole("button", { name: /tentar com outro cartão/i })).toBeInTheDocument();
  });

  it("keeps waiting while the polled status is still pending", async () => {
    const user = userEvent.setup();
    mockPay.mockResolvedValue({ status: "pending", purchaseId: "p9" });
    const { rerender, onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Pagar" }));
    await setPolled("pending");
    rerender(<CardPaymentDialog pkg={PKG} onOpenChange={onOpenChange} />);

    expect(screen.getByRole("status")).toHaveTextContent(/em análise/i);
    expect(mockRefreshProfile).not.toHaveBeenCalled();
  });

  it("shows a Brick error above the form without leaving it", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Erro do Brick" }));

    expect(screen.getByRole("alert")).toHaveTextContent("brick quebrou");
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
  });

  it("stays on the form when the request itself fails (the hook already toasts)", async () => {
    const user = userEvent.setup();
    mockPay.mockRejectedValue(new Error("Sem conexão"));
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Pagar" }));

    await waitFor(() => expect(mockPay).toHaveBeenCalled());
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
    expect(mockRefreshProfile).not.toHaveBeenCalled();
  });

  it("starts over on the form when it is closed and reopened", async () => {
    const user = userEvent.setup();
    mockPay.mockResolvedValue({ status: "approved", purchaseId: "p1" });
    const { rerender, onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Pagar" }));
    await screen.findByRole("status");

    rerender(<CardPaymentDialog pkg={null} onOpenChange={onOpenChange} />);
    rerender(<CardPaymentDialog pkg={PKG} onOpenChange={onOpenChange} />);

    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reports close gestures to the parent", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
