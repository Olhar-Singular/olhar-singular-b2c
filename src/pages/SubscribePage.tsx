import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MpCardBrick from "@/components/payments/MpCardBrick";
import { useAuth } from "@/hooks/useAuth";
import { useAccess } from "@/hooks/useAccess";
import type { CardFormDataView } from "@/hooks/useCredits";
import { isLiveSubscription, usePlans, useSubscribe, useSubscription, type PlanView } from "@/hooks/useSubscription";
import { formatBrl, pickInitialPlan, replacementNotice } from "@/lib/domain/subscriptionUi";

type Stage =
  | { kind: "form"; error?: string }
  | { kind: "authorized"; plan: PlanView }
  | { kind: "pending" }
  | { kind: "rejected"; message: string };

const GENERIC_REJECTION = "O cartão não foi aceito para a assinatura. Tente outro cartão.";

// Subscribe a LOGGED-IN user: choose a plan, tokenize the card in the Brick,
// and let the subscribe function activate it on the spot. Anonymous checkout
// (pay first, then account) is a later phase; this page is protected.
export default function SubscribePage() {
  const { user } = useAuth();
  const access = useAccess();
  const [params] = useSearchParams();
  const { data: plans = [], isLoading: loadingPlans } = usePlans();
  const { data: subscription } = useSubscription();
  const subscribe = useSubscribe();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "form" });
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

  async function handleSubmit(plan: PlanView, card: CardFormDataView) {
    try {
      const result = await subscribe.mutateAsync({ planSlug: plan.slug, card });
      if (result.status === "authorized") setStage({ kind: "authorized", plan });
      else if (result.status === "pending") setStage({ kind: "pending" });
      else setStage({ kind: "rejected", message: result.message ?? GENERIC_REJECTION });
    } catch {
      // Business refusal already toasted by the hook; let the Brick re-enable.
    }
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

  if (isLiveSubscription(subscription) && stage.kind === "form") {
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

      {stage.kind === "form" && (
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
                  key={`${selected.id}-${attempt}`}
                  amount={selected.priceBrl}
                  payerEmail={user?.email ?? undefined}
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
