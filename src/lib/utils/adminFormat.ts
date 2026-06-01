import { formatDistance } from "date-fns";
import { ptBR } from "date-fns/locale";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Formats a USD amount; tiny AI costs keep up to 4 decimals. Non-finite → $0.00. */
export function formatUsd(value: number): string {
  return usdFormatter.format(Number.isFinite(value) ? value : 0);
}

/** Best label for a user: name, then email, then a generic fallback. */
export function userDisplayName(user: { full_name: string | null; email: string | null }): string {
  return user.full_name || user.email || "Este usuário";
}

/** Human relative "last access" in pt-BR (e.g. "há 2 dias"). Null/invalid → "Nunca". */
export function formatLastAccess(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "Nunca";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Nunca";
  return formatDistance(date, now, { addSuffix: true, locale: ptBR });
}
