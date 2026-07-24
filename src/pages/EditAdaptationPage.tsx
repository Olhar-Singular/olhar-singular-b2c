import { useParams } from "react-router-dom";
import CanonicalAdaptationWizard from "@/components/adaptation/CanonicalAdaptationWizard";
import { useAdaptation } from "@/hooks/useAdaptations";
import { rowToWizardData } from "@/lib/adaptation/wizard/rowMapping";

export default function EditAdaptationPage() {
  const { id } = useParams<{ id: string }>();
  const { data: row, isLoading, isError } = useAdaptation(id);

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando adaptação…</p>;
  }

  if (isError || !row) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Não foi possível carregar esta adaptação.
      </p>
    );
  }

  // Keyed on the ID ALONE. The key used to include `updated_at`, which every
  // autosave advances — so a refetch that saw a newer row (a window refocus,
  // the invalidation fired by "Salvar") remounted the wizard out from under the
  // user: caret, scroll and current step all thrown away, back to Revisar,
  // mid-sentence. The seed is a starting point, not live state; once the wizard
  // is mounted it owns the document and autosaves it, so re-seeding it from a
  // row IT wrote is both destructive and pointless. Only a genuinely different
  // adaptation justifies a fresh wizard.
  return (
    <CanonicalAdaptationWizard
      key={row.id}
      editMode={{
        adaptationId: row.id,
        initialData: rowToWizardData(row),
        initialUpdatedAt: row.updated_at,
      }}
    />
  );
}
