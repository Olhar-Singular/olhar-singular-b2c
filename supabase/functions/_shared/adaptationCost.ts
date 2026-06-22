// =============================================================================
// Single source of truth for adaptation credit cost INSIDE the edge functions.
//
// These tables mirror the frontend product source (src/lib/domain/barriers.ts).
// They are duplicated here (not imported) because edge functions run under Deno
// and bundling `src/` is avoided for this trivial, money-critical calc — but a
// SYNC test (adaptationCost.test.ts) imports BOTH and asserts they are equal,
// so they can never silently diverge.
//
// No URL imports: this module is pure and fully covered by Vitest.
// =============================================================================

export type ComplexityTier = "low" | "medium" | "high";

export const BARRIER_COMPLEXITY: Record<string, ComplexityTier> = {
  tea: "high",
  tdah: "medium",
  tod: "medium",
  sindrome_down: "high",
  altas_habilidades: "high",
  dislexia: "low",
  discalculia: "low",
  disgrafia: "low",
  tourette: "medium",
  dispraxia: "low",
  toc: "medium",
};

export const ADAPTATION_CREDITS: Record<ComplexityTier, number> = {
  low: 5,
  medium: 8,
  high: 12,
};

/** Highest complexity tier among the given barrier dimensions (medium default). */
export function getComplexityTier(dimensions: string[]): ComplexityTier {
  if (dimensions.length === 0) return "medium";
  const tiers = dimensions.map((d) => BARRIER_COMPLEXITY[d] ?? "medium");
  return tiers.includes("high") ? "high" : tiers.includes("medium") ? "medium" : "low";
}

/** Credit cost of adapting an activity for the given barrier dimensions. */
export function calcAdaptationCost(dimensions: string[]): number {
  return ADAPTATION_CREDITS[getComplexityTier(dimensions)];
}
