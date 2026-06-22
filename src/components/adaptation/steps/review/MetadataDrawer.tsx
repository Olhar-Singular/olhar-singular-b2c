/**
 * MetadataDrawer — gaveta "Sobre esta adaptação" (plano §6.7 / Fase 5c).
 *
 * Drawer da direita, READ-ONLY, com os metadados pedagógicos que saíram da folha
 * (D10): estratégias aplicadas, dicas de aplicação e justificativa pedagógica.
 * Os dados vêm de `adaptation_result` (irmãos do `document`); a gaveta nunca
 * escreve nada — não toca o documento canônico, então não afeta o round-trip.
 */
import { Info } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategies: string[];
  tips: string[];
  justification: string;
};

/** Cabeçalho de seção da gaveta. */
function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-ink-soft">
      {children}
    </h3>
  );
}

export function MetadataDrawer({ open, onOpenChange, strategies, tips, justification }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[400px] max-w-[92vw] overflow-y-auto border-surface-chrome-line bg-surface-chrome sm:max-w-[400px]"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-surface-ink">
            <Info className="h-4 w-4 text-surface-ink-soft" />
            Sobre esta adaptação
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-6">
          <section className="space-y-2">
            <SectionTitle>Estratégias aplicadas</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {strategies.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-surface-line-2 bg-surface-paper px-2.5 py-1 text-xs text-surface-ink-soft"
                >
                  {s}
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle>Dicas de aplicação</SectionTitle>
            <ol className="space-y-2">
              {tips.map((t, i) => (
                <li key={t} className="flex gap-2 text-sm text-surface-ink">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-accent-soft text-xs font-medium text-surface-accent">
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-2">
            <SectionTitle>Justificativa pedagógica</SectionTitle>
            <p className="rounded-md border border-surface-line-2 bg-surface-paper p-3 text-sm leading-relaxed text-surface-ink">
              {justification}
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default MetadataDrawer;
