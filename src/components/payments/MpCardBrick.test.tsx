import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// vi.mock is hoisted above every import, so the fakes it closes over must be
// hoisted too.
const { initMercadoPago, cardPaymentProps } = vi.hoisted(() => ({
  initMercadoPago: vi.fn(),
  cardPaymentProps: vi.fn(),
}));

// The Brick renders an MP iframe that jsdom cannot host; the fake records its
// props and exposes a button that fires onSubmit with a canned formData, plus
// one that fires onError, so the wrapper's mapping is what gets tested.
vi.mock("@mercadopago/sdk-react", () => ({
  initMercadoPago,
  CardPayment: (props: {
    onSubmit: (formData: Record<string, unknown>) => Promise<void>;
    onError?: (error: { message: string }) => void;
  }) => {
    cardPaymentProps(props);
    return (
      <div data-testid="card-brick">
        <button
          type="button"
          onClick={() =>
            props.onSubmit({
              token: "tok_1",
              issuer_id: "24",
              payment_method_id: "master",
              transaction_amount: 29.9,
              installments: 1,
              payer: { email: "buyer@test.com", identification: { type: "CPF", number: "12345678909" } },
              payment_method_option_id: null,
              processing_mode: null,
            })
          }
        >
          Pagar
        </button>
        <button type="button" onClick={() => props.onError?.({ message: "brick quebrou" })}>
          Erro
        </button>
      </div>
    );
  },
}));

import MpCardBrick from "./MpCardBrick";
import { resetMpInit } from "@/lib/payments/mpInit";

describe("MpCardBrick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMpInit();
    vi.stubEnv("VITE_MP_PUBLIC_KEY", "APP_USR-public");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("initializes the SDK once with the public key and pt-BR", () => {
    const { rerender } = render(<MpCardBrick amount={29.9} onSubmit={vi.fn()} />);
    rerender(<MpCardBrick amount={29.9} onSubmit={vi.fn()} />);
    expect(initMercadoPago).toHaveBeenCalledTimes(1);
    expect(initMercadoPago).toHaveBeenCalledWith("APP_USR-public", { locale: "pt-BR" });
  });

  it("pins instalments to 1 and passes the amount and payer e-mail to the Brick", () => {
    render(<MpCardBrick amount={29.9} payerEmail="buyer@test.com" onSubmit={vi.fn()} />);
    const props = cardPaymentProps.mock.calls[0][0];
    expect(props.customization).toEqual({ paymentMethods: { maxInstallments: 1 } });
    expect(props.initialization).toEqual({ amount: 29.9, payer: { email: "buyer@test.com" } });
    expect(props.locale).toBe("pt-BR");
  });

  it("omits the payer block when no e-mail is known", () => {
    render(<MpCardBrick amount={9.9} onSubmit={vi.fn()} />);
    expect(cardPaymentProps.mock.calls[0][0].initialization).toEqual({ amount: 9.9 });
  });

  it("forwards only the fields the backend accepts from the Brick formData", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MpCardBrick amount={29.9} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Pagar" }));

    expect(onSubmit).toHaveBeenCalledWith({
      token: "tok_1",
      payment_method_id: "master",
      issuer_id: "24",
      installments: 1,
      payer: { email: "buyer@test.com", identification: { type: "CPF", number: "12345678909" } },
    });
  });

  it("surfaces Brick errors as a plain message", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    render(<MpCardBrick amount={29.9} onSubmit={vi.fn()} onError={onError} />);

    await user.click(screen.getByRole("button", { name: "Erro" }));
    expect(onError).toHaveBeenCalledWith("brick quebrou");
  });

  it("tolerates a Brick error without an onError handler", async () => {
    const user = userEvent.setup();
    render(<MpCardBrick amount={29.9} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Erro" }));
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
  });

  it("treats an undefined public key like a missing one", () => {
    vi.stubEnv("VITE_MP_PUBLIC_KEY", undefined as unknown as string);
    render(<MpCardBrick amount={29.9} onSubmit={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(initMercadoPago).not.toHaveBeenCalled();
  });

  it("shows a visible alert instead of the Brick when the public key is missing", () => {
    vi.stubEnv("VITE_MP_PUBLIC_KEY", "");
    render(<MpCardBrick amount={29.9} onSubmit={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/indisponível/i);
    expect(screen.queryByTestId("card-brick")).toBeNull();
    expect(initMercadoPago).not.toHaveBeenCalled();
  });
});
