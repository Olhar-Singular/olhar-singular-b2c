import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { trackCtaClick, type CtaOrigem } from "@/lib/analytics/events";

interface LandingCtaProps {
  to: string;
  origem: CtaOrigem;
  variant?: "primary" | "ghost";
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}

// Plain router Link (not the shadcn Button) so the landing theme cannot leak
// into, or be overridden by, the app's button variants.
const BASE =
  "inline-flex min-h-[44px] items-center justify-center gap-2 font-poppins font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-ink";

const VARIANTS = {
  primary: "rounded-2xl bg-lp-orange px-6 py-3 text-lp-ink hover:bg-lp-orange-hover",
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
