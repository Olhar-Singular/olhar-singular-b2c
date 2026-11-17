import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import CheckoutCta from "@/components/subscribe/CheckoutCta";
import { useAuth } from "@/hooks/useAuth";
import { useCreatePixPlan, usePixPlanStatus, type PixPlanCheckout } from "@/hooks/usePrepaid";
import { prepaidCreditsSplit, prepaidSummary, type PrepaidPlanView } from "@/lib/domain/prepaid";

type BuyerAccount = { fullName: string; email: string; termsVersion: string };

interface PixPlanPaymentProps {
  plan: PrepaidPlanView;
  /**
   * Anonymous buyer only (the account is born when the payment is confirmed, R4):
   * reads the account typed on the page, or null when it is incomplete (the page
   * then shows what is missing). Absent when logged in.
   */
  getAccount?: () => BuyerAccount | null;
  /** Number of this step on the page (the anonymous checkout has the account step above). */
  step?: number;
}

const ONCE_MOBILE = "Pagamento único. Sem renovação automática.";

// Step 2 of the Pix checkout: the QR comes back from pix-plan-checkout and is
// paid inside the page; access is released by the webhook, never by this
// screen (it only polls the public status, R5).
export default function PixPlanPayment({ plan, getAccount, step = 2 }: PixPlanPaymentProps) {
  const create = useCreatePixPlan();
  const { refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [checkout, setCheckout] = useState<PixPlanCheckout | null>(null);
  const [failure, setFailure] = useState<{ message: string; code: string | null } | null>(null);
  const status = usePixPlanStatus(checkout?.purchaseId ?? null, checkout?.expiresAt ?? null);
  const anonymous = !!getAccount;
  // The account the QR was generated for (the confirmation names its e-mail).
  const [buyer, setBuyer] = useState<BuyerAccount | null>(null);

  // A logged-in buyer's credits land on the server; catch up once per purchase.
  // ("approved" only ever comes for a purchase, so purchaseId is set then.)
  const purchaseId = checkout?.purchaseId ?? null;
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "approved" || anonymous || refreshedFor.current === purchaseId) return;
    refreshedFor.current = purchaseId;
    void refreshProfile();
    void queryClient.invalidateQueries({ queryKey: ["active_prepaid"] });
    void queryClient.invalidateQueries({ queryKey: ["credit_transactions"] });
  }, [status, anonymous, purchaseId, refreshProfile, queryClient]);

  async function generate() {
    const account = getAccount ? getAccount() : null;
    if (getAccount && !account) return;
    setFailure(null);
    setCheckout(null);
    setBuyer(account);
    try {
      setCheckout(await create.mutateAsync({ planSlug: plan.slug, ...(account ? { account } : {}) }));
    } catch (e) {
      setFailure({ message: (e as Error).message, code: (e as { code?: string | null }).code ?? null });
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(checkout!.qrCode);
      toast.success("Código Pix copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o código e copie manualmente.");
    }
  }

  const summary = prepaidSummary(plan);

  return (
    <section aria-labelledby="pix-heading" className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 id="pix-heading" className="font-semibold text-foreground">
        {step}. Pague com o app do seu banco
      </h2>

      {failure && (
        <p role="alert" className="text-sm text-destructive-strong">
          {failure.message}
          {failure.code === "email_exists" && (
            <>
              {" "}
              <Link to="/auth" className="font-medium underline">
                Entrar
              </Link>
            </>
          )}
        </p>
      )}

      {!checkout && (
        <CheckoutCta
          label="Gerar meu código Pix"
          payToday={summary.payToday}
          note={summary.once}
          mobileNote={ONCE_MOBILE}
          disabled={create.isPending}
          onClick={generate}
        />
      )}

      {checkout && status === "pending" && (
        <div className="space-y-4">
          <div className="flex justify-center">
            <img
              src={`data:image/png;base64,${checkout.qrCodeBase64}`}
              alt="QR code do Pix"
              className="h-52 w-52 rounded-lg border border-border bg-white p-2"
            />
          </div>
          <p className="text-center text-sm font-medium text-foreground">Escaneie o QR code no app do seu banco.</p>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Ou use o Pix copia e cola</p>
            <code className="block max-h-24 overflow-auto break-all rounded-md bg-muted p-3 text-[11px] leading-relaxed text-foreground">
              {checkout.qrCode}
            </code>
            <Button variant="outline" className="w-full gap-1.5" onClick={copyCode}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copiar
            </Button>
          </div>
          <p role="status" aria-live="polite" className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            Assim que o pagamento cair, seu acesso é liberado automaticamente. Normalmente leva alguns segundos.
          </p>
        </div>
      )}

      {checkout && status === "approved" && (
        <div className="space-y-3 rounded-lg border border-green-600/30 bg-green-50 p-4">
          <p role="status" aria-live="polite" className="flex items-start gap-2 text-sm font-medium text-green-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            {anonymous
              ? `Pagamento confirmado! Enviamos para ${buyer!.email} o link de acesso. Abra o e-mail para entrar e criar sua senha.`
              : `Pagamento confirmado! ${prepaidCreditsSplit(plan).now} créditos já estão na sua conta.`}
          </p>
          {anonymous ? (
            <Button asChild variant="outline">
              <Link to="/auth">Ir para a tela de entrada</Link>
            </Button>
          ) : (
            <Button asChild size="lg" className="gap-1.5 text-[1.1875rem] font-bold">
              <Link to="/adaptar">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Começar a adaptar
              </Link>
            </Button>
          )}
        </div>
      )}

      {checkout && (status === "expired" || status === "failed") && (
        <div className="space-y-3">
          <p role="status" aria-live="polite" className="flex items-start gap-2 text-sm text-destructive-strong">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            O Pix expirou ou não foi concluído. Gere um novo código para tentar de novo.
          </p>
          <Button variant="outline" onClick={generate} disabled={create.isPending}>
            Gerar novo código
          </Button>
        </div>
      )}
    </section>
  );
}
