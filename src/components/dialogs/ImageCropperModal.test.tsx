import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ImageCropperModal from "./ImageCropperModal";

const uploadSpy = vi.fn();
const getPublicUrlSpy = vi.fn();
const insertSpy = vi.fn();
const getSessionSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => uploadSpy(...args),
        getPublicUrl: (...args: unknown[]) => getPublicUrlSpy(...args),
      }),
    },
    auth: { getSession: (...args: unknown[]) => getSessionSpy(...args) },
    from: vi.fn(() => ({
      insert: (...args: unknown[]) => insertSpy(...args),
    })),
  },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  uploadSpy.mockResolvedValue({ error: null });
  getPublicUrlSpy.mockReturnValue({ data: { publicUrl: "https://uploaded.png" } });
  insertSpy.mockResolvedValue({ error: null });
  getSessionSpy.mockResolvedValue({ data: { session: { access_token: "tok" } } });
  fetchMock.mockReset();

  // Stub canvas.toBlob and getContext for jsdom
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  })) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb) {
    cb(new Blob(["fake"], { type: "image/png" }));
  } as never;
});

function selectFile(input: HTMLInputElement, type = "image/png") {
  const file = new File([new Uint8Array([0x89])], "x.png", { type });
  Object.defineProperty(input, "files", { value: [file], writable: false });
  fireEvent.change(input);
}

describe("ImageCropperModal — render", () => {
  it("does not render when closed", () => {
    render(<ImageCropperModal open={false} onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByText(/Recortar/)).toBeNull();
  });

  it("shows the dropzone label when open without image", () => {
    render(<ImageCropperModal open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText(/Clique para selecionar/)).toBeInTheDocument();
  });

  it("rejects non-image files via toast.error", async () => {
    const { toast } = await import("sonner");
    render(<ImageCropperModal open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    selectFile(input, "application/pdf");
    expect(toast.error).toHaveBeenCalledWith("Selecione uma imagem");
  });
});

describe("ImageCropperModal — save flow", () => {
  it("loads image preview after selecting a valid image", async () => {
    render(<ImageCropperModal open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    selectFile(input);
    await waitFor(() => expect(screen.getByAltText("Preview")).toBeInTheDocument());
  });

  it("disables Salvar/Extrair buttons when no crop region is selected", async () => {
    render(<ImageCropperModal open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    selectFile(input);
    await waitFor(() => screen.getByAltText("Preview"));
    expect(screen.getByRole("button", { name: /Salvar Recorte/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Extrair Texto/ })).toBeDisabled();
  });

  it("renders the crop helper instruction text once an image is loaded", async () => {
    render(<ImageCropperModal open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    selectFile(input);
    await waitFor(() => expect(screen.getByText(/Clique e arraste/)).toBeInTheDocument());
  });
});
