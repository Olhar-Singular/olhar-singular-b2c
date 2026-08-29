/**
 * BlockInserter — the "+" overlay layer over the canonical editor (plano §6.4,
 * Fase 5a). Replaces the old top `CanonicalToolbar`.
 *
 * For every gap between top-level blocks it renders a thin hover zone with a "+"
 * menu (`BlockInserterMenu`). Positions come from `editor.view.coordsAtPos`,
 * measured relative to the overlay layer itself, so the affordances track the
 * blocks without being part of the document. The layer is `pointer-events-none`
 * and absolutely positioned — it never shifts the sheet layout nor intercepts
 * typing; only the thin zones opt back into pointer events. Positions recompute
 * on every editor transaction, on scroll/resize e quando o DOM do editor muda de
 * tamanho sem transação (`ResizeObserver`, achado 0247); duas faixas nunca
 * dividem o mesmo retângulo.
 *
 * The component must be placed inside a `position: relative` ancestor that wraps
 * the `EditorContent` (so `inset-0` lines the layer up with the editor DOM).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { topLevelGaps, type BlockGap } from "./topLevelGaps";
import { runInserterAction } from "./insertAtPos";
import { BlockInserterMenu } from "./BlockInserterMenu";
import type { InserterItem } from "./blockInserterItems";

type GapPosition = { gap: BlockGap; top: number };

/**
 * Altura da faixa de hover (`h-4`), em px. Serve de distância mínima entre duas
 * faixas: abaixo disso elas dividiriam o mesmo retângulo e a de baixo ficaria
 * inalcançável por ponteiro (achado 0247).
 */
const ZONE_HEIGHT_PX = 16;

export function BlockInserter({ editor }: { editor: Editor }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<GapPosition[]>([]);

  const recompute = useCallback(() => {
    const layer = layerRef.current;
    /* v8 ignore next -- layer ref is always set after mount */
    if (!layer) return;
    const base = layer.getBoundingClientRect().top;
    /*
      Achado 0247: enquanto um bloco ainda não tem altura (NodeView React que o
      portal só pinta num commit posterior, `<img>` antes de o arquivo carregar,
      KaTeX antes de a fonte chegar), o `coordsAtPos` da lacuna de cima e o da
      lacuna de baixo devolvem o MESMO topo — o `flattenH` do prosemirror-view
      devolve o rect inalterado quando `height == 0`, ignorando o lado pedido.
      As faixas nasciam então empilhadas no mesmo retângulo e o `elementFromPoint`
      entregava sempre a mesma: uma das lacunas ficava sem porta de inserção.
      Forçar a sequência a ser estritamente crescente mantém toda lacuna
      alcançável; assim que o conteúdo pinta, o ResizeObserver abaixo remede e as
      faixas voltam para as coordenadas reais.
    */
    let floor = -Infinity;
    const next = topLevelGaps(editor.state.doc).map((gap) => {
      const top = Math.max(editor.view.coordsAtPos(gap.pos).top - base, floor);
      floor = top + ZONE_HEIGHT_PX;
      return { gap, top };
    });
    setPositions(next);
  }, [editor]);

  useEffect(() => {
    recompute();
    editor.on("transaction", recompute);
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    /*
      Achado 0247 (mesma classe do 0158 na `PageSheet`): o conteúdo ganha altura
      por caminhos que não passam por transação do editor nem por scroll/resize.
      Observar o DOM do editor faz a medição ser função do que está renderizado.
      Sem laço: o overlay é `absolute` e não altera a altura do que observa.
    */
    const observer = new ResizeObserver(recompute);
    observer.observe(editor.view.dom);
    return () => {
      observer.disconnect();
      editor.off("transaction", recompute);
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [editor, recompute]);

  const handlePick = (gap: BlockGap, item: InserterItem) => {
    runInserterAction(editor, gap, item.action);
  };

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0">
      {positions.map(({ gap, top }) => (
        <div
          key={gap.index}
          data-block-gap={gap.index}
          className="group pointer-events-auto absolute inset-x-0 flex h-4 -translate-y-1/2 items-center gap-1"
          style={{ top }}
        >
          <span className="h-px flex-1 bg-surface-accent opacity-0 transition-opacity group-hover:opacity-40" />
          <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <BlockInserterMenu gap={gap} onPick={(item) => handlePick(gap, item)} />
          </span>
          <span className="h-px flex-1 bg-surface-accent opacity-0 transition-opacity group-hover:opacity-40" />
        </div>
      ))}
    </div>
  );
}

export default BlockInserter;
