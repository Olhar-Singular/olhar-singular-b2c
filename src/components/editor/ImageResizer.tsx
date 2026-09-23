import { useState, useCallback, useEffect, useRef } from "react";
import { DEFAULT_IMAGE_WIDTH_PX } from "@/components/adaptation/render/pageTokens";

/** Teto que o arraste pode ALCANÇAR por conta própria (ver 0308). */
const MAX_DRAG_WIDTH_PX = 800;

type Props = {
  src: string;
  /**
   * Texto alternativo do bloco, obrigatório de propósito: era um rótulo fixo
   * ("Imagem da questão") e o alt autoral do documento — o mesmo que o
   * read-only, o PDF e o `[Imagem: alt]` do Word usam — sumia na edição.
   */
  alt: string;
  initialWidth?: number;
  onResize: (width: number) => void;
};

export default function ImageResizer({ src, alt, initialWidth, onResize }: Props) {
  // No explicit width → the shared default, kept in sync with the export preview
  // and the PDF so an un-resized image is the same size on every surface.
  const [width, setWidth] = useState(initialWidth ?? DEFAULT_IMAGE_WIDTH_PX);
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  /**
   * The live width, updated synchronously on every mouse move.
   *
   * `setWidth` alone is not enough to COMMIT from: the mouseup handler is
   * created once per drag and closes over the `width` of that render, so
   * `onResize(width)` used to persist the size the image had BEFORE the drag —
   * the sheet showed the new size while the document stored the old one, and
   * the PDF came out a full drag behind. The ref is the value the drag actually
   * produced, so committing from it cannot go stale.
   */
  const widthRef = useRef(width);
  /** Detaches the current drag's document listeners; null when not dragging. */
  const detachRef = useRef<(() => void) | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // A previous drag whose mouseup we never saw (released outside the
      // window) would otherwise leave a second set of handlers on `document`,
      // and the next mouseup would commit twice. Exactly one drag is live.
      detachRef.current?.();

      startX.current = e.clientX;
      startWidth.current = widthRef.current;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX.current;
        /**
         * 0308 — o teto limita o que o ARRASTE acrescenta, nunca o que o
         * documento já tinha. Aplicado ao valor absoluto, ele transformava o
         * gesto de aumentar em perda de dado: uma imagem que vinha do documento
         * com 2400px virava 800px no primeiro arraste para a direita, sem aviso
         * e sem nada mudar na folha (a caixa A4 desenha no máximo ~687px). Se a
         * largura de partida já passa do teto, crescer é no-op e só encolher
         * tem efeito.
         */
        const ceiling = Math.max(MAX_DRAG_WIDTH_PX, startWidth.current);
        const newWidth = Math.max(50, Math.min(ceiling, startWidth.current + delta));
        widthRef.current = newWidth;
        setWidth(newWidth);
      };

      const detach = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        detachRef.current = null;
      };

      const onMouseUp = () => {
        onResize(widthRef.current);
        detach();
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      detachRef.current = detach;
    },
    [onResize]
  );

  // Unmounting mid-drag (image deleted, step left) must not leave the handlers
  // on `document` writing into a component that no longer exists.
  useEffect(() => () => detachRef.current?.(), []);

  return (
    <div
      ref={containerRef}
      /* 0342 — o contorno, a alça e o selo são chrome sobre a folha, que é
         papel e não segue o tema do app: paleta `--sf-*` (surface-*). */
      className="relative inline-block group my-1.5 hover:outline hover:outline-1 hover:outline-offset-2 hover:outline-surface-ink-faint focus-within:outline focus-within:outline-1 focus-within:outline-offset-2 focus-within:outline-surface-ink-faint"
      style={{ width }}
    >
      {/*
        0311 — a moldura de edição (borda + cantos arredondados) vivia no
        próprio <img>: a folha do Revisar mostrava uma figura emoldurada que a
        prévia do Exportar e o PDF não desenham, e a borda ainda comia 2px da
        largura útil. O contorno agora é chrome do wrapper, via `outline` (fora
        do fluxo, não altera a caixa) e só no hover/foco.
      */}
      <img src={src} alt={alt} className="w-full" />
      {/* Resize handle - bottom right corner */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute bottom-0 right-0 w-4 h-4 bg-surface-accent/80 rounded-tl-md cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        title="Arraste para redimensionar"
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
        >
          <line x1="7" y1="1" x2="1" y2="7" />
          <line x1="7" y1="4" x2="4" y2="7" />
        </svg>
      </div>
      {/*
        Width indicator on hover. 0337 — decoração de edição: `opacity-0` não
        remove da árvore de acessibilidade, e como o resizer vive dentro do
        `contenteditable` da folha o "2400px" era lido como conteúdo do
        documento. Fica explicitamente fora da árvore.
      */}
      <div
        aria-hidden="true"
        className="absolute -bottom-5 right-0 text-[0.6rem] text-surface-ink-soft opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {width}px
      </div>
    </div>
  );
}
