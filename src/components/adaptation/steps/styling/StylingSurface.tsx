/**
 * StylingSurface — per-node style panel (LEFT) + live preview (RIGHT).
 *
 * Selecting a block reveals controls for its `style` (fontFamily, fontSize,
 * align, color, spacingAfter, pageBreakBefore). Editing a control calls
 * `setBlockStyle` on the SAME document and emits it via `onChange`; the preview
 * re-renders from that one document. There is no sidecar style store.
 */

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { CanonicalRenderer } from "@/components/adaptation/render/CanonicalRenderer";
import { setBlockStyle } from "@/lib/adaptation/canonical/style";
import { ALLOWED_COLORS } from "@/lib/adaptation/canonical/colors";
import type { Block, CanonicalDocument, NodeStyle } from "@/lib/adaptation/canonical/schema";

type Props = {
  document: CanonicalDocument;
  onChange: (doc: CanonicalDocument) => void;
};

const FONT_FAMILIES = ["", "Georgia", "Arial", "Times New Roman", "Verdana"] as const;
const ALIGNMENTS: { value: NodeStyle["align"]; label: string }[] = [
  { value: "left", label: "Esquerda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Direita" },
  { value: "justify", label: "Justificado" },
];

type Selectable = { id: string; label: string };

function blockLabel(block: Block, index: number): string {
  switch (block.type) {
    case "heading":
      return `Título (H${block.level})`;
    case "paragraph":
      return `Parágrafo ${index + 1}`;
    case "blockMath":
      return "Fórmula";
    case "image":
      return "Imagem";
    case "scaffolding":
      return "Apoio";
    case "divider":
      return "Divisória";
    case "question":
      return block.number !== undefined ? `Questão ${block.number}` : "Questão";
  }
}

/** Top-level blocks plus question-stem blocks, in document order. */
function collectSelectable(document: CanonicalDocument): Selectable[] {
  const out: Selectable[] = [];
  document.blocks.forEach((block, i) => {
    out.push({ id: block.id, label: blockLabel(block, i) });
    if (block.type === "question") {
      block.stem.forEach((sb, j) => {
        out.push({ id: sb.id, label: `↳ ${blockLabel(sb, j)}` });
      });
    }
  });
  return out;
}

function findStyle(document: CanonicalDocument, blockId: string): NodeStyle {
  for (const block of document.blocks) {
    if (block.id === blockId) return block.style ?? {};
    if (block.type === "question") {
      const sb = block.stem.find((s) => s.id === blockId);
      if (sb) return sb.style ?? {};
    }
  }
  /* v8 ignore next -- selection ids always come from collectSelectable */
  return {};
}

export function StylingSurface({ document, onChange }: Props) {
  const selectable = collectSelectable(document);
  const [selectedId, setSelectedId] = useState<string>(selectable[0].id);

  const style = findStyle(document, selectedId);

  function patch(partial: Partial<NodeStyle>) {
    const next: NodeStyle = { ...style, ...partial };
    for (const key of Object.keys(next) as (keyof NodeStyle)[]) {
      if (next[key] === undefined) delete next[key];
    }
    onChange(setBlockStyle(document, selectedId, next));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* LEFT — block list + style controls */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="block-select">Bloco</Label>
          <select
            id="block-select"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {selectable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="style-font">Fonte</Label>
          <select
            id="style-font"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={style.fontFamily ?? ""}
            onChange={(e) => patch({ fontFamily: e.target.value || undefined })}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f === "" ? "Padrão" : f}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="style-size">Tamanho (px)</Label>
          <input
            id="style-size"
            type="number"
            min={1}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={style.fontSize ?? ""}
            onChange={(e) =>
              patch({ fontSize: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="style-align">Alinhamento</Label>
          <select
            id="style-align"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={style.align ?? ""}
            onChange={(e) =>
              patch({ align: (e.target.value || undefined) as NodeStyle["align"] })
            }
          >
            <option value="">Padrão</option>
            {ALIGNMENTS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="style-color">Cor</Label>
          <select
            id="style-color"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={style.color ?? ""}
            onChange={(e) => patch({ color: e.target.value || undefined })}
          >
            <option value="">Padrão</option>
            {ALLOWED_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="style-spacing">Espaço depois (px)</Label>
          <input
            id="style-spacing"
            type="number"
            min={0}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={style.spacingAfter ?? ""}
            onChange={(e) =>
              patch({ spacingAfter: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="style-pagebreak"
            type="checkbox"
            checked={style.pageBreakBefore ?? false}
            onChange={(e) => patch({ pageBreakBefore: e.target.checked || undefined })}
          />
          <Label htmlFor="style-pagebreak" className="font-normal cursor-pointer">
            Quebra de página antes
          </Label>
        </div>
      </div>

      {/* RIGHT — live preview */}
      <div className="rounded-md border border-input bg-background p-4">
        <CanonicalRenderer document={document} />
      </div>
    </div>
  );
}

export default StylingSurface;
