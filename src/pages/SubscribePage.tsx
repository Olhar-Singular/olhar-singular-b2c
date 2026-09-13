import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, Mail, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MpCardBrick from "@/components/payments/MpCardBrick";
import AccountStep, { type AccountDraft } from "@/components/subscribe/AccountStep";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccess } from "@/hooks/useAccess";
import type { CardFormDataView } from "@/hooks/useCredits";
import { isLiveSubscription, usePlans, useSubscribe, useSubscription, type PlanView } from "@/hooks/useSubscription";
import { formatBrl, pickInitialPlan, replacementNotice, TERMS_VERSION } from "@/lib/domain/subscriptionUi";
import { trackAddPaymentInfo, trackBeginCheckout, trackSubscriptionStarted } from "@/lib/analytics/events";
import { readAttribution, sessionStore } from "@/lib/analytics/attribution";

type Stage =
  | { kind: "form"; error?: string }
  | { kind: "authorized"; plan: PlanView }
  | { kind: "pending" }
  | { kind: "rejected"; message: string }
  /** Anonymous funnel: the account exists but the card was refused; login goes by e-mail. */
  | { kind: "rejected_new_account"; message: string; email: string; mailSent: boolean };

const GENERIC_REJECTION = "O cartão não foi aceito para a assinatura. Tente outro cartão.";

// Choose a plan, tokenize the card in the Brick, and let the subscribe function
// activate it on the spot. Logged in: only the card. Anonymous (pay first):
// name + e-mail + terms, the account is born from the payment, the session
// arrives as a one-shot magic-link token and the user lands on /definir-senha.
export default function SubscribePage() {
  const { user, session } = useAuth();
  const access = useAccess();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: plans = [], isLoading: loadingPlans } = usePlans();
  const { data: subscription } = useSubscription();
  const subscribe = useSubscribe();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const anonymous = !session;
  const [account, setAccount] = useState<AccountDraft | null>(null);
  // Kept when the buyer goes back to fix a typo, so the form is not empty again.
  const [draft, setDraft] = useState<AccountDraft | null>(null);
  // Forces a fresh Brick after a rejection: the previous token was single-use.
  const [attempt, setAttempt] = useState(0);

  const requested = params.get("plano");
  const selected = useMemo(
    () => plans.find((p) => p.slug === selectedSlug) ?? pickInitialPlan(plans, requested),
    [plans, selectedSlug, requested],
  );

  // Once the catalogue arrives, pin the initial choice so the Brick's amount
  // does not flip under the user.
  useEffect(() => {
    if (!selectedSlug && selected) setSelectedSlug(selected.slug);
  }, [selected, selectedSlug]);

  const notice = replacementNotice(access);
  const payerEmail = anonymous ? account?.email : user?.email ?? undefined;
  const brickVisible = stage.kind === "form" && (!anonymous || !!account) && !!selected;

  // begin_checkout when the card form is actually on screen for a plan.
  useEffect(() => {
    if (brickVisible && selected) trackBeginCheckout(selected);
  }, [brickVisible, selected]);

  // The session token is consumed right here and never stored: verifyOtp turns
  // it into a real session, then the first-access password screen takes over.
  async function openSession(tokenHash: string): Promise<boolean> {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (error) {
      console.error("SubscribePage: verifyOtp failed", error.message);
      return false;
    }
    return true;
  }

  // A rejected promise hands the failure back to the Brick, which re-enables
  // its button (business refusals were already toasted by the hook).
  async function handleSubmit(plan: PlanView, card: CardFormDataView) {
    trackAddPaymentInfo(plan);
    const attribution = readAttribution(sessionStore());
    const result = await subscribe.mutateAsync({
      planSlug: plan.slug,
      card,
      ...(anonymous && account ? { account: { ...account, termsVersion: TERMS_VERSION } } : {}),
      ...(attribution ? { attribution } : {}),
    });
    if (result.status !== "rejected") trackSubscriptionStarted(plan, result.subscriptionId, result.status);

    if (result.status === "rejected") {
      const message = result.message ?? GENERIC_REJECTION;
      if (result.accountCreated && account) {
        // Decision 14: the account stays; decision from the review: no session
        // without a payment, so the login link goes by e-mail (proof of ownership).
        const { error } = await supabase.auth.signInWithOtp({ email: account.email });
        setStage({ kind: "rejected_new_account", message, email: account.email, mailSent: !error });
      } else {
        setStage({ kind: "rejected", message });
      }
      return;
    }

    if (result.sessionTokenHash && (await openSession(result.sessionTokenHash))) {
      navigate("/definir-senha", { replace: true });
      return;
    }
    if (result.accountCreated) {
      // Paid, account created, but no session could be opened: log in by
      // e-mail. accountCreated only happens in the anonymous flow, so the
      // account block is always present here.
      const email = account!.email;
      const { error } = await supabase.auth.signInWithOtp({ email });
      setStage({
        kind: "rejected_new_account",
        message: "Pagamento aceito! Não conseguimos abrir sua sessão automaticamente.",
        email,
        mailSent: !error,
      });
      return;
    }

    if (result.status === "authorized") setStage({ kind: "authorized", plan });
    else setStage({ kind: "pending" });
  }

  function retry() {
    setAttempt((n) => n + 1);
    setStage({ kind: "form" });
  }

  if (access?.unlimited) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Assinar um plano</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta tem cortesia: você já usa a plataforma sem débito de créditos, então não há o que assinar.
        </p>
        <Link to="/creditos">
          <Button variant="outline">Ver créditos</Button>
        </Link>
      </div>
    );
  }

  if (!anonymous && isLiveSubscription(subscription) && stage.kind === "form") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Assinar um plano</h1>
        <p className="text-sm text-muted-foreground">
          Você já tem uma assinatura ativa. Para mudar de plano, cancele a atual e assine de novo; para trocar o cartão, use a página de créditos.
        </p>
        <Link to="/creditos">
          <Button variant="outline">Ver minha assinatura</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Assinar um plano</h1>
        <p className="text-sm text-muted-foreground">
          Créditos novos todo mês, cobrados no cartão em 1x. Cancele quando quiser.
        </p>
      </header>

      {stage.kind === "authorized" && (
        <Card className="border-green-600/30 bg-green-50">
          <CardContent className="p-6 space-y-3">
            <p role="status" aria-live="polite" className="flex items-center gap-2 font-medium text-green-700">
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
              Assinatura ativa! {stage.plan.monthlyCredits} créditos já estão na sua conta.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/adaptar">
                <Button className="gap-1.5">
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  Começar a adaptar
                </Button>
              </Link>
              <Link to="/creditos">
                <Button variant="outline">Ver minha assinatura</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {stage.kind === "pending" && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Assinatura em análise. Seus créditos entram assim que o cartão for confirmado.
            </p>
            <Link to="/creditos">
              <Button variant="outline">Ver créditos</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {stage.kind === "rejected" && (
        <Card className="border-destructive/30">
          <CardContent className="p-6 space-y-3">
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              {stage.message}
            </p>
            <Button variant="outline" onClick={retry}>
              Tentar com outro cartão
            </Button>
          </CardContent>
        </Card>
      )}

      {stage.kind === "rejected_new_account" && (
        <Card className="border-border">
          <CardContent className="p-6 space-y-3">
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              {stage.message}
            </p>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Mail className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Sua conta foi criada com o e-mail <strong className="text-foreground">{stage.email}</strong>.{" "}
                {stage.mailSent
                  ? "Enviamos um link de acesso para ele: entre por lá e tente outro cartão em Créditos."
                  : 'Não conseguimos enviar o link de acesso agora. Use "Esqueci minha senha" na tela de entrada para entrar e tentar outro cartão.'}
              </span>
            </p>
            <Link to="/auth">
              <Button variant="outline">Ir para a tela de entrada</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {stage.kind === "form" && anonymous && !account && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quem vai usar a plataforma</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountStep
              initial={draft ?? undefined}
              onConfirm={(confirmed) => {
                setDraft(confirmed);
                setAccount(confirmed);
              }}
            />
          </CardContent>
        </Card>
      )}

      {stage.kind === "form" && anonymous && account && (
        <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2">
          <span>
            Conta para <strong className="text-foreground">{account.fullName}</strong> ({account.email}).
          </span>
          <button type="button" className="underline" onClick={() => setAccount(null)}>
            Corrigir
          </button>
        </p>
      )}

      {stage.kind === "form" && (!anonymous || account) && (
        <>
          <section className="space-y-4" aria-labelledby="plans-heading">
            <h2 id="plans-heading" className="font-semibold text-foreground">Escolha o plano</h2>

            {loadingPlans && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="plans-loading">
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
              </div>
            )}

            {!loadingPlans && plans.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum plano disponível no momento.</p>
            )}

            {plans.length > 0 && (
              <div role="radiogroup" aria-label="Planos" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {plans.map((plan) => {
                  const active = selected?.id === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelectedSlug(plan.slug)}
                      className={`text-left rounded-xl border p-5 transition-shadow hover:shadow-card-hover ${
                        active ? "border-primary ring-2 ring-primary/30 shadow-glow" : plan.adminOnly ? "border-dashed border-border" : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold">{plan.name}</span>
                        {plan.highlight && <Badge className="text-xs">Popular</Badge>}
                        {plan.adminOnly && (
                          <Badge variant="outline" className="text-xs">
                            Só admins
                          </Badge>
                        )}
                      </div>
                      <p className="text-2xl font-bold tabular-nums">{formatBrl(plan.priceBrl)}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                      <p className="text-sm text-muted-foreground">{plan.monthlyCredits} créditos por mês</p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {selected && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Pagar {formatBrl(selected.priceBrl)} por mês no cartão
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {notice && (
                  <p role="note" className="text-sm rounded-md bg-amber-50 text-amber-900 px-3 py-2">
                    {notice}
                  </p>
                )}
                {stage.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {stage.error}
                  </p>
                )}
                <MpCardBrick
                  key={`${selected.id}-${attempt}-${payerEmail ?? ""}`}
                  amount={selected.priceBrl}
                  payerEmail={payerEmail}
                  onSubmit={(card) => handleSubmit(selected, card)}
                  onError={(message) => setStage({ kind: "form", error: message })}
                />
                <p className="text-xs text-muted-foreground">
                  A primeira cobrança é feita agora e as próximas todo mês na mesma data. Os créditos do plano zeram a cada renovação; os extras não expiram.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
