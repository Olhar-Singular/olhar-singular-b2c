import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  // 0317 — o bloco da folha precisa distinguir "o usuário escolheu center" do
  // padrão center; sem essa marca o padrão da modal apaga o alinhamento da folha.
  it("marca alignTouched só depois de o usuário clicar num alinhamento", async () => {
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
    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={onConfirm} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png = new File([new Uint8Array([0x89])], "x.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [png], writable: false, configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryAllByRole("img").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /Inserir/i }));
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ align: "center", alignTouched: false }),
    ]);
  });

  it("marca alignTouched ao clicar num botão de alinhamento da modal", async () => {
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
    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={onConfirm} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png = new File([new Uint8Array([0x89])], "y.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [png], writable: false, configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryAllByRole("img").length).toBeGreaterThan(0));

    const alignRight = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("svg.lucide-align-right"))[0];
    fireEvent.click(alignRight);
    fireEvent.click(screen.getByRole("button", { name: /Inserir/i }));
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ align: "right", alignTouched: true }),
    ]);
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

  it("resizes images beyond the print budget via the resize ratio branch", async () => {
    // Override FakeImage to simulate an oversized image (triggers the shrink)
    class BigImage {
      onload: (() => void) | null = null;
      onerror: ((err: unknown) => void) | null = null;
      width = 6000;
      height = 3000;
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

  it("keeps a 2400px scan at print resolution instead of squashing it to 800px (0320)", async () => {
    const drawImage = vi.fn();
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,OUT") as never;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage,
      fillRect: vi.fn(),
      set fillStyle(_v: string) {},
    })) as never;

    class BigImage {
      onload: (() => void) | null = null;
      onerror: ((err: unknown) => void) | null = null;
      width = 2400;
      height = 1200;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { Image: unknown }).Image = BigImage as unknown;

    class FR {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,SCAN";
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = FR as unknown;

    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png = new File([new Uint8Array([0x89])], "scan.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [png], writable: false, configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(drawImage).toHaveBeenCalled());
    const [, , , width] = drawImage.mock.calls[0] as [unknown, number, number, number];
    // 515,28pt de coluna impressa = 7,157in: a 300 ppi isso pede >= 2147px.
    expect(width).toBeGreaterThanOrEqual(2147);
  });

  it("encodes a transparent PNG as PNG (never JPEG, which would flatten alpha onto black)", async () => {
    const toDataURL = vi.fn(() => "data:image/png;base64,OUT");
    HTMLCanvasElement.prototype.toDataURL = toDataURL as never;
    const fillRect = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      fillRect,
      set fillStyle(_v: string) {},
    })) as never;

    class FR {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,ALPHA";
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = FR as unknown;

    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png = new File([new Uint8Array([0x89])], "alpha.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [png], writable: false, configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
    expect(toDataURL).toHaveBeenCalledWith("image/png", undefined);
    expect(fillRect).not.toHaveBeenCalled();
  });

  it("paints a white backdrop before encoding a JPEG, so alpha never composites onto black", async () => {
    const toDataURL = vi.fn(() => "data:image/jpeg;base64,OUT");
    HTMLCanvasElement.prototype.toDataURL = toDataURL as never;
    const fillRect = vi.fn();
    let fill = "";
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      fillRect,
      set fillStyle(v: string) {
        fill = v;
      },
    })) as never;

    class FR {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/jpeg;base64,JPG";
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = FR as unknown;

    render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const jpg = new File([new Uint8Array([0xff])], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [jpg], writable: false, configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.85);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
    expect(fill).toBe("#ffffff");
  });
  // 0348 — a caixa tracejada era um <div> sem role/tabindex, com todo o
  // comportamento no onClick: o teclado nunca chegava ao seletor de arquivos.
  describe("0348 — a área de soltar é operável por teclado", () => {
    it("expõe a caixa como controle focável com nome acessível", () => {
      render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
      const dropzone = screen.getByRole("button", { name: /escolher imagens/i });
      expect(dropzone).toHaveAttribute("tabindex", "0");
    });

    it("alcança a caixa via Tab a partir da abertura do diálogo", async () => {
      const user = userEvent.setup();
      render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
      const dropzone = screen.getByRole("button", { name: /escolher imagens/i });

      for (let i = 0; i < 8 && document.activeElement !== dropzone; i++) {
        await user.tab();
      }
      expect(document.activeElement).toBe(dropzone);
    });

    it("abre o seletor de arquivos com Enter e com Espaço", () => {
      render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, "click").mockImplementation(() => {});
      const dropzone = screen.getByRole("button", { name: /escolher imagens/i });

      fireEvent.keyDown(dropzone, { key: "Enter" });
      expect(clickSpy).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(dropzone, { key: " " });
      expect(clickSpy).toHaveBeenCalledTimes(2);
    });

    it("ignora outras teclas na caixa", () => {
      render(<ImageManagerModal open onClose={vi.fn()} onConfirm={vi.fn()} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, "click").mockImplementation(() => {});
      const dropzone = screen.getByRole("button", { name: /escolher imagens/i });

      fireEvent.keyDown(dropzone, { key: "a" });
      expect(clickSpy).not.toHaveBeenCalled();
    });
  });
});

/**
 * 0349 — o diálogo é aberto por estado (sem `DialogTrigger`), e o gatilho vive
 * dentro do `contenteditable` do ProseMirror, que nem chega a focá-lo no clique.
 * Sem `restoreFocusRef` o foco cai no `<body>` ao fechar.
 */
describe("ImageManagerModal — devolução de foco ao gatilho (0349)", () => {
  function Harness({ withRef }: { withRef: boolean }) {
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const [open, setOpen] = React.useState(true);
    return (
      <>
        <button ref={triggerRef} onClick={() => setOpen(true)}>
          Trocar ou adicionar imagem
        </button>
        <ImageManagerModal
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={vi.fn()}
          restoreFocusRef={withRef ? triggerRef : undefined}
        />
      </>
    );
  }

  it("devolve o foco ao gatilho ao fechar com Escape", async () => {
    render(<Harness withRef />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Trocar ou adicionar imagem" }),
      ),
    );
  });

  it("sem gatilho informado, deixa o Radix cuidar do foco", async () => {
    render(<Harness withRef={false} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "Trocar ou adicionar imagem" }),
    );
  });
});
