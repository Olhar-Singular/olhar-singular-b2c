import { useEffect, useMemo } from "react";
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
}

// Thin wrapper over @mercadopago/sdk-react's Card Payment Brick: the card is
// tokenized inside the MP iframe (we never see the PAN, PCI SAQ-A), instalments
// are pinned to 1, and only the fields the backend accepts are forwarded.
export default function MpCardBrick({ amount, payerEmail, onSubmit, onError }: MpCardBrickProps) {
  const publicKey = readMpPublicKey();

  useEffect(() => {
    ensureMercadoPago(publicKey);
  }, [publicKey]);

  const initialization = useMemo(
    () => ({ amount, ...(payerEmail ? { payer: { email: payerEmail } } : {}) }),
    [amount, payerEmail],
  );

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
      customization={{ paymentMethods: { maxInstallments: 1 } }}
      onSubmit={async (formData) =>
        onSubmit({
          token: formData.token,
          payment_method_id: formData.payment_method_id,
          issuer_id: formData.issuer_id,
          installments: formData.installments,
          payer: formData.payer,
        })
      }
      onError={(error) => onError?.(error.message)}
    />
  );
}
