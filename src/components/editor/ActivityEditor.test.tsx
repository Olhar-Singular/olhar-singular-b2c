import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ActivityEditor from "./ActivityEditor";

vi.mock("./EditorToolbar", () => ({
  default: ({
    onInsert,
    onWrap,
    onImageClick,
    getNextQuestionNumber,
    onUndo,
    onRedo,
  }: {
    onInsert: (tpl: string) => void;
    onWrap: (before: string, after: string) => void;
    onImageClick: () => void;
    getNextQuestionNumber: () => number;
    onUndo: () => void;
    onRedo: () => void;
  }) => (
    <>
      <button onClick={() => onInsert("INSERT_TPL")} data-testid="toolbar-stub">tb</button>
      <button onClick={() => onWrap("**", "**")} data-testid="toolbar-wrap">wrap</button>
      <button onClick={() => onImageClick()} data-testid="toolbar-image">img</button>
      <button onClick={() => onUndo()} data-testid="toolbar-undo">undo</button>
      <button onClick={() => onRedo()} data-testid="toolbar-redo">redo</button>
      <span data-testid="next-q">{getNextQuestionNumber()}</span>
    </>
  ),
}));

vi.mock("./ActivityPreview", () => ({
  default: ({ text }: { text: string }) => <div data-testid="preview">{text}</div>,
}));

vi.mock("./ActivityStatusBar", () => ({
  default: ({ text }: { text: string }) => <div data-testid="status">{text.length}</div>,
}));

vi.mock("./ImageManagerModal", () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    <div data-testid="img-modal" data-open={String(open)}>
      <button onClick={onClose} data-testid="img-modal-close">fechar</button>
    </div>
  ),
}));

describe("ActivityEditor", () => {
  it("renders the textarea with provided value", () => {
    render(<ActivityEditor value="initial" onChange={vi.fn()} />);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(ta.value).toBe("initial");
  });

  it("forwards textarea changes to onChange", () => {
    const onChange = vi.fn();
    render(<ActivityEditor value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "novo" } });
    expect(onChange).toHaveBeenCalledWith("novo");
  });

  it("Ctrl+Z calls onUndo", () => {
    const onUndo = vi.fn();
    render(<ActivityEditor value="" onChange={vi.fn()} onUndo={onUndo} canUndo />);
    const ta = screen.getByRole("textbox");
    fireEvent.keyDown(ta, { key: "z", ctrlKey: true });
    expect(onUndo).toHaveBeenCalled();
  });

  it("Ctrl+Y calls onRedo", () => {
    const onRedo = vi.fn();
    render(<ActivityEditor value="" onChange={vi.fn()} onRedo={onRedo} canRedo />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "y", ctrlKey: true });
    expect(onRedo).toHaveBeenCalled();
  });

  it("Meta+Z (macOS Cmd+Z) calls onUndo (covers metaKey branch line 66)", () => {
    const onUndo = vi.fn();
    render(<ActivityEditor value="" onChange={vi.fn()} onUndo={onUndo} canUndo />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "z", metaKey: true, ctrlKey: false });
    expect(onUndo).toHaveBeenCalled();
  });

  it("keyDown with non-matching key does not call onUndo or onRedo (covers OR false branch)", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(<ActivityEditor value="" onChange={vi.fn()} onUndo={onUndo} onRedo={onRedo} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "a", ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+Z calls onRedo", () => {
    const onRedo = vi.fn();
    render(<ActivityEditor value="" onChange={vi.fn()} onRedo={onRedo} canRedo />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "z", ctrlKey: true, shiftKey: true });
    expect(onRedo).toHaveBeenCalled();
  });

  it("renders toolbar, preview, and status bar", () => {
    render(<ActivityEditor value="hi" onChange={vi.fn()} />);
    expect(screen.getByTestId("toolbar-stub")).toBeInTheDocument();
    expect(screen.getByTestId("preview")).toBeInTheDocument();
    expect(screen.getByTestId("status")).toBeInTheDocument();
  });

  it("toolbar.onInsert appends text and calls onChange", () => {
    const onChange = vi.fn();
    render(<ActivityEditor value="hello" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("toolbar-stub"));
    expect(onChange).toHaveBeenCalled();
    expect(String(onChange.mock.calls.at(-1)?.[0])).toContain("INSERT_TPL");
  });

  it("renders the help toggle and toggles help visibility", () => {
    render(<ActivityEditor value="" onChange={vi.fn()} />);
    const help = screen.getByTitle(/ajuda de sintaxe/i);
    fireEvent.click(help);
    expect(screen.getByText(/Negrito/i)).toBeInTheDocument();
  });

  it("renders image registry quick-pick buttons when registry has entries", () => {
    render(
      <ActivityEditor
        value=""
        onChange={vi.fn()}
        imageRegistry={{ "imagem-1": "https://x.png", "imagem-2": "https://y.png" }}
      />,
    );
    expect(screen.getByText(/imagem-1/)).toBeInTheDocument();
    expect(screen.getByText(/imagem-2/)).toBeInTheDocument();
  });

  it("renders registry image preview as <img> element", () => {
    render(
      <ActivityEditor
        value=""
        onChange={vi.fn()}
        imageRegistry={{ "imagem-1": "https://x.png" }}
      />,
    );
    const imgs = screen.getAllByRole("img");
    expect(imgs.some((i) => i.getAttribute("alt") === "imagem-1")).toBe(true);
  });

  it("typing on textarea updates onChange", () => {
    const onChange = vi.fn();
    render(<ActivityEditor value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });

  it("handleWrap wraps selected text with before/after markers", () => {
    const onChange = vi.fn();
    render(<ActivityEditor value="hello world" onChange={onChange} />);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    // Simulate selection of "hello"
    ta.selectionStart = 0;
    ta.selectionEnd = 5;
    fireEvent.click(screen.getByTestId("toolbar-wrap"));
    expect(onChange).toHaveBeenCalled();
    const newValue: string = onChange.mock.calls.at(-1)?.[0] as string;
    expect(newValue).toContain("**");
  });

  it("handleWrap uses 'texto' placeholder when nothing is selected", () => {
    const onChange = vi.fn();
    render(<ActivityEditor value="abc" onChange={onChange} />);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    // No selection (start === end)
    ta.selectionStart = 1;
    ta.selectionEnd = 1;
    fireEvent.click(screen.getByTestId("toolbar-wrap"));
    expect(onChange).toHaveBeenCalled();
    const newValue: string = onChange.mock.calls.at(-1)?.[0] as string;
    expect(newValue).toContain("texto");
  });

  it("clicking image toolbar button opens the ImageManagerModal", () => {
    render(<ActivityEditor value="" onChange={vi.fn()} />);
    expect(screen.getByTestId("img-modal").dataset.open).toBe("false");
    fireEvent.click(screen.getByTestId("toolbar-image"));
    expect(screen.getByTestId("img-modal").dataset.open).toBe("true");
  });

  it("handleInsert adds no prefix when value is empty", () => {
    const onChange = vi.fn();
    render(<ActivityEditor value="" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("toolbar-stub"));
    expect(onChange).toHaveBeenCalled();
    const newValue: string = onChange.mock.calls.at(-1)?.[0] as string;
    // prefix should be "" because before.length === 0
    expect(newValue).toBe("INSERT_TPL");
  });

  it("handleInsert adds newline prefix when cursor is after non-newline text", () => {
    const onChange = vi.fn();
    render(<ActivityEditor value="hello" onChange={onChange} />);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    // Cursor at end of "hello" (no trailing newline) → prefix should be "\n"
    ta.selectionStart = 5;
    ta.selectionEnd = 5;
    fireEvent.click(screen.getByTestId("toolbar-stub"));
    expect(onChange).toHaveBeenCalled();
    const newValue: string = onChange.mock.calls.at(-1)?.[0] as string;
    expect(newValue).toBe("hello\nINSERT_TPL");
  });

  it("handleInsert adds no prefix when value already ends with newline", () => {
    const onChange = vi.fn();
    render(<ActivityEditor value={"linha\n"} onChange={onChange} />);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    ta.selectionStart = 6;
    ta.selectionEnd = 6;
    fireEvent.click(screen.getByTestId("toolbar-stub"));
    expect(onChange).toHaveBeenCalled();
    const newValue: string = onChange.mock.calls.at(-1)?.[0] as string;
    // No extra \n before INSERT_TPL since before ends with \n
    expect(newValue).toContain("INSERT_TPL");
    expect(newValue.indexOf("INSERT_TPL")).toBe(6);
  });

  it("toolbar undo button calls fallback when onUndo is not provided", () => {
    render(<ActivityEditor value="" onChange={vi.fn()} />);
    expect(() => fireEvent.click(screen.getByTestId("toolbar-undo"))).not.toThrow();
  });

  it("toolbar redo button calls fallback when onRedo is not provided", () => {
    render(<ActivityEditor value="" onChange={vi.fn()} />);
    expect(() => fireEvent.click(screen.getByTestId("toolbar-redo"))).not.toThrow();
  });

  it("getNextQuestionNumber returns 1 when no questions exist", () => {
    render(<ActivityEditor value="" onChange={vi.fn()} />);
    expect(screen.getByTestId("next-q").textContent).toBe("1");
  });

  it("getNextQuestionNumber counts existing questions in value", () => {
    const value = "1) Pergunta A\na) alt1\nb*) alt2\n\n2) Pergunta B\na) alt3\nb*) alt4\n";
    render(<ActivityEditor value={value} onChange={vi.fn()} />);
    expect(screen.getByTestId("next-q").textContent).toBe("3");
  });

  it("debounced effect updates preview after timeout", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<ActivityEditor value="inicial" onChange={vi.fn()} />);
    rerender(<ActivityEditor value="atualizado" onChange={vi.fn()} />);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(screen.getByTestId("preview").textContent).toBe("atualizado");
    vi.useRealTimers();
  });

  it("ImageManagerModal onClose closes the modal", () => {
    render(<ActivityEditor value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("toolbar-image"));
    expect(screen.getByTestId("img-modal").dataset.open).toBe("true");
    fireEvent.click(screen.getByTestId("img-modal-close"));
    expect(screen.getByTestId("img-modal").dataset.open).toBe("false");
  });
});
