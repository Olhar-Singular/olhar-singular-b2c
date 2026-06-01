// Single source of truth for the credit packages that may be purchased.
// Imported by both checkout edge functions (Mercado Pago / Pix and Stripe / card)
// so the allowed price list cannot drift between providers.

export interface CreditPackage {
  credits: number;
  amountBrl: number;
}

export const ALLOWED_PACKAGES: CreditPackage[] = [
  { credits: 30, amountBrl: 9.9 },
  { credits: 120, amountBrl: 29.9 },
  { credits: 300, amountBrl: 59.9 },
];

// Returns the matching package, or null when the credits/price pair is not a
// whitelisted package. The price is compared with a sub-cent tolerance to absorb
// floating-point drift coming from the client.
export function findPackage(credits?: number, amountBrl?: number): CreditPackage | null {
  return (
    ALLOWED_PACKAGES.find(
      (p) => p.credits === credits && Math.abs(p.amountBrl - (amountBrl ?? 0)) < 0.01,
    ) ?? null
  );
}
