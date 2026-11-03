/**
 * AppearancePopover — controle de Formato do documento.
 *
 * Atua sobre os PAGE TOKENS do documento inteiro (fonte, tamanho, espaçamento
 * entre blocos). Emite `Partial<PageStyle>`; o `StepReview` mescla no `pageStyle`
 * e persiste. Paridade com o PDF é automática (o PDF lê os mesmos tokens).
 *
 * Unidades: o usuário pensa em px (tamanho 11–28); `pageStyle.fontSize` é
 * armazenado em pt (paridade direta com o PDF). Conversão px↔pt fica isolada aqui.
 */
import { useRef, useState, type RefObject } from "react";
import { Anchor as PopoverAnchor } from "@radix-ui/react-popover";
import { Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { APPEARANCE_FONT_GROUPS } from "@/lib/adaptation/canonical/fontFamily";
import type { PageStyle } from "@/lib/adaptation/canonical/schema";
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

type Props = {
  value: ResolvedPageStyle;
  onChange: (partial: Partial<PageStyle>) => void;
};

type PopoverProps = Props & {
  /**
   * Achados 0152/0159: superfície que contém a mesa (`page-mesa`) e a folha
   * (`page-sheet`). Ao abrir, o painel mede o vão entre a folha e a mesa e,
   * se um dos lados comporta o painel, ancora NA FOLHA e abre nesse vão (não
   * cobre o papel). Ancorar no embrulho da mesa jogava o painel à esquerda da
   * mesa, sobre a sidebar ou fora da janela. Sem vão, volta ao gatilho.
   */
  anchorRef?: RefObject<HTMLElement | null>;
};

/**
 * Stepper "− valor +" com rótulos acessíveis.
 *
 * O valor não é decoração: ele é uma região viva (`aria-live="polite"`) com `id`,
 * e os dois botões o apontam por `aria-describedby`. Assim o leitor de tela fala o
 * valor atual ao focar o botão e o novo valor a cada clique.
 */
function Stepper({
  label,
  display,
  testId,
  helpId,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
}: {
  label: string;
  display: string;
  testId: string;
  /**
   * Achado 0203: id do parágrafo de ajuda que descreve este controle. Entra no
   * `aria-describedby` dos dois botões junto do valor, para que o leitor de
   * tela anuncie a explicação — e não só o número.
   */
  helpId?: string;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  const describedBy = helpId ? `${testId} ${helpId}` : testId;
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-surface-ink">{label}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-7 w-7 border-surface-line-2 bg-surface-paper text-surface-ink hover:bg-surface-mesa"
          aria-label={`Diminuir ${label.toLowerCase()}`}
          aria-describedby={describedBy}
          disabled={!canDecrease}
          onClick={onDecrease}
        >
          −
        </Button>
        <span
          id={testId}
          data-testid={testId}
          aria-live="polite"
          aria-atomic="true"
          className="w-12 text-center text-sm tabular-nums text-surface-ink"
        >
          {display}
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-7 w-7 border-surface-line-2 bg-surface-paper text-surface-ink hover:bg-surface-mesa"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          aria-describedby={describedBy}
          disabled={!canIncrease}
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

  // O clamp continua sendo a rede: os botões no limite ficam `disabled`, então
  // o clique nem chega aqui — mas um valor fora de faixa vindo do documento não
  // consegue escapar da janela permitida.
  const stepFontSize = (deltaPx: number) => {
    onChange({ fontSize: pxToPt(clamp(sizePx + deltaPx, FONT_SIZE_MIN_PX, FONT_SIZE_MAX_PX)) });
  };

  const stepSpacing = (deltaPx: number) => {
    onChange({ blockSpacing: clamp(value.blockSpacing + deltaPx, SPACING_MIN_PX, SPACING_MAX_PX) });
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
          aria-describedby="appearance-font-help"
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
        {/*
          Achado 0203: esta ajuda descreve o SELECT, então mora colada nele.
          No rodapé do popover ela ficava dois controles abaixo, encostada em
          "Espaçamento entre blocos", e quem lia de cima para baixo associava a
          frase ao controle errado.
        */}
        <p id="appearance-font-help" className="text-xs text-surface-ink-soft">
          As fontes de acessibilidade ajudam leitores com dislexia e baixa visão. A escolha vale
          para a folha e para o PDF.
        </p>
      </div>

      <Stepper
        label="Tamanho do texto"
        display={`${sizePx}px`}
        testId="font-size-value"
        helpId="font-size-help"
        canDecrease={sizePx > FONT_SIZE_MIN_PX}
        canIncrease={sizePx < FONT_SIZE_MAX_PX}
        onDecrease={() => stepFontSize(-1)}
        onIncrease={() => stepFontSize(1)}
      />

      <p id="font-size-help" className="text-xs text-surface-ink-soft">
        Altera o tamanho de toda a prova: títulos, enunciados, instruções e alternativas.
      </p>

      <Stepper
        label="Espaçamento entre blocos"
        display={`${value.blockSpacing}px`}
        testId="block-spacing-value"
        canDecrease={value.blockSpacing > SPACING_MIN_PX}
        canIncrease={value.blockSpacing < SPACING_MAX_PX}
        onDecrease={() => stepSpacing(-SPACING_STEP_PX)}
        onIncrease={() => stepSpacing(SPACING_STEP_PX)}
      />
    </div>
  );
}

/** Largura do painel (`w-72`) e afastamento da âncora: o vão precisa comportar os dois. */
const PANEL_WIDTH_PX = 288;
const SIDE_OFFSET_PX = 12;

type HorizontalSpan = { left: number; right: number };

export type FormatPlacement = {
  anchor: "sheet" | "trigger";
  side: "left" | "right" | "bottom";
  align: "start" | "end";
};

const TRIGGER_PLACEMENT: FormatPlacement = { anchor: "trigger", side: "bottom", align: "end" };

/**
 * Achado 0159: decide onde o painel Formato abre a partir dos retângulos
 * medidos. O Radix não corrige o eixo x com `side="left"` (o `shift` só age no
 * eixo do alinhamento), então a decisão de lado tem que ser tomada aqui: um vão
 * da mesa (limitado pela janela) ao lado da folha só serve se comportar o
 * painel inteiro; senão o painel abre abaixo do gatilho, dentro da janela.
 */
export function resolveFormatPlacement(
  rects: { mesa: HorizontalSpan; sheet: HorizontalSpan; viewportWidth: number } | null,
): FormatPlacement {
  if (!rects) return TRIGGER_PLACEMENT;
  const { mesa, sheet, viewportWidth } = rects;
  const needed = PANEL_WIDTH_PX + SIDE_OFFSET_PX;
  const leftGap = sheet.left - Math.max(mesa.left, 0);
  const rightGap = Math.min(mesa.right, viewportWidth) - sheet.right;
  if (leftGap >= needed) return { anchor: "sheet", side: "left", align: "start" };
  if (rightGap >= needed) return { anchor: "sheet", side: "right", align: "start" };
  return TRIGGER_PLACEMENT;
}

export function AppearancePopover({ value, onChange, anchorRef }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<FormatPlacement>(TRIGGER_PLACEMENT);
  const sheetRef = useRef<HTMLElement | null>(null);

  // Mede no momento de abrir: o vão depende de zoom, sidebar e largura da janela.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      const surface = anchorRef?.current;
      const mesa = surface?.querySelector<HTMLElement>('[data-testid="page-mesa"]');
      const sheet = surface?.querySelector<HTMLElement>('[data-testid="page-sheet"]');
      sheetRef.current = sheet ?? null;
      setPlacement(
        resolveFormatPlacement(
          mesa && sheet
            ? {
                mesa: mesa.getBoundingClientRect(),
                sheet: sheet.getBoundingClientRect(),
                viewportWidth: window.innerWidth,
              }
            : null,
        ),
      );
    }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {placement.anchor === "sheet" && <PopoverAnchor virtualRef={sheetRef as RefObject<HTMLElement>} />}
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Formato"
          title="Formato"
          className="shrink-0 px-2 text-surface-ink-soft hover:text-surface-ink sm:px-3"
        >
          <Type className="h-4 w-4" />
          <span className="hidden sm:ml-1 sm:inline">Formato</span>
        </Button>
      </PopoverTrigger>
      {/*
        Achados 0152/0159: o lado vem de `resolveFormatPlacement`. Com vão, o
        painel sai ao lado da folha, sobre a mesa, e o professor vê o texto
        mudar enquanto clica; sem vão, abre abaixo do gatilho. O
        `collisionPadding` só desloca no eixo do alinhamento: ele não traz de
        volta um painel que estoura no eixo do lado.
      */}
      <PopoverContent
        side={placement.side}
        align={placement.align}
        sideOffset={SIDE_OFFSET_PX}
        data-format-anchor={placement.anchor}
        collisionPadding={16}
        aria-label="Formato"
        className="w-72 border-surface-chrome-line bg-surface-chrome text-surface-ink"
      >
        <AppearanceControls value={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

export default AppearancePopover;
