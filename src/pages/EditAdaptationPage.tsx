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

  // Keyed on id + updated_at so a re-fetch with new data remounts the wizard
  // with fresh seed state (rehydrate cleanly after an external change).
  return (
    <CanonicalAdaptationWizard
      key={`${row.id}:${row.updated_at}`}
      editMode={{
        adaptationId: row.id,
        initialData: rowToWizardData(row),
        initialUpdatedAt: row.updated_at,
      }}
    />
  );
}
