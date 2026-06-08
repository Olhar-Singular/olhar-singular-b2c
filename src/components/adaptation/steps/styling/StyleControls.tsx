/**
 * StyleControls — the body of the Estilo popover for ONE block.
 *
 * Pure presentational controls for the current block's `NodeStyle` (font, size,
 * align, spacing, color) plus whole-block quick toggles (bold / italic / color).
 * It owns no document state: every change is reported through callbacks so the
 * parent applies it via the tested helpers (`setBlockStyle`, `applyMarkToBlock`,
 * `applyColorToBlock`). Minimalist by design.
 */

import { Bold, Italic } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ALLOWED_COLORS } from "@/lib/adaptation/canonical/colors";
import { FONT_FAMILY_OPTIONS } from "@/lib/adaptation/canonical/fontFamily";
import type { NodeStyle } from "@/lib/adaptation/canonical/schema";

const ALIGNMENTS: { value: NonNullable<NodeStyle["align"]>; label: string }[] = [
  { value: "left", label: "Esquerda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Direita" },
  { value: "justify", label: "Justificado" },
];

export interface StyleControlsProps {
  style: NodeStyle;
  onPatch: (partial: Partial<NodeStyle>) => void;
  onToggleMark: (mark: "bold" | "italic") => void;
  onColorBlock: (color: string | null) => void;
}

export function StyleControls({ style, onPatch, onToggleMark, onColorBlock }: StyleControlsProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Texto</Label>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Negrito"
            title="Negrito (bloco inteiro)"
            onClick={() => onToggleMark("bold")}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Itálico"
            title="Itálico (bloco inteiro)"
            onClick={() => onToggleMark("italic")}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <select
            aria-label="Cor do texto"
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value=""
            onChange={(e) => onColorBlock(e.target.value === "__none__" ? null : e.target.value)}
          >
            <option value="" disabled>
              Cor…
            </option>
            <option value="__none__">Remover cor</option>
            {ALLOWED_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="style-font" className="text-xs">
          Fonte
        </Label>
        <select
          id="style-font"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={style.fontFamily ?? ""}
          onChange={(e) => onPatch({ fontFamily: e.target.value || undefined })}
        >
          <option value="">Padrão</option>
          {FONT_FAMILY_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="style-size" className="text-xs">
            Tamanho (px)
          </Label>
          <input
            id="style-size"
            type="number"
            min={1}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={style.fontSize ?? ""}
            onChange={(e) =>
              onPatch({ fontSize: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="style-spacing" className="text-xs">
            Espaçamento (px)
          </Label>
          <input
            id="style-spacing"
            type="number"
            min={0}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={style.spacingAfter ?? ""}
            onChange={(e) =>
              onPatch({ spacingAfter: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="style-align" className="text-xs">
          Alinhamento
        </Label>
        <select
          id="style-align"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={style.align ?? ""}
          onChange={(e) => onPatch({ align: (e.target.value || undefined) as NodeStyle["align"] })}
        >
          <option value="">Padrão</option>
          {ALIGNMENTS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="style-color" className="text-xs">
          Cor do bloco
        </Label>
        <select
          id="style-color"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={style.color ?? ""}
          onChange={(e) => onPatch({ color: e.target.value || undefined })}
        >
          <option value="">Padrão</option>
          {ALLOWED_COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default StyleControls;
