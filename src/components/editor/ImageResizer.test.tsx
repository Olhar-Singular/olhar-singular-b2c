import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { act } from "@testing-library/react";
import ImageResizer from "./ImageResizer";

describe("ImageResizer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders the image and uses initialWidth when provided", () => {
    render(<ImageResizer src="https://x.png" initialWidth={400} onResize={vi.fn()} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://x.png");
    const wrapper = img.parentElement!;
    expect((wrapper as HTMLElement).style.width).toBe("400px");
  });

  it("uses default 300 width when initialWidth is omitted", () => {
    render(<ImageResizer src="https://y.png" onResize={vi.fn()} />);
    const wrapper = screen.getByRole("img").parentElement!;
    expect((wrapper as HTMLElement).style.width).toBe("300px");
  });

  it("displays width indicator text reflecting current size", () => {
    render(<ImageResizer src="https://x.png" initialWidth={250} onResize={vi.fn()} />);
    expect(screen.getByText("250px")).toBeInTheDocument();
  });

  it("dispatches a mousedown on the handle, drags, and calls onResize on mouseup", () => {
    const onResize = vi.fn();
    render(<ImageResizer src="https://x.png" initialWidth={300} onResize={onResize} />);
    const handle = screen.getByTitle("Arraste para redimensionar");

    fireEvent.mouseDown(handle, { clientX: 100 });

    act(() => {
      const moveEvent = new MouseEvent("mousemove", { clientX: 250, bubbles: true });
      document.dispatchEvent(moveEvent);
      const upEvent = new MouseEvent("mouseup", { bubbles: true });
      document.dispatchEvent(upEvent);
    });

    expect(onResize).toHaveBeenCalled();
  });

  it("clamps width between 50 and 800", () => {
    render(<ImageResizer src="https://x.png" initialWidth={300} onResize={vi.fn()} />);
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
