import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { parseIsoOrNull } from "@/lib/domain/access";
import { isLiveSubscription, subscribeErrorCode, usePlans, useSubscribe, useSubscription, type PlanView, type SubscribeResult } from "@/hooks/useSubscription";
import { canSubscribe, cheapestPublicPlan, formatBrl, formatDate, pickInitialPlan, replacementNotice, TERMS_VERSION, TRIAL_CREDITS, TRIAL_DAYS, trialFirstChargeDate } from "@/lib/domain/subscriptionUi";
import { trackAddPaymentInfo, trackBeginCheckout, trackSubscriptionStarted, trackTrialStarted } from "@/lib/analytics/events";
import { readAttribution, sessionStore } from "@/lib/analytics/attribution";

type Stage =
  | { kind: "form"; error?: string }
  | { kind: "authorized"; plan: PlanView }
  | { kind: "pending" }
  | { kind: "rejected"; message: string }
  /** Anonymous funnel: the account exists; the buyer enters through the e-mail link. */
  | { kind: "new_account"; tone: "success" | "pending" | "rejected"; message: string; email: string; mailSent: boolean }
  /** The CPF already had a trial: same card, paid plan, one click (no new token: MP was never called). */
  | { kind: "trial_used"; plan: PlanView; card: CardFormDataView; message: string };

const GENERIC_REJECTION = "O cartão não foi aceito para a assinatura. Tente outro cartão.";

// Choose a plan, tokenize the card in the Brick, and let the subscribe function
// activate it on the spot. Logged in: only the card. Anonymous (pay first):
// name + e-mail + terms, the account is born from the payment and the buyer
// enters through the login link sent to that e-mail (proof of ownership), then
// lands on /definir-senha.
export default function SubscribePage() {
  const { user, session, profile } = useAuth();
  const access = useAccess();
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
  // ?trial=1 is the landing's trial CTA: anonymous only (a logged-in user
  // subscribes paid); the plan is the cheapest public one, decided again by the
  // server, and the selector is hidden.
  const trialMode = anonymous && params.get("trial") === "1";
  const selected = useMemo(
    () => (trialMode ? cheapestPublicPlan(plans) : plans.find((p) => p.slug === selectedSlug) ?? pickInitialPlan(plans, requested)),
    [plans, selectedSlug, requested, trialMode],
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

  // A new account never gets a session from the checkout: the login link goes
  // to the e-mail (proof of ownership) and lands on the first-access password
  // screen. Whatever the card said, the copy differs, the mechanics do not.
  async function sendLoginLink(email: string): Promise<boolean> {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/definir-senha`, shouldCreateUser: false },
    });
    if (error) console.error("SubscribePage: signInWithOtp failed", error.message);
    return !error;
  }

  // A rejected promise hands the failure back to the Brick, which re-enables
  // its button (business refusals were already toasted by the hook), except
  // trial_used, which this page answers inline.
  async function handleSubmit(plan: PlanView, card: CardFormDataView, trial: boolean, { resubmit = false }: { resubmit?: boolean } = {}) {
    // trial_used resubmits the same card for the paid plan (no new Brick
    // submission), so the add_payment_info of the first attempt already covers it.
    if (!resubmit) trackAddPaymentInfo(plan);
    const attribution = readAttribution(sessionStore());
    let result: SubscribeResult;
    try {
      result = await subscribe.mutateAsync({
        planSlug: plan.slug,
        card,
        ...(trial ? { trial: true } : {}),
        ...(anonymous && account ? { account: { ...account, termsVersion: TERMS_VERSION } } : {}),
        ...(attribution ? { attribution: attribution as Record<string, unknown> } : {}),
      });
    } catch (e) {
      if (trial && subscribeErrorCode(e) === "trial_used") {
        setStage({ kind: "trial_used", plan, card, message: (e as Error).message });
        return;
      }
      throw e;
    }
    if (result.status !== "rejected") {
      if (trial) trackTrialStarted(plan, result.subscriptionId, result.status);
      else trackSubscriptionStarted(plan, result.subscriptionId, result.status);
    }
    const firstCharge = parseIsoOrNull(result.trialEndsAt);

    if (result.accountCreated) {
      // accountCreated only happens in the anonymous flow, so the account
      // block is always present here (decision 14: the account stays even
      // when the card was refused).
      const email = account!.email;
      const mailSent = await sendLoginLink(email);
      const tone = result.status === "authorized" ? "success" : result.status === "pending" ? "pending" : "rejected";
      const message =
        tone === "success"
          ? trial
            ? `Teste ativado! ${TRIAL_CREDITS} créditos já estão na sua conta. A primeira cobrança de ${formatBrl(plan.priceBrl)} será em ${firstCharge ? formatDate(firstCharge) : `${TRIAL_DAYS} dias`}.`
            : `Assinatura ativa! ${plan.monthlyCredits} créditos já estão na sua conta.`
          : tone === "pending"
            ? trial
              ? "Teste em análise. Seus créditos entram assim que o cartão for confirmado."
              : "Assinatura em análise. Seus créditos entram assim que o cartão for confirmado."
            : (result.message ?? GENERIC_REJECTION);
      setStage({ kind: "new_account", tone, message, email, mailSent });
      return;
    }

    if (result.status === "rejected") {
      setStage({ kind: "rejected", message: result.message ?? GENERIC_REJECTION });
      return;
    }

    if (result.status === "authorized") setStage({ kind: "authorized", plan });
    else setStage({ kind: "pending" });
  }

  function retry() {
    setAttempt((n) => n + 1);
    setStage({ kind: "form" });
  }

  if (access && !canSubscribe(access, profile?.is_super_admin)) {
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
        <h1 className="text-2xl font-bold text-foreground">{trialMode ? `Teste grátis por ${TRIAL_DAYS} dias` : "Assinar um plano"}</h1>
        <p className="text-sm text-muted-foreground">
          {trialMode
            ? `Cartão obrigatório, nada é cobrado hoje. Em ${TRIAL_DAYS} dias começa o plano${selected ? ` ${selected.name} (${formatBrl(selected.priceBrl)}/mês)` : ""}. Cancele antes e não paga nada.`
            : "Créditos novos todo mês, cobrados no cartão em 1x. Cancele quando quiser."}
        </p>
        {params.get("trial") === "1" && !anonymous && (
          <p role="note" className="text-sm rounded-md bg-amber-50 text-amber-900 px-3 py-2">
            O teste grátis de 7 dias é só para contas novas. Como você já tem conta, assine um plano.
          </p>
        )}
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

      {stage.kind === "new_account" && (
        <Card className={stage.tone === "success" ? "border-green-600/30 bg-green-50" : stage.tone === "rejected" ? "border-destructive/30" : "border-border"}>
          <CardContent className="p-6 space-y-3">
            <p
              role="status"
              aria-live="polite"
              className={`flex items-center gap-2 text-sm font-medium ${
                stage.tone === "success" ? "text-green-700" : stage.tone === "rejected" ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {stage.tone === "success" ? (
                <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
              ) : stage.tone === "rejected" ? (
                <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
              )}
              {stage.message}
            </p>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Mail className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Sua conta foi criada com o e-mail <strong className="text-foreground">{stage.email}</strong>.{" "}
                {stage.mailSent
                  ? "Enviamos um link de acesso para ele: abra o e-mail, clique no link e crie sua senha."
                  : 'Não conseguimos enviar o link de acesso agora. Use "Esqueci minha senha" na tela de entrada para entrar.'}
                {stage.tone === "rejected" && " Depois, tente outro cartão em Créditos."}
              </span>
            </p>
            <Link to="/auth">
              <Button variant="outline">Ir para a tela de entrada</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {stage.kind === "trial_used" && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-6 space-y-3">
            <p role="status" aria-live="polite" className="text-sm text-amber-900">
              {stage.message} Você pode assinar o plano {stage.plan.name} por {formatBrl(stage.plan.priceBrl)}/mês com o mesmo cartão, sem digitar nada de novo.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleSubmit(stage.plan, stage.card, false, { resubmit: true })} disabled={subscribe.isPending}>
                Assinar {formatBrl(stage.plan.priceBrl)}/mês
              </Button>
              <Button variant="outline" onClick={retry}>Usar outro cartão</Button>
            </div>
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
          {!trialMode && (
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
                // Plain toggle buttons (Tab + Enter), not a fake radiogroup: a real one
                // would need roving tabindex and arrow keys to honour its semantics.
                <div role="group" aria-label="Planos" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {plans.map((plan) => {
                    const active = selected?.id === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        aria-pressed={active}
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
          )}

          {trialMode && selected && (
            <p className="text-sm text-muted-foreground">
              Plano {selected.name} · {formatBrl(selected.priceBrl)}/mês · {selected.monthlyCredits} créditos por mês, a partir do 8º dia.
            </p>
          )}

          {selected && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {trialMode ? "Cartão de crédito" : `Pagar ${formatBrl(selected.priceBrl)} por mês no cartão`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {notice && (
                  <p role="note" className="text-sm rounded-md bg-amber-50 text-amber-900 px-3 py-2">
                    {notice}
                  </p>
                )}
                {trialMode && (
                  <p role="note" className="text-sm rounded-md bg-primary/5 text-foreground px-3 py-2">
                    Hoje: R$ 0,00. Em {formatDate(trialFirstChargeDate(new Date()))} cobramos {formatBrl(selected.priceBrl)} no cartão e seu plano vira {selected.monthlyCredits} créditos/mês. Cancele antes em Créditos e nada é cobrado. Uma cobrança de validação pode aparecer e é estornada.
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
                  onSubmit={(card) => handleSubmit(selected, card, trialMode)}
                  onError={(message) => setStage({ kind: "form", error: message })}
                  {...(trialMode ? { submitLabel: "Começar o teste" } : {})}
                />
                <p className="text-xs text-muted-foreground">
                  {trialMode
                    ? `Você recebe ${TRIAL_CREDITS} créditos agora. A cobrança só acontece em ${TRIAL_DAYS} dias, e depois todo mês na mesma data.`
                    : "A primeira cobrança é feita agora e as próximas todo mês na mesma data. Os créditos do plano zeram a cada renovação; os extras não expiram."}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
