import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { act } from "@testing-library/react";
import ImageResizer from "./ImageResizer";

describe("ImageResizer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders the image and uses initialWidth when provided", () => {
    render(<ImageResizer src="https://x.png" alt="ilustração" initialWidth={400} onResize={vi.fn()} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://x.png");
    const wrapper = img.parentElement!;
    expect((wrapper as HTMLElement).style.width).toBe("400px");
  });

  it("uses default 300 width when initialWidth is omitted", () => {
    render(<ImageResizer src="https://y.png" alt="ilustração" onResize={vi.fn()} />);
    const wrapper = screen.getByRole("img").parentElement!;
    expect((wrapper as HTMLElement).style.width).toBe("300px");
  });

  /**
   * 0105 — o alt era `"Imagem da questão"` hardcoded, então o texto alternativo
   * autoral do bloco canônico (usado no read-only, no PDF e no marcador
   * `[Imagem: alt]` do Word) sumia justamente na superfície de edição.
   */
  it("usa o alt recebido em vez de um rótulo genérico fixo", () => {
    render(<ImageResizer src="https://x.png" alt="figura de apoio" onResize={vi.fn()} />);
    expect(screen.getByRole("img")).toHaveAttribute("alt", "figura de apoio");
  });

  /**
   * 0311 — a imagem do editor era desenhada com `border border-zinc-200` e
   * `rounded-md` no PRÓPRIO conteúdo, então a folha do Revisar mostrava uma
   * figura emoldurada e de cantos arredondados enquanto a prévia do Exportar e
   * o PDF saíam sem nada disso (e com 2px a mais de largura útil). Decoração de
   * edição não pode viver no conteúdo impresso: se precisar de contorno, ele é
   * chrome do wrapper (outline, fora do fluxo), só no hover/foco.
   */
  it("não pinta borda nem raio no conteúdo da imagem", () => {
    render(<ImageResizer src="https://x.png" alt="ilustração" onResize={vi.fn()} />);
    const img = screen.getByRole("img");
    expect(img.className).toBe("w-full");
  });

  it("dá o contorno de edição como outline no wrapper, sem entrar no fluxo", () => {
    render(<ImageResizer src="https://x.png" alt="ilustração" onResize={vi.fn()} />);
    const wrapper = screen.getByRole("img").parentElement!;
    expect(wrapper.className).toContain("hover:outline");
    expect(wrapper.className).toContain("focus-within:outline");
  });

  it("displays width indicator text reflecting current size", () => {
    render(<ImageResizer src="https://x.png" alt="ilustração" initialWidth={250} onResize={vi.fn()} />);
    expect(screen.getByText("250px")).toBeInTheDocument();
  });

  /** mousedown on the handle → drag to `toX` → mouseup. */
  function drag(fromX: number, toX: number) {
    const handle = screen.getByTitle("Arraste para redimensionar");
    fireEvent.mouseDown(handle, { clientX: fromX });
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: toX, bubbles: true }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  }

  /**
   * B9 — the committed width must be the width the drag ENDED on.
   *
   * `onMouseUp` used to call `onResize(width)` reading `width` from the closure
   * built at mousedown, while the drag itself only ran `setWidth`. So the sheet
   * showed the new size but `updateAttributes` stored the size the image had
   * BEFORE the drag: every drag persisted the previous drag's result, and the
   * PDF came out one drag behind.
   */
  it("commits the width the drag ENDED on, not the one it started from", () => {
    const onResize = vi.fn();
    render(<ImageResizer src="https://x.png" alt="ilustração" initialWidth={300} onResize={onResize} />);

    drag(100, 250); // +150 → 450

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(450);
    // What the user sees and what was committed must agree.
    expect(screen.getByText("450px")).toBeInTheDocument();
  });

  it("does not lag one drag behind across consecutive drags", () => {
    const onResize = vi.fn();
    render(<ImageResizer src="https://x.png" alt="ilustração" initialWidth={300} onResize={onResize} />);

    drag(100, 200); // +100 → 400
    drag(0, 50); //  +50  → 450

    expect(onResize.mock.calls.map((c) => c[0])).toEqual([400, 450]);
  });

  it("commits the clamped width when the drag runs past the maximum", () => {
    const onResize = vi.fn();
    render(<ImageResizer src="https://x.png" alt="ilustração" initialWidth={300} onResize={onResize} />);

    drag(100, 5000);

    expect(onResize).toHaveBeenCalledWith(800);
  });

  /**
   * A mouseup released outside the window never reaches us, so the next
   * mousedown starts a second drag while the first one's handlers are still
   * attached. Both would then fire on the following mouseup and commit twice —
   * the second one with a width nobody dragged to.
   */
  it("commits once when a drag starts before the previous mouseup arrived", () => {
    const onResize = vi.fn();
    render(<ImageResizer src="https://x.png" alt="ilustração" initialWidth={300} onResize={onResize} />);
    const handle = screen.getByTitle("Arraste para redimensionar");

    // First drag: no mouseup (lost outside the window).
    fireEvent.mouseDown(handle, { clientX: 100 });
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 150, bubbles: true }));
    });

    // Second drag, started without the first having ended.
    fireEvent.mouseDown(handle, { clientX: 0 });
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 100, bubbles: true }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(450); // 350 (after drag 1) + 100
  });

  /**
   * The listeners lived on `document` and were only detached on mouseup, so a
   * component unmounted mid-drag (deleting the image, leaving the step) left
   * them attached — still writing to a dead component on every mouse move.
   */
  it("detaches its document listeners when unmounted mid-drag", () => {
    const onResize = vi.fn();
    const { unmount } = render(
      <ImageResizer src="https://x.png" alt="ilustração" initialWidth={300} onResize={onResize} />,
    );
    fireEvent.mouseDown(screen.getByTitle("Arraste para redimensionar"), { clientX: 100 });

    const removeSpy = vi.spyOn(document, "removeEventListener");
    unmount();

    const removed = removeSpy.mock.calls.map((c) => c[0]);
    expect(removed).toContain("mousemove");
    expect(removed).toContain("mouseup");

    // And a stray mouseup afterwards must not commit anything.
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    expect(onResize).not.toHaveBeenCalled();
    removeSpy.mockRestore();
  });

  it("clamps width between 50 and 800", () => {
    render(<ImageResizer src="https://x.png" alt="ilustração" initialWidth={300} onResize={vi.fn()} />);
    const handle = screen.getByTitle("Arraste para redimensionar");
    fireEvent.mouseDown(handle, { clientX: 100 });
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 5000, bubbles: true }));
    });
    expect(screen.getByText("800px")).toBeInTheDocument();

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: -5000, bubbles: true }));
    });
    expect(screen.getByText("50px")).toBeInTheDocument();

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  });
});
