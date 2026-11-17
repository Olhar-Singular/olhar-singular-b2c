import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { basePrepaidPlan, prepaidCardLines, prepaidReleaseLabel, type PrepaidPlanView } from "@/lib/domain/prepaid";

interface PrepaidPlanPickerProps {
  plans: PrepaidPlanView[];
  selectedId: string | null;
  onSelect: (slug: string) => void;
  loading: boolean;
}

// Same pattern as PlanPicker (toggle buttons, Tab + Enter): how long the
// access lasts, what it costs per month and how much it saves against paying
// month by month. The selected plan's two-part release is stated under it (R1).
export default function PrepaidPlanPicker({ plans, selectedId, onSelect, loading }: PrepaidPlanPickerProps) {
  const base = basePrepaidPlan(plans.filter((p) => !p.adminOnly));
  const selected = plans.find((p) => p.id === selectedId);
  const release = selected ? prepaidReleaseLabel(selected) : null;

  return (
    <section className="space-y-3" aria-labelledby="prepaid-plans-heading">
      <h2 id="prepaid-plans-heading" className="font-semibold text-foreground">
        1. Por quanto tempo você quer acesso?
      </h2>

      {loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="prepaid-plans-loading">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {!loading && plans.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum plano disponível no momento.</p>
      )}

      {plans.length > 0 && (
        <div role="group" aria-label="Planos à vista" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {plans.map((plan) => {
            const active = selectedId === plan.id;
            const lines = prepaidCardLines(plan, plan.adminOnly ? null : base);
            return (
              <button
                key={plan.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(plan.slug)}
                className={`relative min-h-[44px] rounded-xl border bg-card p-4 text-left transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  active ? "border-primary ring-2 ring-primary/30" : plan.adminOnly ? "border-dashed border-border" : "border-border"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`grid h-4 w-4 place-items-center rounded-full border ${active ? "border-primary" : "border-muted-foreground/50"}`}
                    >
                      {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">{lines.headline}</span>
                  </span>
                  {plan.highlight && <Badge className="bg-primary-strong text-xs hover:bg-primary-strong">Popular</Badge>}
                  {plan.adminOnly && (
                    <Badge variant="outline" className="text-xs">
                      Só admins
                    </Badge>
                  )}
                </span>
                <span className="mt-2 block text-2xl font-bold tabular-nums text-foreground">{lines.price}</span>
                <span className="mt-1 block text-sm font-medium text-foreground">
                  {lines.credits} · {lines.adaptations}
                </span>
                {lines.savings && <span className="mt-1 block text-sm font-semibold text-primary-strong">{lines.savings}</span>}
                <span className="mt-0.5 block text-xs text-muted-foreground">{lines.monthly}</span>
              </button>
            );
          })}
        </div>
      )}

      {release && (
        <p role="note" className="rounded-md bg-primary/5 px-3 py-2 text-sm text-foreground">
          {release}
        </p>
      )}
    </section>
  );
}
