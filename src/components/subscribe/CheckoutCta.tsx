import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CheckoutCtaProps {
  label: string;
  /** Formatted amount due today, shown on the mobile bar. */
  payToday: string;
  /** Microcopy under the button on desktop. */
  note: string;
  /** Shorter microcopy for the mobile bar. */
  mobileNote: string;
  disabled: boolean;
  onClick: () => void;
}

// The checkout's single call to action. The button is the checkout green
// (#00a650): white on it is 3.2:1, so its text is large and bold (WCAG 1.4.3
// asks 3:1 for large text, 4.5:1 below it). On mobile it is a bar fixed to the
// bottom with the amount due today (the briefing's highest-impact item); from
// lg up it sits under the card form. While mounted, it appends a spacer to
// <body>, after the app root, so the last field and the legal footer can still
// scroll above the bar (padding inside the page would sit before the footer).
export default function CheckoutCta({ label, payToday, note, mobileNote, disabled, onClick }: CheckoutCtaProps) {
  return (
    <>
      {createPortal(<div data-testid="checkout-cta-spacer" aria-hidden="true" className="h-40 lg:hidden" />, document.body)}
      <div
        data-testid="checkout-cta"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none"
      >
        <p className="mb-2 flex items-baseline justify-between text-sm lg:hidden">
          <span className="text-muted-foreground">Você paga hoje</span>
          <strong className="text-lg font-bold tabular-nums text-primary-strong">{payToday}</strong>
        </p>
        <Button type="button" size="lg" className="h-12 w-full gap-2 text-[1.1875rem] font-bold" disabled={disabled} onClick={onClick}>
          {label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          <span className="lg:hidden">{mobileNote}</span>
          <span className="hidden lg:inline">{note}</span>
        </p>
      </div>
    </>
  );
}
