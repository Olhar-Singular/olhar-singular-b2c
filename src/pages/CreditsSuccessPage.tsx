import { useSearchParams } from "react-router-dom";

// Landing page after a Stripe Checkout redirect. Card payments are already
// settled when the user gets here; Pix is a delayed-notification method, so the
// redirect can beat the async webhook that actually grants the credits — the
// copy must not promise a balance that has not moved yet.
export default function CreditsSuccessPage() {
  const [searchParams] = useSearchParams();
  const isPix = searchParams.get("metodo") === "pix";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <p className="text-lg font-semibold text-foreground">
        {isPix ? "Pagamento recebido!" : "Pagamento confirmado!"}
      </p>
      <p className="text-muted-foreground text-sm">
        {isPix
          ? "Assim que o Pix for compensado, seus créditos entram no saldo."
          : "Seus créditos foram adicionados à sua conta."}
      </p>
    </div>
  );
}
