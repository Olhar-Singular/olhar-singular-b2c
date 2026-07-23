// Single source of truth for the credit packages that may be purchased.
// Imported by the Stripe checkout edge function, which serves both payment
// methods (card and Pix), so the allowed price list lives in exactly one place.

export interface CreditPackage {
  credits: number;
  amountBrl: number;
}

export const ALLOWED_PACKAGES: CreditPackage[] = [
  { credits: 30, amountBrl: 9.9 },
  { credits: 120, amountBrl: 29.9 },
  { credits: 300, amountBrl: 59.9 },
];

// Real-payment smoke-test package, purchasable only by super-admins (the Stripe
// checkout passes allowTest after verifying profiles.is_super_admin). Kept out of
// ALLOWED_PACKAGES so regular users can never buy it.
export const TEST_PACKAGE: CreditPackage = { credits: 1, amountBrl: 1.0 };

export interface FindPackageOptions {
  allowTest?: boolean;
}

// Returns the matching package, or null when the credits/price pair is not a
// whitelisted package. The price is compared with a sub-cent tolerance to absorb
// floating-point drift coming from the client.
export function findPackage(
  credits?: number,
  amountBrl?: number,
  options?: FindPackageOptions,
): CreditPackage | null {
  const candidates = options?.allowTest ? [...ALLOWED_PACKAGES, TEST_PACKAGE] : ALLOWED_PACKAGES;
  return (
    candidates.find(
      (p) => p.credits === credits && Math.abs(p.amountBrl - (amountBrl ?? 0)) < 0.01,
    ) ?? null
  );
}
