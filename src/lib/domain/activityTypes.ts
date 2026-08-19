/**
 * The four activity types the wizard offers, as the single source of truth.
 *
 * These values are already persisted on `adaptations.activity_type` (chosen in
 * step 1), so the library can group and filter by them with no schema change.
 * The list lived only inside StepActivityType until the library needed the same
 * labels — a second hand-written copy would drift the moment a type is added.
 */
export const ACTIVITY_TYPES = [
  { value: "exercício", label: "Exercício" },
  { value: "prova", label: "Prova" },
  { value: "texto", label: "Texto / Leitura" },
  { value: "projeto", label: "Projeto / Pesquisa" },
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];

/** Human label for a stored value; unknown/legacy values show as themselves. */
export function activityTypeLabel(value: string | null | undefined): string {
  if (!value) return "Sem tipo";
  return ACTIVITY_TYPES.find((t) => t.value === value)?.label ?? value;
}
