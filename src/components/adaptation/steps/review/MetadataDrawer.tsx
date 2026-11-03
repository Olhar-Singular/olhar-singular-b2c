/**
 * MetadataDrawer — gaveta "Sobre esta adaptação" (plano §6.7 / Fase 5c).
 *
 * Drawer da direita, READ-ONLY, com os metadados pedagógicos que saíram da folha
 * (D10): estratégias aplicadas, dicas de aplicação e justificativa pedagógica.
 * Os dados vêm de `adaptation_result` (irmãos do `document`); a gaveta nunca
 * escreve nada — não toca o documento canônico, então não afeta o round-trip.
 */
import type { RefObject } from "react";
import { Info } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 0349 — a gaveta é aberta por estado, sem `SheetTrigger`, então o Radix não
   * tem `triggerRef` e restaura o foco no `previouslyFocusedElement` (na prática,
   * o `<body>`). Quem abre entrega aqui o controle que deve voltar a receber o
   * foco no fechamento (WCAG 2.4.3).
   */
  restoreFocusRef?: RefObject<HTMLElement>;
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

export function MetadataDrawer({
  open,
  onOpenChange,
  restoreFocusRef,
  strategies,
  tips,
  justification,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        onCloseAutoFocus={(event) => {
          const trigger = restoreFocusRef?.current;
          if (!trigger) return;
          event.preventDefault();
          trigger.focus();
        }}
        className={[
          "w-[400px] max-w-[92vw] overflow-y-auto border-surface-chrome-line bg-surface-chrome sm:max-w-[400px]",
          // 0367 — o botão de fechar é injetado pelo `SheetContent` (shadcn,
          // `src/components/ui/*` é protegido) sem padding nem tamanho: a caixa era
          // a do ícone, 16 x 16, abaixo dos 24 x 24 CSS px do WCAG 2.2 SC 2.5.8 (AA).
          // Quem consome cresce o alvo: ele é o único filho DIRETO `<button>` do
          // content, e o `-m-1` devolve o `p-1` ao posicionamento, para o ícone
          // continuar onde estava — cresce a caixa, não o desenho.
          "[&>button]:-m-1 [&>button]:flex [&>button]:min-h-[24px] [&>button]:min-w-[24px]",
          "[&>button]:items-center [&>button]:justify-center [&>button]:p-1",
        ].join(" ")}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-surface-ink">
            <Info className="h-4 w-4 text-surface-ink-soft" />
            Sobre esta adaptação
          </SheetTitle>
          <SheetDescription className="text-left text-surface-ink-soft">
            Resumo pedagógico somente leitura desta adaptação: estratégias aplicadas,
            dicas de aplicação e justificativa.
          </SheetDescription>
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
            {/* 0266 — citação (filete à esquerda), não caixa: borda nos quatro lados +
                rounded-md + fundo de papel é a silhueta do Input, e a gaveta é só leitura. */}
            <p className="border-l-2 border-surface-line-2 pl-3 text-sm leading-relaxed text-surface-ink">
              {justification}
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default MetadataDrawer;
