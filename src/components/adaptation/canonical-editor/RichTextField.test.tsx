import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { RichTextField } from "./RichTextField";

// Stub TipTap so we can test the mapping without ProseMirror DOM.
let capturedConfig: { content?: unknown; onUpdate?: (a: { editor: unknown }) => void } | undefined;

const editorMock = {
  chain: vi.fn(),
  isActive: vi.fn().mockReturnValue(false),
  getJSON: vi.fn(),
};

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(),
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content">{String(editor !== null)}</div>
  ),
  BubbleMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ReactNodeViewRenderer: vi.fn(() => "renderer"),
}));

vi.mock("./SelectionBubble", () => ({
  SelectionBubble: () => <div data-testid="selection-bubble" />,
}));

import { useEditor } from "@tiptap/react";

beforeEach(() => {
  vi.clearAllMocks();
  capturedConfig = undefined;
  editorMock.chain = vi.fn();
  editorMock.isActive = vi.fn().mockReturnValue(false);
  editorMock.getJSON = vi.fn();
  vi.mocked(useEditor).mockImplementation((cfg: unknown) => {
    capturedConfig = cfg as typeof capturedConfig;
    return editorMock as never;
  });
});

const t = (text: string): RichText => [{ type: "text", text }];

describe("RichTextField — component", () => {
  it("returns null when editor is not ready", () => {
    vi.mocked(useEditor).mockReturnValueOnce(null as never);
    const { container } = render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("plain mode renders the editor with no border (worksheet-faithful)", () => {
    const { container } = render(<RichTextField plain value={t("a")} onChange={vi.fn()} />);
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
    expect(container.querySelector(".border-input")).toBeNull();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("non-plain mode renders editor with a bordered wrapper and no toolbar buttons", () => {
    const { container } = render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
    expect(container.querySelector(".border-input")).not.toBeNull();
    // formatting lives in BubbleMenu — no per-field toolbar buttons
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("seeds editor content from value", () => {
    render(<RichTextField value={[{ type: "text", text: "seed", marks: ["italic"] }]} onChange={vi.fn()} />);
    expect(capturedConfig?.content).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "seed", marks: [{ type: "italic" }] }] }],
    });
  });

  it("emits RichText via onChange when the doc changes", () => {
    const onChange = vi.fn();
    render(<RichTextField value={t("a")} onChange={onChange} />);
    capturedConfig?.onUpdate?.({
      editor: {
        getJSON: () => ({
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "b", marks: [{ type: "bold" }] }] }],
        }),
      },
    });
    expect(onChange).toHaveBeenCalledWith([{ type: "text", text: "b", marks: ["bold"] }]);
  });

  it("does not emit when the mapped RichText is unchanged", () => {
    const onChange = vi.fn();
    render(<RichTextField value={t("a")} onChange={onChange} />);
    capturedConfig?.onUpdate?.({
      editor: {
        getJSON: () => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] }),
      },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("wraps long text: editor element gets break-words/whitespace-normal, no nowrap/overflow-x", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    const attrs = (capturedConfig as { editorProps?: { attributes?: Record<string, string> } })
      .editorProps?.attributes;
    const cls = attrs?.class ?? "";
    expect(cls).toContain("whitespace-normal");
    expect(cls).toContain("break-words");
    expect(cls).toContain("w-full");
    expect(cls).not.toContain("whitespace-nowrap");
    expect(cls).not.toContain("overflow-x");
  });

  it("field root is flex-1 min-w-0 so it can shrink and wrap inside a flex row", () => {
    const { container } = render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("flex-1");
    expect(root.className).toContain("min-w-0");
  });

  it("renders the SelectionBubble inside a BubbleMenu when not disabled", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    expect(screen.getByTestId("selection-bubble")).toBeInTheDocument();
  });

  it("hides the BubbleMenu when disabled (no formatting on read-only fields)", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} disabled />);
    expect(screen.queryByTestId("selection-bubble")).not.toBeInTheDocument();
  });

  it("hides the BubbleMenu when noBubble is true (image caption / alt fields)", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} noBubble />);
    expect(screen.queryByTestId("selection-bubble")).not.toBeInTheDocument();
  });

  it("applies opacity styles to the container and editor attributes when disabled", () => {
    const { container } = render(<RichTextField value={t("a")} onChange={vi.fn()} disabled />);
    expect((container.firstChild as HTMLElement).className).toContain("opacity-60");
    const attrs = (capturedConfig as { editorProps?: { attributes?: Record<string, string> } })
      .editorProps?.attributes;
    expect(attrs?.class).toContain("opacity-50");
    expect(attrs?.class).toContain("cursor-not-allowed");
  });

  it("passes ariaLabel into the editor attributes", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} ariaLabel="Alternativa" />);
    const attrs = (capturedConfig as { editorProps?: { attributes?: Record<string, string> } })
      .editorProps?.attributes;
    expect(attrs?.["aria-label"]).toBe("Alternativa");
    expect(attrs?.["data-placeholder"]).toBeDefined();
  });
});
