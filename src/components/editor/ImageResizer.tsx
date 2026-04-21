import { useState, useCallback, useRef } from "react";

type Props = {
  src: string;
  initialWidth?: number;
  onResize: (width: number) => void;
};

export default function ImageResizer({ src, initialWidth, onResize }: Props) {
  const [width, setWidth] = useState(initialWidth || 300);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta = ev.clientX - startX.current;
        const newWidth = Math.max(50, Math.min(800, startWidth.current + delta));
        setWidth(newWidth);
      };

      const onMouseUp = () => {
        if (dragging.current) {
          dragging.current = false;
          onResize(width);
        }
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width, onResize]
  );

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
