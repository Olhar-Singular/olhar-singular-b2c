import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BARRIER_DIMENSIONS } from "@/lib/barriers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const schema = z.object({
  barriers: z.array(z.string()).min(1, "Selecione pelo menos uma barreira"),
  observation: z.string().max(2000).nullable(),
});

export type BarrierProfileFormValues = z.infer<typeof schema>;

interface Props {
  defaultValues?: Partial<BarrierProfileFormValues>;
  onSubmit: (values: BarrierProfileFormValues) => Promise<void>;
  isPending?: boolean;
}

export function BarrierProfileForm({ defaultValues, onSubmit, isPending }: Props) {
  const { control, handleSubmit, watch, formState: { errors } } = useForm<BarrierProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { barriers: [], observation: null, ...defaultValues },
  });

  const selected = watch("barriers");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Controller
        control={control}
        name="barriers"
        render={({ field }) => (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Barreiras de aprendizagem</span>
              {selected.length > 0 && (
                <Badge variant="secondary">{selected.length} selecionada(s)</Badge>
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

            {errors.barriers && (
              <p className="text-sm text-destructive">{errors.barriers.message}</p>
            )}
          </div>
        )}
      />

      <Controller
        control={control}
        name="observation"
        render={({ field }) => (
          <div className="space-y-1">
            <Label htmlFor="observation">Observações (opcional)</Label>
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

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Salvando..." : "Salvar perfil"}
      </Button>
    </form>
  );
}
