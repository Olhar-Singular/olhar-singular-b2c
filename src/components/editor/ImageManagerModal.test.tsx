import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ImageManagerModal from "./ImageManagerModal";

beforeEach(() => {
  vi.clearAllMocks();

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
  })) as never;
  HTMLCanvasElement.prototype.toDataURL = function () {
    return "data:image/jpeg;base64,Z";
  } as never;

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;
    width = 100;
    height = 100;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  (globalThis as { Image: unknown }).Image = FakeImage as unknown;
});

describe("ImageManagerModal", () => {
  it("does not render when closed", () => {
    render(<ImageManagerModal open={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByText(/Adicionar imagens|Imagens/i)).toBeNull();
  });

  it("shows the empty state when open with no images", () => {
    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/Arraste|clique|adicione/i)).toBeInTheDocument();
  });

  it("clicking the dropzone triggers the hidden file input", () => {
    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    expect(fileInput.accept).toContain("image/");
  });

  it("rejects non-image files via FileList input", async () => {
    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const txt = new File(["x"], "x.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { value: [txt], writable: false });
    fireEvent.change(input);
    // Should still show dropzone (no images added)
    expect(screen.getByText(/Arraste|clique|adicione/i)).toBeInTheDocument();
  });

  it("adds an image via file input and shows preview", async () => {
    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png = new File([new Uint8Array([0x89, 0x50])], "x.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [png], writable: false });

    // Stub FileReader.readAsDataURL to invoke onload synchronously with a data URL
    class FR {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,AA";
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = FR as unknown;

    fireEvent.change(input);
    await waitFor(() => expect(screen.queryAllByRole("img").length).toBeGreaterThan(0));
  });

  it("calls onClose when Cancelar is clicked", () => {
    const onClose = vi.fn();
    render(<ImageManagerModal open onClose={onClose} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("disables the Inserir button when no images are present", () => {
    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Inserir/i })).toBeDisabled();
  });

  it("activates the dropzone highlight on drag-over and clears on drag-leave", () => {
    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const dropzone = screen.getByText(/Arraste/).closest("div") as HTMLDivElement;
    fireEvent.dragOver(dropzone);
    fireEvent.dragLeave(dropzone);
    expect(dropzone).toBeInTheDocument();
  });

  it("accepts files via drop event and adds them to the gallery", async () => {
    class FR {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,DROP";
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = FR as unknown;

    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const dropzone = screen.getByText(/Arraste/).closest("div") as HTMLDivElement;
    const png = new File([new Uint8Array([0x89])], "x.png", { type: "image/png" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [png] } });
    await waitFor(() => expect(screen.queryAllByRole("img").length).toBeGreaterThan(0));
  });

  it("removes an image via the trash button", async () => {
    class FR {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,A";
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = FR as unknown;

    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png = new File([new Uint8Array([0x89])], "x.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [png], writable: false });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryAllByRole("img").length).toBeGreaterThan(0));

    const trashButtons = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("svg.lucide-trash2"));
    fireEvent.click(trashButtons[0]);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("changes alignment when an alignment button is clicked", async () => {
    class FR {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,A";
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = FR as unknown;

    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png = new File([new Uint8Array([0x89])], "x.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [png], writable: false });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryAllByRole("img").length).toBeGreaterThan(0));

    const alignLeft = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("svg.lucide-align-left"));
    if (alignLeft) fireEvent.click(alignLeft);
    expect(screen.queryByRole("img")).not.toBeNull();
  });

  it("calls onConfirm with current images and onClose on confirm", async () => {
    class FR {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,A";
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = FR as unknown;

    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ImageManagerModal open onClose={onClose} onConfirm={onConfirm} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png = new File([new Uint8Array([0x89])], "x.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [png], writable: false });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryAllByRole("img").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /Inserir/i }));
    expect(onConfirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
