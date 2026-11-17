import { useRef, type KeyboardEvent } from "react";
import { CreditCard, QrCode } from "lucide-react";
import { TRIAL_DAYS } from "@/lib/domain/subscriptionUi";

export type PaymentMethod = "card" | "pix";

interface PaymentMethodToggleProps {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  /** The card option tells the trial when the buyer came for it. */
  trial: boolean;
}

const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

// A real radiogroup (spec 2026-11-15-checkout-pix-a-vista): only the checked
// option is tabbable and the arrow keys move the choice, as the role promises.
export default function PaymentMethodToggle({ value, onChange, trial }: PaymentMethodToggleProps) {
  const refs = { card: useRef<HTMLButtonElement>(null), pix: useRef<HTMLButtonElement>(null) };

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!ARROWS.includes(event.key)) return;
    event.preventDefault();
    const next: PaymentMethod = value === "card" ? "pix" : "card";
    onChange(next);
    refs[next].current?.focus();
  }

  const options: { key: PaymentMethod; title: string; detail: string; Icon: typeof CreditCard }[] = [
    {
      key: "card",
      title: "Cartão de crédito",
      detail: trial ? `Teste ${TRIAL_DAYS} dias grátis. Nada é cobrado hoje.` : "Assinatura mensal. Cancele quando quiser.",
      Icon: CreditCard,
    },
    { key: "pix", title: "Pix", detail: "Sem cartão. Planos à vista, acesso imediato.", Icon: QrCode },
  ];

  return (
    <div role="radiogroup" aria-label="Forma de pagamento" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map(({ key, title, detail, Icon }) => {
        const checked = value === key;
        return (
          <button
            key={key}
            ref={refs[key]}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(key)}
            onKeyDown={onKeyDown}
            className={`flex min-h-[44px] items-start gap-3 rounded-xl border bg-card p-4 text-left transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              checked ? "border-primary ring-2 ring-primary/30" : "border-border"
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${checked ? "border-primary" : "border-muted-foreground/50"}`}
            >
              {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                {title}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{detail}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
