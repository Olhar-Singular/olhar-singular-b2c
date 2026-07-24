import { useState, useCallback, useEffect, useRef } from "react";
import { DEFAULT_IMAGE_WIDTH_PX } from "@/components/adaptation/render/pageTokens";

type Props = {
  src: string;
  initialWidth?: number;
  onResize: (width: number) => void;
};

export default function ImageResizer({ src, initialWidth, onResize }: Props) {
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
        const newWidth = Math.max(50, Math.min(800, startWidth.current + delta));
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
      className="relative inline-block group my-1.5"
      style={{ width }}
    >
      <img
        src={src}
        alt="Imagem da questão"
        className="w-full rounded-md border border-zinc-200"
      />
      {/* Resize handle - bottom right corner */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute bottom-0 right-0 w-4 h-4 bg-primary/80 rounded-tl-md cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
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
      {/* Width indicator on hover */}
      <div className="absolute -bottom-5 right-0 text-[0.6rem] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
        {width}px
      </div>
    </div>
  );
}
