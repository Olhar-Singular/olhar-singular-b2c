import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ActivityEditor from "./ActivityEditor";

vi.mock("./EditorToolbar", () => ({
  default: ({ onInsert }: { onInsert: (tpl: string) => void }) => (
    <button onClick={() => onInsert("INSERT_TPL")} data-testid="toolbar-stub">tb</button>
  ),
}));

vi.mock("./ActivityPreview", () => ({
  default: ({ text }: { text: string }) => <div data-testid="preview">{text}</div>,
}));

vi.mock("./ActivityStatusBar", () => ({
  default: ({ text }: { text: string }) => <div data-testid="status">{text.length}</div>,
}));

vi.mock("./ImageManagerModal", () => ({ default: () => <div data-testid="img-modal" /> }));

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
});
