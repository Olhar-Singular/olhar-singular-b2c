import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { CardPayment } from "@mercadopago/sdk-react";
import { ensureMercadoPago, readMpPublicKey } from "@/lib/payments/mpInit";
import type { CardFormDataView } from "@/hooks/useCredits";

export interface MpCardBrickProps {
  /** Amount in reais; the server re-derives it from the package, this is display + tokenization. */
  amount: number;
  /** Pre-fills (and hides) the Brick's e-mail field. */
  payerEmail?: string;
  /** Receives the tokenized card. Resolve when the backend answered; reject to let the Brick re-enable. */
  onSubmit: (card: CardFormDataView) => Promise<void>;
  onError?: (message: string) => void;
  /** Text of the Brick's submit button; MP's default ("Pagar") when omitted. */
  submitLabel?: string;
  /** Hides the Brick's own button: the page submits through the ref's submit(). */
  hideSubmit?: boolean;
}

export interface MpCardBrickHandle {
  /**
   * Reads the form through the Brick controller and hands the card to onSubmit.
   * True once onSubmit resolved; false when the form is invalid (the Brick shows
   * the field errors), the Brick is not mounted yet, or onSubmit rejected.
   */
  submit(): Promise<boolean>;
}

type BrickFormData = { token: string; payment_method_id: string; issuer_id?: string; installments?: number; payer?: CardFormDataView["payer"] };

// @mercadopago/sdk-react 1.0.7 stores the Brick controller on window but does
// not type getFormData (customization.visual.hidePaymentButton, MP docs).
type BrickWindow = Window & { cardPaymentBrickController?: { getFormData(): Promise<BrickFormData | null | undefined> } };

// Instalments pinned to 1; 16px text because iOS zooms into smaller inputs.
// Module-level so their identity never changes.
const BASE_STYLE = { customVariables: { fontSizeMedium: "16px" } };
const BASE_CUSTOMIZATION = { paymentMethods: { maxInstallments: 1 } };

function toCard(formData: BrickFormData): CardFormDataView {
  return {
    token: formData.token,
    payment_method_id: formData.payment_method_id,
    issuer_id: formData.issuer_id,
    installments: formData.installments,
    payer: formData.payer,
  };
}

// Thin wrapper over @mercadopago/sdk-react's Card Payment Brick: the card is
// tokenized inside the MP iframe (we never see the PAN, PCI SAQ-A), instalments
// are pinned to 1, and only the fields the backend accepts are forwarded.
//
// The SDK's <CardPayment> unmounts and re-creates the Brick whenever ANY prop
// changes identity (its effect depends on initialization, customization and
// every callback). A parent re-render with fresh arrow functions therefore
// wiped the form the user was typing in. Everything handed to it here is
// stable: the callbacks read the latest props through refs.
const MpCardBrick = forwardRef<MpCardBrickHandle, MpCardBrickProps>(function MpCardBrick(
  { amount, payerEmail, onSubmit, onError, submitLabel, hideSubmit },
  ref,
) {
  const publicKey = readMpPublicKey();

  useEffect(() => {
    ensureMercadoPago(publicKey);
  }, [publicKey]);

  const initialization = useMemo(
    () => ({ amount, ...(payerEmail ? { payer: { email: payerEmail } } : {}) }),
    [amount, payerEmail],
  );

  // Stable per label/flag: a new object would re-create the Brick (see the note above).
  const customization = useMemo(
    () => ({
      ...BASE_CUSTOMIZATION,
      visual: {
        style: BASE_STYLE,
        ...(submitLabel ? { texts: { formSubmit: submitLabel } } : {}),
        ...(hideSubmit ? { hidePaymentButton: true } : {}),
      },
    }),
    [submitLabel, hideSubmit],
  );

  const onSubmitRef = useRef(onSubmit);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
    onErrorRef.current = onError;
  });

  const handleSubmit = useCallback((formData: BrickFormData) => onSubmitRef.current(toCard(formData)), []);

  useImperativeHandle(
    ref,
    () => ({
      async submit() {
        const controller = (window as BrickWindow).cardPaymentBrickController;
        if (!controller) return false;
        let formData: BrickFormData | null | undefined;
        try {
          formData = await controller.getFormData();
        } catch {
          // Invalid or incomplete fields: the Brick already marks them.
          return false;
        }
        if (!formData) return false;
        try {
          await onSubmitRef.current(toCard(formData));
          return true;
        } catch {
          // A refusal onSubmit already reported (toast or inline stage).
          return false;
        }
      },
    }),
    [],
  );
  const handleError = useCallback((error: { message: string }) => onErrorRef.current?.(error.message), []);

  if (!publicKey) {
    // Misconfiguration must be visible on the checkout, never a broken build.
    return (
      <p role="alert" className="text-sm text-destructive-strong">
        Pagamento com cartão indisponível no momento. Tente pagar com Pix.
      </p>
    );
  }

  return (
    <CardPayment
      // Remount when the amount or payer changes: initialization is read once by the Brick.
      key={`${amount}-${payerEmail ?? ""}`}
      locale="pt-BR"
      initialization={initialization}
      customization={customization}
      onSubmit={handleSubmit}
      onError={handleError}
    />
  );
});

export default MpCardBrick;
