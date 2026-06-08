import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { SelectionBubbleMenu, shouldShowBubble } from "./SelectionBubbleMenu";

// BubbleMenu is mocked as a passthrough that always renders its children, so we
// can assert on the toolbar buttons without the real floating/positioning glue.
vi.mock("@tiptap/react", () => ({
  BubbleMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bubble-menu">{children}</div>
  ),
}));

// --- fake editor chain -----------------------------------------------------

const run = vi.fn();
const toggleBold = vi.fn(() => chain);
const toggleItalic = vi.fn(() => chain);
const toggleUnderline = vi.fn(() => chain);
const toggleStrike = vi.fn(() => chain);
const setColor = vi.fn(() => chain);
const unsetColor = vi.fn(() => chain);
const focus = vi.fn(() => chain);

const chain = {
  focus,
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  setColor,
  unsetColor,
  run,
};

let isActive: ReturnType<typeof vi.fn>;

function makeEditor(): Editor {
  isActive = vi.fn(() => false);
  return {
    chain: () => chain,
    isActive,
  } as unknown as Editor;
}

let editor: Editor;

beforeEach(() => {
  vi.clearAllMocks();
  editor = makeEditor();
});

describe("SelectionBubbleMenu", () => {
  it("renders the toolbar buttons inside a BubbleMenu", () => {
    render(<SelectionBubbleMenu editor={editor} />);
    expect(screen.getByTestId("bubble-menu")).toBeInTheDocument();
    expect(screen.getByLabelText("Negrito")).toBeInTheDocument();
    expect(screen.getByLabelText("Itálico")).toBeInTheDocument();
    expect(screen.getByLabelText("Sublinhado")).toBeInTheDocument();
    expect(screen.getByLabelText("Tachado")).toBeInTheDocument();
    expect(screen.getByLabelText("Cor")).toBeInTheDocument();
  });

  it("toggles bold on the selection", () => {
    render(<SelectionBubbleMenu editor={editor} />);
    fireEvent.click(screen.getByLabelText("Negrito"));
    expect(focus).toHaveBeenCalled();
    expect(toggleBold).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });

  it("toggles italic on the selection", () => {
    render(<SelectionBubbleMenu editor={editor} />);
    fireEvent.click(screen.getByLabelText("Itálico"));
    expect(toggleItalic).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });

  it("toggles underline on the selection", () => {
    render(<SelectionBubbleMenu editor={editor} />);
    fireEvent.click(screen.getByLabelText("Sublinhado"));
    expect(toggleUnderline).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });

  it("toggles strike on the selection", () => {
    render(<SelectionBubbleMenu editor={editor} />);
    fireEvent.click(screen.getByLabelText("Tachado"));
    expect(toggleStrike).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });

  it("sets a color on the selection", () => {
    render(<SelectionBubbleMenu editor={editor} />);
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "#DC2626" } });
    expect(setColor).toHaveBeenCalledWith("#DC2626");
    expect(run).toHaveBeenCalled();
  });

  it("unsets the color when 'remove' is chosen", () => {
    render(<SelectionBubbleMenu editor={editor} />);
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "__none__" } });
    expect(unsetColor).toHaveBeenCalled();
    expect(setColor).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });

  it("reflects active marks via aria-pressed", () => {
    isActive = vi.fn((name: string) => name === "bold");
    editor = { chain: () => chain, isActive } as unknown as Editor;
    render(<SelectionBubbleMenu editor={editor} />);
    expect(screen.getByLabelText("Negrito")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Itálico")).toHaveAttribute("aria-pressed", "false");
  });

  it("renders nothing when there is no editor", () => {
    const { container } = render(<SelectionBubbleMenu editor={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("shouldShowBubble", () => {
  const withSelection = (empty: boolean) =>
    ({ state: { selection: { empty } } }) as unknown as Editor;

  it("shows when the range is non-empty and the selection is not empty", () => {
    expect(shouldShowBubble({ editor: withSelection(false), from: 2, to: 5 })).toBe(true);
  });

  it("hides when from === to (cursor)", () => {
    expect(shouldShowBubble({ editor: withSelection(false), from: 3, to: 3 })).toBe(false);
  });

  it("hides when the editor selection is empty", () => {
    expect(shouldShowBubble({ editor: withSelection(true), from: 2, to: 5 })).toBe(false);
  });
});
