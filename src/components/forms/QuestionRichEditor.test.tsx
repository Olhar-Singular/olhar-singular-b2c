import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QuestionRichEditor from "./QuestionRichEditor";

// Stub the TipTap editor so we can test the toolbar without ProseMirror DOM.
const editorMock = {
  chain: vi.fn(),
  isActive: vi.fn().mockReturnValue(false),
  can: vi.fn().mockReturnValue({ undo: () => true, redo: () => true }),
  getHTML: () => "<p>x</p>",
};

const chainObj: Record<string, unknown> = {};
function makeChain() {
  const proxy: Record<string, unknown> = new Proxy({}, {
    get(_, prop: string) {
      if (prop === "run") return () => true;
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(),
  EditorContent: ({ editor }: { editor: unknown }) => <div data-testid="editor-content">{String(editor !== null)}</div>,
}));

vi.mock("@/lib/tiptap/latexExtension", () => ({
  LatexExtension: { name: "latex" },
  latexStyles: ".latex {}",
}));

import { useEditor } from "@tiptap/react";

beforeEach(() => {
  vi.clearAllMocks();
  void chainObj;
  editorMock.chain = vi.fn(() => makeChain());
  editorMock.isActive = vi.fn().mockReturnValue(false);
  editorMock.can = vi.fn().mockReturnValue({ undo: () => true, redo: () => true });
  vi.mocked(useEditor).mockReturnValue(editorMock as never);
});

describe("QuestionRichEditor", () => {
  it("returns null when editor is not ready", () => {
    vi.mocked(useEditor).mockReturnValueOnce(null as never);
    const { container } = render(<QuestionRichEditor value="" onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders toolbar buttons and EditorContent when editor is ready", () => {
    render(<QuestionRichEditor value="<p>oi</p>" onChange={vi.fn()} />);
    expect(screen.getByTitle(/Negrito/)).toBeInTheDocument();
    expect(screen.getByTitle(/Itálico/)).toBeInTheDocument();
    expect(screen.getByTitle(/Sublinhado/)).toBeInTheDocument();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
  });

  it("dispatches editor.chain on toolbar clicks", () => {
    render(<QuestionRichEditor value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByTitle(/Negrito/));
    fireEvent.click(screen.getByTitle(/Itálico/));
    fireEvent.click(screen.getByTitle(/Sublinhado/));
    fireEvent.click(screen.getByTitle(/Tachado/));
    fireEvent.click(screen.getByTitle(/Subscrito/));
    fireEvent.click(screen.getByTitle(/Sobrescrito/));
    fireEvent.click(screen.getByTitle(/^Lista$/));
    fireEvent.click(screen.getByTitle(/Lista numerada/));
    fireEvent.click(screen.getByTitle(/Desfazer/));
    fireEvent.click(screen.getByTitle(/Refazer/));
    expect(editorMock.chain).toHaveBeenCalled();
  });

  it("disables toolbar buttons when undo/redo is not possible", () => {
    editorMock.can = vi.fn().mockReturnValue({ undo: () => false, redo: () => false });
    render(<QuestionRichEditor value="" onChange={vi.fn()} disabled />);
    expect(screen.getByTitle(/Desfazer/)).toBeDisabled();
    expect(screen.getByTitle(/Refazer/)).toBeDisabled();
  });

  it("renders compact variant with smaller spacing", () => {
    render(<QuestionRichEditor value="" onChange={vi.fn()} compact />);
    expect(screen.getByTitle(/Negrito/)).toBeInTheDocument();
  });

  it("forwards onUpdate to onChange via editor.getHTML()", () => {
    const onChange = vi.fn();
    let captured: ((args: { editor: unknown }) => void) | undefined;
    vi.mocked(useEditor).mockImplementation((cfg: unknown) => {
      const c = cfg as { onUpdate: (a: { editor: unknown }) => void };
      captured = c.onUpdate;
      return editorMock as never;
    });
    render(<QuestionRichEditor value="" onChange={onChange} />);
    captured?.({ editor: { getHTML: () => "<p>NEW</p>" } });
    expect(onChange).toHaveBeenCalledWith("<p>NEW</p>");
  });

  it("renders Marca-texto dropdown trigger", () => {
    render(<QuestionRichEditor value="" onChange={vi.fn()} />);
    expect(screen.getByTitle(/Marca-texto/i)).toBeInTheDocument();
  });

  it("renders Cor do texto dropdown trigger", () => {
    render(<QuestionRichEditor value="" onChange={vi.fn()} />);
    expect(screen.getByTitle(/Cor do texto/i)).toBeInTheDocument();
  });

  it("renders Fonte dropdown trigger", () => {
    render(<QuestionRichEditor value="" onChange={vi.fn()} />);
    expect(screen.getByTitle(/Fonte/i)).toBeInTheDocument();
  });

  it("renders Tamanho dropdown trigger", () => {
    render(<QuestionRichEditor value="" onChange={vi.fn()} />);
    expect(screen.getByTitle(/Tamanho/i)).toBeInTheDocument();
  });

  it("highlight active state shows the active style class on toolbar trigger", () => {
    editorMock.isActive = vi.fn((m: string) => m === "highlight");
    render(<QuestionRichEditor value="" onChange={vi.fn()} />);
    const button = screen.getByTitle(/Marca-texto/i);
    expect(button.className).toContain("accent");
  });
});
