/**
 * AppearancePopover — controle de Formato do documento (plano §6.5, D7/D12).
 *
 * Atua sobre os PAGE TOKENS do documento inteiro (fonte, tamanho, espaçamento
 * entre blocos) mais overrides por elemento (enunciado, instrução, alternativas,
 * legenda). Emite `Partial<PageStyle>`; o `StepReview` mescla no `pageStyle` e
 * persiste. Paridade com o PDF é automática (o PDF lê os mesmos tokens).
 *
 * Unidades: o usuário pensa em px (tamanho 11–28); `pageStyle.fontSize` e os
 * tamanhos por elemento são armazenados em pt (paridade direta com o PDF).
 * Conversão px↔pt (px = pt / 0.75) fica isolada aqui.
 */
import { Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { APPEARANCE_FONT_GROUPS } from "@/lib/adaptation/canonical/fontFamily";
import type { PageStyle, ElementFontSizes } from "@/lib/adaptation/canonical/schema";
import type { ResolvedPageStyle } from "@/components/adaptation/render/pageStyle";

/** pt = px * 0.75 (1pt = 1/72in, 1px = 1/96in). */
const PX_TO_PT = 72 / 96;
const ptToPx = (pt: number) => Math.round(pt / PX_TO_PT);
const pxToPt = (px: number) => px * PX_TO_PT;

const FONT_SIZE_MIN_PX = 11;
const FONT_SIZE_MAX_PX = 28;
const SPACING_MIN_PX = 8;
const SPACING_MAX_PX = 40;
const SPACING_STEP_PX = 2;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const ELEMENT_ENTRIES = [
  { key: "stem" as const, label: "Enunciado", testId: "elem-fs-stem" },
  { key: "instruction" as const, label: "Instrução", testId: "elem-fs-instruction" },
  { key: "alternative" as const, label: "Alternativas", testId: "elem-fs-alternative" },
  { key: "caption" as const, label: "Legenda", testId: "elem-fs-caption" },
];

type Props = {
  value: ResolvedPageStyle;
  onChange: (partial: Partial<PageStyle>) => void;
};

/** Stepper "− valor +" com rótulos acessíveis. Exibe botão × de redefinição quando `onReset` fornecido. */
function Stepper({
  label,
  display,
  testId,
  onDecrease,
  onIncrease,
  onReset,
}: {
  label: string;
  display: string;
  testId: string;
  onDecrease: () => void;
  onIncrease: () => void;
  onReset?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <span className="text-sm text-surface-ink">{label}</span>
        {onReset && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-4 w-4 text-muted-foreground"
            aria-label={`Redefinir ${label.toLowerCase()}`}
            onClick={onReset}
          >
            <X className="h-2.5 w-2.5" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-7 w-7"
          aria-label={`Diminuir ${label.toLowerCase()}`}
          onClick={onDecrease}
        >
          −
        </Button>
        <span data-testid={testId} className="w-12 text-center text-sm tabular-nums text-surface-ink">
          {display}
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-7 w-7"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          onClick={onIncrease}
        >
          +
        </Button>
      </div>
    </div>
  );
}

/** Os controles em si (sem o popover) — fáceis de testar isoladamente. */
export function AppearanceControls({ value, onChange }: Props) {
  const sizePx = ptToPx(value.fontSize);
  const efs = value.elementFontSizes ?? {};

  const stepFontSize = (deltaPx: number) => {
    const next = clamp(sizePx + deltaPx, FONT_SIZE_MIN_PX, FONT_SIZE_MAX_PX);
    if (next !== sizePx) onChange({ fontSize: pxToPt(next) });
  };

  const stepSpacing = (deltaPx: number) => {
    const next = clamp(value.blockSpacing + deltaPx, SPACING_MIN_PX, SPACING_MAX_PX);
    if (next !== value.blockSpacing) onChange({ blockSpacing: next });
  };

  const stepElement = (key: keyof ElementFontSizes, deltaPx: number) => {
    const currentPt = efs[key];
    const currentPx = currentPt !== undefined ? ptToPx(currentPt) : sizePx;
    const next = clamp(currentPx + deltaPx, FONT_SIZE_MIN_PX, FONT_SIZE_MAX_PX);
    if (next !== currentPx) onChange({ elementFontSizes: { ...efs, [key]: pxToPt(next) } });
  };

  const resetElement = (key: keyof ElementFontSizes) => {
    const { stem, instruction, alternative, caption } = efs;
    const next: ElementFontSizes = {
      ...(key !== "stem" && stem !== undefined ? { stem } : {}),
      ...(key !== "instruction" && instruction !== undefined ? { instruction } : {}),
      ...(key !== "alternative" && alternative !== undefined ? { alternative } : {}),
      ...(key !== "caption" && caption !== undefined ? { caption } : {}),
    };
    onChange({ elementFontSizes: Object.keys(next).length > 0 ? next : undefined });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="appearance-font" className="text-sm text-surface-ink">
          Fonte
        </label>
        <select
          id="appearance-font"
          className="flex h-9 w-full rounded-md border border-surface-line-2 bg-surface-paper px-3 py-1 text-sm text-surface-ink"
          value={value.fontFamily ?? ""}
          onChange={(e) => onChange({ fontFamily: e.target.value === "" ? undefined : e.target.value })}
        >
          <option value="">Padrão</option>
          {APPEARANCE_FONT_GROUPS.map((group) => (
            <optgroup key={group.group} label={group.label}>
              {group.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <Stepper
        label="Tamanho do texto"
        display={`${sizePx}px`}
        testId="font-size-value"
        onDecrease={() => stepFontSize(-1)}
        onIncrease={() => stepFontSize(1)}
      />

      <Stepper
        label="Espaçamento entre blocos"
        display={`${value.blockSpacing}px`}
        testId="block-spacing-value"
        onDecrease={() => stepSpacing(-SPACING_STEP_PX)}
        onIncrease={() => stepSpacing(SPACING_STEP_PX)}
      />

      <p className="text-xs text-surface-ink-soft">
        As fontes de acessibilidade ajudam leitores com dislexia e baixa visão. A escolha vale
        para a folha e para o PDF.
      </p>

      <hr className="border-surface-line-2" />

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-surface-ink-faint">
          Tamanho por elemento
        </p>
        {ELEMENT_ENTRIES.map(({ key, label, testId }) => {
          const currentPt = efs[key];
          const currentPx = currentPt !== undefined ? ptToPx(currentPt) : sizePx;
          const hasOverride = currentPt !== undefined;
          return (
            <Stepper
              key={key}
              label={label}
              display={`${currentPx}px`}
              testId={testId}
              onDecrease={() => stepElement(key, -1)}
              onIncrease={() => stepElement(key, 1)}
              onReset={hasOverride ? () => resetElement(key) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

export function AppearancePopover({ value, onChange }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="shrink-0 text-surface-ink-soft hover:text-surface-ink">
          <Type className="mr-1 h-4 w-4" /> Formato
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <AppearanceControls value={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

export default AppearancePopover;
