/**
 * BlockInserter — the "+" overlay layer over the canonical editor (plano §6.4,
 * Fase 5a). Replaces the old top `CanonicalToolbar`.
 *
 * For every gap between top-level blocks it renders a thin hover zone with a "+"
 * menu (`BlockInserterMenu`). Positions come from `editor.view.coordsAtPos`,
 * measured relative to the overlay layer itself, so the affordances track the
 * blocks without being part of the document. The layer is `pointer-events-none`
 * and absolutely positioned: it never shifts the sheet layout nor intercepts
 * typing. A faixa da lacuna atravessa a coluna inteira e fica centrada no topo
 * do bloco seguinte, portanto cobre a primeira linha dele; por isso ela também
 * é `pointer-events-none` e SÓ o alvo do "+" (o `<span>` do meio) reativa o
 * ponteiro (achado 0180) — antes a faixa engolia o clique no texto e o que se
 * digitava sumia. O hover continua funcionando: `:hover` no botão propaga para o
 * `group` e revela as linhas. Positions recompute
 * on every editor transaction, on scroll/resize e quando o DOM do editor muda de
 * tamanho sem transação (`ResizeObserver`, achado 0247). As coordenadas medidas
 * são de viewport (pós-`transform` da folha) e por isso são convertidas para px
 * de layout dividindo pela escala vigente (achado 0246); duas faixas nunca
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
    const layerRect = layer.getBoundingClientRect();
    const base = layerRect.top;
    /*
      Achado 0246: a folha (e este overlay, que vive dentro dela) recebe
      `transform: scale()` da `PageSheet`. Tanto `getBoundingClientRect` quanto o
      `coordsAtPos` do ProseMirror medem em coordenadas de VIEWPORT, ou seja, já
      multiplicadas pela escala; o `top` inline, por outro lado, é interpretado
      em px de LAYOUT, antes do transform. Aplicar a diferença medida direto
      escalava duas vezes e encolhia as faixas contra o topo da folha (a 17,5%
      da distância certa em 390px). Dividir pela escala vigente devolve o valor
      ao espaço de layout — e, de quebra, torna o `top` independente da escala,
      então mudar o degrau de zoom não exige remedição.
    */
    const scale = layer.offsetWidth > 0 ? layerRect.width / layer.offsetWidth : 1;
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
      const top = Math.max((editor.view.coordsAtPos(gap.pos).top - base) / scale, floor);
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
          className="group pointer-events-none absolute inset-x-0 flex h-4 -translate-y-1/2 items-center gap-1"
          style={{ top }}
        >
          <span className="h-px flex-1 bg-surface-accent opacity-0 transition-opacity group-hover:opacity-40" />
          <span
            /*
              Achado 0207: hover é a única forma de revelar o "+" em ponteiro
              fino; em toque não existe hover e o botão ficava invisível na
              folha inteira. `@media (hover: none)` dá a afordância permanente
              a quem não tem ponteiro, sem poluir o desktop.
            */
            className="pointer-events-auto opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <BlockInserterMenu gap={gap} onPick={(item) => handlePick(gap, item)} />
          </span>
          <span className="h-px flex-1 bg-surface-accent opacity-0 transition-opacity group-hover:opacity-40" />
        </div>
      ))}
    </div>
  );
}

export default BlockInserter;
