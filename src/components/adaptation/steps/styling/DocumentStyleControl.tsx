/**
 * DocumentStyleControl — the document-level "apply to all blocks" control.
 *
 * A compact popover at the top of the Estilo step that collects a `NodeStyle`
 * (Fonte / Tamanho / Cor / Alinhamento) and applies it to EVERY block at once
 * via `applyStyleToAllBlocks` (the parent wires `onApplyToAll` to that helper +
 * `onChange`). This is the document level of the three formatting tiers
 * (document → block → selection). Minimalist by design: it owns only the
 * in-progress draft style, never the document.
 */

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ALLOWED_COLORS } from "@/lib/adaptation/canonical/colors";
import { FONT_FAMILY_OPTIONS } from "@/lib/adaptation/canonical/fontFamily";
import type { NodeStyle } from "@/lib/adaptation/canonical/schema";

const ALIGNMENTS: { value: NonNullable<NodeStyle["align"]>; label: string }[] = [
  { value: "left", label: "Esquerda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Direita" },
  { value: "justify", label: "Justificado" },
];

type Props = {
  onApplyToAll: (style: NodeStyle) => void;
};

export function DocumentStyleControl({ onApplyToAll }: Props) {
  const [fontFamily, setFontFamily] = useState("");
  const [fontSize, setFontSize] = useState("");
  const [color, setColor] = useState("");
  const [align, setAlign] = useState("");

  const apply = () => {
    const style: NodeStyle = {};
    if (fontFamily) style.fontFamily = fontFamily;
    if (fontSize) style.fontSize = Number(fontSize);
    if (color) style.color = color;
    if (align) style.align = align as NonNullable<NodeStyle["align"]>;
    onApplyToAll(style);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1">
          <Settings2 className="h-4 w-4" />
          Estilo do documento
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <p className="text-xs text-muted-foreground">Aplica a aparência a todos os blocos.</p>

        <div className="space-y-1.5">
          <Label htmlFor="doc-font" className="text-xs">
            Fonte
          </Label>
          <select
            id="doc-font"
            aria-label="Fonte"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
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
            <Label htmlFor="doc-size" className="text-xs">
              Tamanho (px)
            </Label>
            <input
              id="doc-size"
              type="number"
              min={1}
              aria-label="Tamanho (px)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-color" className="text-xs">
              Cor
            </Label>
            <select
              id="doc-color"
              aria-label="Cor"
              className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              value={color}
              onChange={(e) => setColor(e.target.value)}
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

        <div className="space-y-1.5">
          <Label htmlFor="doc-align" className="text-xs">
            Alinhamento
          </Label>
          <select
            id="doc-align"
            aria-label="Alinhamento"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={align}
            onChange={(e) => setAlign(e.target.value)}
          >
            <option value="">Padrão</option>
            {ALIGNMENTS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="button" size="sm" className="w-full" onClick={apply}>
          Aplicar a tudo
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export default DocumentStyleControl;
