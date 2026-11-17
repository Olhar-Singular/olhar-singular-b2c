import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, Mail, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import MpCardBrick, { type MpCardBrickHandle } from "@/components/payments/MpCardBrick";
import AccountStep, { EMPTY_ACCOUNT_FORM, type AccountDraft, type AccountForm } from "@/components/subscribe/AccountStep";
import CheckoutCta from "@/components/subscribe/CheckoutCta";
import PaymentMethodToggle, { type PaymentMethod } from "@/components/subscribe/PaymentMethodToggle";
import PixPlanPayment from "@/components/subscribe/PixPlanPayment";
import PlanPicker from "@/components/subscribe/PlanPicker";
import PrepaidPlanPicker from "@/components/subscribe/PrepaidPlanPicker";
import TrialTimeline from "@/components/subscribe/TrialTimeline";
import TrustColumn from "@/components/subscribe/TrustColumn";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccess } from "@/hooks/useAccess";
import { useActivePrepaid, usePrepaidPlans } from "@/hooks/usePrepaid";
import type { CardFormDataView } from "@/hooks/useCredits";
import { parseIsoOrNull } from "@/lib/domain/access";
import { isLiveSubscription, subscribeErrorCode, usePlans, useSubscribe, useSubscription, type PlanView, type SubscribeResult } from "@/hooks/useSubscription";
import { publicPrepaidPlans } from "@/lib/domain/prepaid";
import { ACCOUNT_FORM_MESSAGES, canSubscribe, cheapestPublicPlan, confirmedEmail, formatBrl, normalizeAccount, validateAccountForm, formatDate, pickInitialPlan, replacementNotice, TERMS_VERSION, TRIAL_CREDITS, TRIAL_DAYS, trialFirstChargeDate } from "@/lib/domain/subscriptionUi";
import { trackAddPaymentInfo, trackBeginCheckout, trackSubscriptionStarted, trackTrialStarted } from "@/lib/analytics/events";
import { readAttribution, sessionStore } from "@/lib/analytics/attribution";

type Stage =
  /** offerPix: the card was refused for a running prepaid plan (R6); the alert links to Pix. */
  | { kind: "form"; error?: string; offerPix?: boolean }
  | { kind: "authorized"; plan: PlanView }
  | { kind: "pending" }
  | { kind: "rejected"; message: string }
  /** Anonymous funnel: the account exists; the buyer enters through the e-mail link. */
  | { kind: "new_account"; tone: "success" | "pending" | "rejected"; message: string; email: string; mailSent: boolean }
  /** The CPF already had a trial: same card, paid plan, one click (no new token: MP was never called). */
  | { kind: "trial_used"; plan: PlanView; card: CardFormDataView; message: string };

const GENERIC_REJECTION = "O cartão não foi aceito para a assinatura. Tente outro cartão.";
// "grátis" only ever names the trial (teste), as the copy guard requires.
const TRIAL_CTA = `Começar meus ${TRIAL_DAYS} dias grátis`; // teste
const PIX_TRIAL_NOTE =
  "No Pix o pagamento é à vista, então o teste de 7 dias não se aplica. Mas você tem 7 dias de garantia: se não servir, devolvemos o valor integral.";
const PAID_NOTE =
  "A primeira cobrança é feita agora e as próximas todo mês na mesma data. Os créditos do plano zeram a cada renovação; os extras não expiram.";

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
  // Who is buying, typed on the same screen as the plan and the payment; checked
  // when the call to action is pressed.
  const [accountForm, setAccountForm] = useState<AccountForm>(EMPTY_ACCOUNT_FORM);
  const [accountError, setAccountError] = useState<string | null>(null);
  // The Brick reads the payer e-mail once (a valid one hides its own e-mail
  // field) and remounts when it changes, wiping the card: it gets the last
  // e-mail confirmed in both fields, not every keystroke.
  const [brickEmail, setBrickEmail] = useState<string | null>(null);
  // The account that went with the payment (the submit callbacks read it after awaits).
  const accountRef = useRef<AccountDraft | null>(null);
  // Forces a fresh Brick after a rejection: the previous token was single-use.
  const [attempt, setAttempt] = useState(0);
  // The Brick's own button is hidden: the page's CTA submits through this ref.
  const brickRef = useRef<MpCardBrickHandle>(null);
  const [submitting, setSubmitting] = useState(false);
  // One clock for the timeline, the notice and the summary.
  const [now] = useState(() => new Date());
  // Card (monthly subscription) or Pix (prepaid plan). Switching keeps the account.
  const [method, setMethod] = useState<PaymentMethod>(() => (params.get("pagamento") === "pix" ? "pix" : "card"));
  const pix = method === "pix";
  const { data: prepaidRows, isLoading: loadingPrepaid } = usePrepaidPlans();
  const { data: runningPrepaid } = useActivePrepaid();
  const [prepaidSlug, setPrepaidSlug] = useState<string | null>(null);

  const requested = params.get("plano");
  // ?trial=1 is the landing's trial CTA: anonymous only (a logged-in user
  // subscribes paid). The buyer picks the plan; it starts from a public
  // ?plano= or the cheapest public plan. Admin-only plans are never offered
  // (the server refuses them for a trial).
  const trialMode = anonymous && params.get("trial") === "1";
  const offered = useMemo(() => (trialMode ? plans.filter((p) => !p.adminOnly) : plans), [plans, trialMode]);
  const selected = useMemo(
    () =>
      offered.find((p) => p.slug === selectedSlug) ??
      (trialMode ? offered.find((p) => p.slug === requested) ?? cheapestPublicPlan(offered) : pickInitialPlan(offered, requested)),
    [offered, selectedSlug, requested, trialMode],
  );

  // Once the catalogue arrives, pin the initial choice so the Brick's amount
  // does not flip under the user.
  useEffect(() => {
    if (!selectedSlug && selected) setSelectedSlug(selected.slug);
  }, [selected, selectedSlug]);

  // The super-admin also sees the R$ 1,00 smoke offer (the server accepts it only from them).
  const prepaidOffered = useMemo(
    () => (!anonymous && profile?.is_super_admin && prepaidRows?.length ? prepaidRows : publicPrepaidPlans(prepaidRows)),
    [anonymous, profile?.is_super_admin, prepaidRows],
  );
  const prepaid =
    prepaidOffered.find((p) => p.slug === (prepaidSlug ?? requested)) ?? prepaidOffered.find((p) => p.highlight) ?? prepaidOffered[0];

  const notice = replacementNotice(access);
  const payerEmail = anonymous ? brickEmail ?? undefined : user?.email ?? undefined;
  const brickVisible = stage.kind === "form" && !pix && (!anonymous || !!brickEmail) && !!selected;

  function changeAccount(next: AccountForm) {
    setAccountForm(next);
    const email = confirmedEmail(next);
    if (email) setBrickEmail(email);
  }

  // The checkout's button checks the account first and says what is missing.
  function readAccount(): AccountDraft | null {
    const problem = validateAccountForm(accountForm);
    if (problem) {
      setAccountError(ACCOUNT_FORM_MESSAGES[problem]);
      document.getElementById("account-heading")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      return null;
    }
    setAccountError(null);
    accountRef.current = normalizeAccount(accountForm);
    return accountRef.current;
  }

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
        ...(anonymous && accountRef.current ? { account: { ...accountRef.current, termsVersion: TERMS_VERSION } } : {}),
        ...(attribution ? { attribution: attribution as Record<string, unknown> } : {}),
      });
    } catch (e) {
      const code = subscribeErrorCode(e);
      if (trial && code === "trial_used") {
        setStage({ kind: "trial_used", plan, card, message: (e as Error).message });
        return;
      }
      // Still rejected: the Brick re-enables its button; the reason stays by the card.
      if (code === "prepaid_active") setStage({ kind: "form", error: (e as Error).message, offerPix: true });
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
      const email = accountRef.current!.email;
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

  async function submitCard() {
    if (anonymous && !readAccount()) return;
    // A new attempt: the previous Brick error (e.g. "fill every field") is stale.
    setStage({ kind: "form" });
    setSubmitting(true);
    try {
      // The CTA only renders next to the Brick, so the handle is set. A false
      // answer (invalid fields, refusal already shown) just re-enables the CTA.
      await brickRef.current!.submit();
    } finally {
      setSubmitting(false);
    }
  }

  function retry() {
    setAttempt((n) => n + 1);
    setStage({ kind: "form" });
  }

  // Back to the form on the other method; a card error does not follow to Pix.
  function switchMethod(next: PaymentMethod) {
    setMethod(next);
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

  const firstCharge = trialMode ? trialFirstChargeDate(now) : null;

  const header = (
    <header className="space-y-1">
      <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
        {pix
          ? "Pague no Pix, sem precisar de cartão."
          : trialMode
            ? `Comece hoje. Você só paga daqui a ${TRIAL_DAYS} dias.`
            : "Escolha seu plano"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {pix
          ? "Acesso liberado em segundos depois do pagamento. Quanto mais meses, menor o valor mensal."
          : trialMode
            ? "Hoje você não paga nada. Avisamos por e-mail antes da primeira cobrança, e cancelar leva 2 cliques."
            : "Créditos novos todo mês, cobrados no cartão em 1x. Cancele quando quiser."}
      </p>
      {pix && params.get("trial") === "1" && (
        <p role="note" className="text-sm rounded-md bg-primary/5 text-foreground px-3 py-2">
          {PIX_TRIAL_NOTE}
        </p>
      )}
      {!pix && params.get("trial") === "1" && !anonymous && (
        <p role="note" className="text-sm rounded-md bg-amber-50 text-amber-900 px-3 py-2">
          O teste grátis de 7 dias é só para contas novas. Como você já tem conta, assine um plano.
        </p>
      )}
    </header>
  );

  // Anonymous buyer: who is buying, between the plan and the payment.
  const accountSection = anonymous && (
    <section aria-labelledby="account-heading" className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 id="account-heading" className="scroll-mt-4 font-semibold text-foreground">
        2. Quem vai usar a plataforma
      </h2>
      <AccountStep value={accountForm} onChange={changeAccount} error={accountError} />
    </section>
  );

  if (stage.kind === "form") {
    return (
      <div className="checkout-theme mx-auto max-w-6xl px-4 py-8">
        <div
          className={`grid items-start gap-8 ${
            // The app's sidebar takes 240px from lg up: two columns only from xl there.
            anonymous ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "xl:grid-cols-[minmax(0,1fr)_340px]"
          }`}
        >
          <div className="min-w-0 space-y-6">
            {header}

            {!pix && trialMode && selected && <TrialTimeline start={now} plan={selected} />}

            <PaymentMethodToggle value={method} onChange={switchMethod} trial={trialMode} />

            {pix && (
              <>
                <PrepaidPlanPicker
                  plans={prepaidOffered}
                  selectedId={loadingPrepaid ? null : prepaid.id}
                  onSelect={setPrepaidSlug}
                  loading={loadingPrepaid}
                />
                {/* A rebuy extends a running prepaid plan (R7): the replacement warning would be wrong then. */}
                {notice && !runningPrepaid && (
                  <p role="note" className="text-sm rounded-md bg-amber-50 text-amber-900 px-3 py-2">
                    {notice}
                  </p>
                )}
                {accountSection}
                {!loadingPrepaid && (
                  <PixPlanPayment
                    key={prepaid.slug}
                    plan={prepaid}
                    step={anonymous ? 3 : 2}
                    getAccount={
                      anonymous
                        ? () => {
                            const confirmed = readAccount();
                            return confirmed ? { ...confirmed, termsVersion: TERMS_VERSION } : null;
                          }
                        : undefined
                    }
                  />
                )}
              </>
            )}

            {!pix && (
              <>
                <PlanPicker
                  heading={trialMode ? "1. Escolha seu plano" : "1. Plano"}
                  plans={offered}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedSlug}
                  loading={loadingPlans}
                />

                {accountSection}

                {selected && (
                  <section aria-labelledby="card-heading" className="space-y-3 rounded-xl border border-border bg-card p-5">
                    <h2 id="card-heading" className="font-semibold text-foreground">
                      {anonymous ? 3 : 2}. Dados do cartão
                    </h2>
                    {notice && (
                      <p role="note" className="text-sm rounded-md bg-amber-50 text-amber-900 px-3 py-2">
                        {notice}
                      </p>
                    )}
                    {firstCharge && (
                      <p role="note" className="text-sm rounded-md bg-primary/5 text-foreground px-3 py-2">
                        Hoje: R$ 0,00. Em {formatDate(firstCharge)} começa o plano {selected.name}, {formatBrl(selected.priceBrl)}/mês. Cancele em 2
                        cliques antes dessa data e não é cobrado nada.
                      </p>
                    )}
                    {stage.error && (
                      <p role="alert" className="text-sm text-destructive-strong">
                        {stage.error}
                        {stage.offerPix && (
                          <>
                            {" "}
                            <button type="button" className="font-medium underline" onClick={() => switchMethod("pix")}>
                              Renovar no Pix
                            </button>
                          </>
                        )}
                      </p>
                    )}
                    {anonymous && !brickEmail ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                        Preencha seus dados acima para digitar o cartão.
                      </p>
                    ) : (
                      <MpCardBrick
                        ref={brickRef}
                        key={`${selected.id}-${attempt}-${payerEmail ?? ""}`}
                        amount={selected.priceBrl}
                        payerEmail={payerEmail}
                        onSubmit={(card) => handleSubmit(selected, card, trialMode)}
                        onError={(message) => setStage({ kind: "form", error: message })}
                        hideSubmit
                      />
                    )}
                    {/* The paid disclosure under the CTA is desktop-only; the fixed bar has no room for it. */}
                    {!trialMode && <p className="text-xs text-muted-foreground lg:hidden">{PAID_NOTE}</p>}
                    <CheckoutCta
                      label={trialMode ? TRIAL_CTA : `Assinar por ${formatBrl(selected.priceBrl)}/mês`}
                      payToday={formatBrl(trialMode ? 0 : selected.priceBrl)}
                      note={trialMode ? "Hoje você não paga nada. Cancele em 2 cliques, sem fidelidade e sem multa." : PAID_NOTE}
                      mobileNote={trialMode ? "Cancele em 2 cliques. Sem fidelidade." : "Renova todo mês. Cancele quando quiser."}
                      disabled={submitting}
                      onClick={submitCard}
                    />
                  </section>
                )}
              </>
            )}
          </div>

          {pix
            ? !loadingPrepaid && <TrustColumn mode="pix" prepaid={prepaid} />
            : selected && <TrustColumn plan={selected} trial={trialMode} firstCharge={firstCharge} />}
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-theme mx-auto max-w-3xl px-4 py-8 space-y-8">
      {header}

      {stage.kind === "authorized" && (
        <Card className="border-green-600/30 bg-green-50">
          <CardContent className="p-6 space-y-3">
            <p role="status" aria-live="polite" className="flex items-center gap-2 font-medium text-green-700">
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
              Assinatura ativa! {stage.plan.monthlyCredits} créditos já estão na sua conta.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg" className="gap-1.5 text-[1.1875rem] font-bold">
                <Link to="/adaptar">
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  Começar a adaptar
                </Link>
              </Button>
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
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-destructive-strong">
              <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              {stage.message}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={retry}>
                Tentar com outro cartão
              </Button>
              <Button variant="outline" onClick={() => switchMethod("pix")}>
                Pagar com Pix
              </Button>
            </div>
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
                stage.tone === "success" ? "text-green-700" : stage.tone === "rejected" ? "text-destructive-strong" : "text-muted-foreground"
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
              <Button
                size="lg"
                className="text-[1.1875rem] font-bold"
                onClick={() => handleSubmit(stage.plan, stage.card, false, { resubmit: true })}
                disabled={subscribe.isPending}
              >
                Assinar {formatBrl(stage.plan.priceBrl)}/mês
              </Button>
              <Button variant="outline" onClick={retry}>Usar outro cartão</Button>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
