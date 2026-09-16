import { useCallback, useEffect, useMemo, useRef } from "react";
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
}

// Instalments pinned to 1. Module-level so its identity never changes.
const BASE_CUSTOMIZATION = { paymentMethods: { maxInstallments: 1 } };

// Thin wrapper over @mercadopago/sdk-react's Card Payment Brick: the card is
// tokenized inside the MP iframe (we never see the PAN, PCI SAQ-A), instalments
// are pinned to 1, and only the fields the backend accepts are forwarded.
//
// The SDK's <CardPayment> unmounts and re-creates the Brick whenever ANY prop
// changes identity (its effect depends on initialization, customization and
// every callback). A parent re-render with fresh arrow functions therefore
// wiped the form the user was typing in. Everything handed to it here is
// stable: the callbacks read the latest props through refs.
export default function MpCardBrick({ amount, payerEmail, onSubmit, onError, submitLabel }: MpCardBrickProps) {
  const publicKey = readMpPublicKey();

  useEffect(() => {
    ensureMercadoPago(publicKey);
  }, [publicKey]);

  const initialization = useMemo(
    () => ({ amount, ...(payerEmail ? { payer: { email: payerEmail } } : {}) }),
    [amount, payerEmail],
  );

  // Stable per label: a new object would re-create the Brick (see the note above).
  const customization = useMemo(
    () => (submitLabel ? { ...BASE_CUSTOMIZATION, visual: { texts: { formSubmit: submitLabel } } } : BASE_CUSTOMIZATION),
    [submitLabel],
  );

  const onSubmitRef = useRef(onSubmit);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
    onErrorRef.current = onError;
  });

  const handleSubmit = useCallback(
    (formData: { token: string; payment_method_id: string; issuer_id?: string; installments?: number; payer?: CardFormDataView["payer"] }) =>
      onSubmitRef.current({
        token: formData.token,
        payment_method_id: formData.payment_method_id,
        issuer_id: formData.issuer_id,
        installments: formData.installments,
        payer: formData.payer,
      }),
    [],
  );
  const handleError = useCallback((error: { message: string }) => onErrorRef.current?.(error.message), []);

  if (!publicKey) {
    // Misconfiguration must be visible on the checkout, never a broken build.
    return (
      <p role="alert" className="text-sm text-destructive">
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
}
