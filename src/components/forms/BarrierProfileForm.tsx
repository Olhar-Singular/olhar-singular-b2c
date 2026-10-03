import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BARRIER_DIMENSIONS } from "@/lib/domain/barriers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const schema = z.object({
  name: z.string().min(1, "Nome do perfil é obrigatório"),
  barriers: z.array(z.string()).min(1, "Selecione pelo menos uma barreira"),
  observation: z.string().max(2000).nullable(),
});

export type BarrierProfileFormValues = z.infer<typeof schema>;

interface Props {
  defaultValues?: Partial<BarrierProfileFormValues>;
  onSubmit: (values: BarrierProfileFormValues) => Promise<void>;
  isPending?: boolean;
  /** When given, the fixed footer shows a "Cancelar" button that calls it. */
  onCancel?: () => void;
}

export function BarrierProfileForm({ defaultValues, onSubmit, isPending, onCancel }: Props) {
  const { control, handleSubmit, watch, register, formState: { errors } } = useForm<BarrierProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", barriers: [], observation: null, ...defaultValues },
  });

  const selected = watch("barriers");

  return (
    // The fields scroll inside their own region so the actions stay pinned in the
    // footer. Hosts give the dialog a bounded height (flex column, overflow hidden).
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col gap-4">
      <div
        data-testid="barrier-profile-form-scroll"
        className="-mx-6 min-h-0 flex-1 space-y-5 overflow-y-auto px-6"
      >
        <div className="space-y-1">
          <Label htmlFor="profile-name">Nome do perfil</Label>
          <Input
            id="profile-name"
            placeholder="Ex.: Aluno com TEA, turma 5A"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "profile-name-error" : undefined}
            {...register("name")}
          />
          {errors.name && (
            <p id="profile-name-error" role="alert" className="text-sm text-destructive">
              {errors.name.message}
            </p>
          )}
        </div>

        <Controller
          control={control}
          name="barriers"
          render={({ field }) => (
            <div
              role="group"
              aria-labelledby="profile-barriers-label"
              aria-describedby={errors.barriers ? "profile-barriers-error" : undefined}
              className="space-y-4"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span id="profile-barriers-label" className="text-sm font-medium">
                    Barreiras de aprendizagem
                  </span>
                  {selected.length > 0 && (
                    <Badge variant="secondary">{selected.length} selecionada(s)</Badge>
                  )}
                </div>
                {errors.barriers && (
                  <p id="profile-barriers-error" role="alert" className="text-sm text-destructive">
                    {errors.barriers.message}
                  </p>
                )}
              </div>

              {BARRIER_DIMENSIONS.map((dim) => (
                <div key={dim.key} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {dim.label}
                  </p>
                  {dim.barriers.map((b) => (
                    <label key={b.key} className="flex items-center gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={field.value.includes(b.key)}
                        onCheckedChange={(checked) => {
                          field.onChange(
                            checked
                              ? [...field.value, b.key]
                              : field.value.filter((k) => k !== b.key)
                          );
                        }}
                      />
                      <span className="text-sm">{b.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        />

        <Controller
          control={control}
          name="observation"
          render={({ field }) => (
            <div className="space-y-1">
              <Label htmlFor="observation">Observações adicionais (opcional)</Label>
              <Textarea
                id="observation"
                placeholder="Contextos, comportamentos ou necessidades específicas..."
                className="min-h-[90px] resize-y"
                maxLength={2000}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || null)}
              />
            </div>
          )}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar perfil"}
        </Button>
      </div>
    </form>
  );
}
