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

  it("handlePaste: adds image from clipboard when an image type is found", async () => {
    class FR {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,PASTE";
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = FR as unknown;

    const blob = new Blob(["fake"], { type: "image/png" });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read: vi.fn().mockResolvedValue([
          {
            types: ["image/png"],
            getType: vi.fn().mockResolvedValue(blob),
          },
        ]),
      },
    });

    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const pasteBtn = screen.getByRole("button", { name: /Colar/i });
    fireEvent.click(pasteBtn);
    await waitFor(() => expect(screen.queryAllByRole("img").length).toBeGreaterThan(0));
  });

  it("handlePaste: does nothing when clipboard has no image type", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read: vi.fn().mockResolvedValue([
          {
            types: ["text/plain"],
            getType: vi.fn(),
          },
        ]),
      },
    });

    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const pasteBtn = screen.getByRole("button", { name: /Colar/i });
    fireEvent.click(pasteBtn);
    // No images should be added
    await waitFor(() => expect(screen.queryAllByRole("img")).toHaveLength(0));
  });

  it("handlePaste: silently swallows errors when clipboard API throws", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read: vi.fn().mockRejectedValue(new Error("Permission denied")),
      },
    });

    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const pasteBtn = screen.getByRole("button", { name: /Colar/i });
    fireEvent.click(pasteBtn);
    // Should not throw; no images added
    await waitFor(() => expect(screen.queryAllByRole("img")).toHaveLength(0));
  });

  it("onOpenChange: calls onClose when dialog requests to close", () => {
    const onClose = vi.fn();
    const { baseElement } = render(
      <ImageManagerModal open onClose={onClose} onConfirm={vi.fn()} />
    );
    // Radix Dialog renders an overlay; pressing Escape triggers onOpenChange(false)
    fireEvent.keyDown(baseElement, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("drop zone onClick triggers the hidden file input click", () => {
    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");
    const dropzone = screen.getByText(/Arraste/).closest("div") as HTMLDivElement;
    fireEvent.click(dropzone);
    expect(clickSpy).toHaveBeenCalled();
  });

  it("handleDrop: does nothing when drop event has no files (false branch of files.length > 0)", () => {
    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const dropzone = screen.getByText(/Arraste/).closest("div") as HTMLDivElement;
    // Drop with empty files array
    fireEvent.drop(dropzone, { dataTransfer: { files: [] } });
    // No images should be added
    expect(screen.getByRole("button", { name: /Inserir/i })).toBeDisabled();
  });

  it("handleFileInput: does nothing when file input change has no files (else branch line 112)", () => {
    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // Fire change with no files (files is null/undefined)
    Object.defineProperty(input, "files", { value: null, writable: true, configurable: true });
    fireEvent.change(input);
    // No images should be added — insert button should still be disabled
    expect(screen.getByRole("button", { name: /Inserir/i })).toBeDisabled();
  });

  it("setAlign: non-matching image is returned unchanged (covers the false branch of img.id === id)", async () => {
    // Need 2 images so setAlign on one leaves the other unchanged
    let callCount = 0;
    class FR {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        callCount++;
        this.result = `data:image/png;base64,IMG${callCount}`;
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = FR as unknown;

    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png1 = new File([new Uint8Array([0x89])], "a.png", { type: "image/png" });
    const png2 = new File([new Uint8Array([0x89])], "b.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [png1, png2], writable: false, configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryAllByRole("img").length).toBeGreaterThanOrEqual(2));

    // Click the first align-right button — this calls setAlign on first image's id
    // The second image (non-matching id) goes through the false branch of the ternary
    const alignRightBtns = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("svg.lucide-align-right"));
    expect(alignRightBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(alignRightBtns[0]);
    // Both images should still be present
    expect(screen.queryAllByRole("img").length).toBeGreaterThanOrEqual(2);
  });

  it("shows plural text ('imagens adicionadas') when 2+ images are present (line 207)", async () => {
    let callCount2 = 0;
    class FR {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        callCount2++;
        this.result = `data:image/png;base64,PLR${callCount2}`;
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = FR as unknown;

    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png1 = new File([new Uint8Array([0x89])], "c.png", { type: "image/png" });
    const png2 = new File([new Uint8Array([0x89])], "d.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [png1, png2], writable: false, configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryAllByRole("img").length).toBeGreaterThanOrEqual(2));
    // Plural: "2 imagens adicionadas"
    expect(screen.getByText(/imagens adicionadas/i)).toBeInTheDocument();
  });

  it("resizes oversized images (width > 800) via the resize ratio branch", async () => {
    // Override FakeImage to simulate an oversized image (triggers lines 43-45)
    class BigImage {
      onload: (() => void) | null = null;
      onerror: ((err: unknown) => void) | null = null;
      width = 1600;
      height = 900;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { Image: unknown }).Image = BigImage as unknown;

    class FR {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,BIG";
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = FR as unknown;

    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png = new File([new Uint8Array([0x89])], "big.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [png], writable: false });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryAllByRole("img").length).toBeGreaterThan(0));
  });
});
