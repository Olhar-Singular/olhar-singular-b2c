import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { trackCtaClick, type CtaOrigem } from "@/lib/analytics/events";

interface LandingCtaProps {
  to: string;
  origem: CtaOrigem;
  /** `on-dark` keeps the green on the dark band: bright teal with ink text (teal-deep would sink into it). */
  variant?: "primary" | "ghost" | "on-dark";
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}

// Plain router Link (not the shadcn Button) so the landing theme cannot leak
// into, or be overridden by, the app's button variants.
const BASE =
  "inline-flex min-h-[44px] items-center justify-center gap-2 font-poppins font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-ink";

// Brand teal everywhere: teal-deep with white text on light sections (4.77:1),
// bright teal with ink text on the dark band (5.9:1 on the button, 5.4:1 against the band).
const VARIANTS = {
  primary: "rounded-2xl bg-lp-teal-deep px-6 py-3 text-white hover:bg-lp-teal-hover",
  "on-dark": "rounded-2xl bg-lp-teal px-6 py-3 text-lp-ink hover:brightness-95",
  ghost: "px-2 text-lp-teal-text underline-offset-4 hover:underline",
} as const;

/** The single CTA of the landing: every click emits `cta_click` (the Meta Pixel `Lead` fires from GTM on it). */
export default function LandingCta({ to, origem, variant = "primary", className, onClick, children }: LandingCtaProps) {
  const handleClick = () => {
    trackCtaClick(origem);
    onClick?.();
  };

  return (
    <Link to={to} onClick={handleClick} className={cn(BASE, VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}
