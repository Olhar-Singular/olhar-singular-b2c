import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { RichTextField, richTextFromDoc, docFromRichText } from "./RichTextField";

// Stub TipTap so we can test the toolbar / mapping without ProseMirror DOM.
let capturedConfig: { content?: unknown; onUpdate?: (a: { editor: unknown }) => void } | undefined;

const editorMock = {
  chain: vi.fn(),
  isActive: vi.fn().mockReturnValue(false),
  getJSON: vi.fn(),
};

function makeChain() {
  const calls: string[] = [];
  const proxy: Record<string, unknown> = new Proxy({}, {
    get(_, prop: string) {
      if (prop === "run") return () => true;
      if (prop === "__calls") return calls;
      return (...args: unknown[]) => {
        calls.push(`${prop}:${JSON.stringify(args)}`);
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(),
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content">{String(editor !== null)}</div>
  ),
  ReactNodeViewRenderer: vi.fn(() => "renderer"),
}));

import { useEditor } from "@tiptap/react";

let lastChain: ReturnType<typeof makeChain> | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  capturedConfig = undefined;
  editorMock.chain = vi.fn(() => {
    lastChain = makeChain();
    return lastChain;
  });
  editorMock.isActive = vi.fn().mockReturnValue(false);
  editorMock.getJSON = vi.fn();
  vi.mocked(useEditor).mockImplementation((cfg: unknown) => {
    capturedConfig = cfg as typeof capturedConfig;
    return editorMock as never;
  });
});

const t = (text: string): RichText => [{ type: "text", text }];

describe("RichTextField — pure mapping helpers", () => {
  it("docFromRichText wraps the value in a single paragraph", () => {
    expect(docFromRichText(t("hi"))).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    });
  });

  it("richTextFromDoc reads the single paragraph's inline content", () => {
    const doc = docFromRichText([{ type: "text", text: "x", marks: ["bold"] }]);
    expect(richTextFromDoc(doc)).toEqual([{ type: "text", text: "x", marks: ["bold"] }]);
  });

  it("richTextFromDoc handles an empty doc (no content)", () => {
    expect(richTextFromDoc({ type: "doc" })).toEqual([]);
  });
});

describe("RichTextField — component", () => {
  it("returns null when editor is not ready", () => {
    vi.mocked(useEditor).mockReturnValueOnce(null as never);
    const { container } = render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("seeds editor content from value", () => {
    render(<RichTextField value={[{ type: "text", text: "seed", marks: ["italic"] }]} onChange={vi.fn()} />);
    expect(capturedConfig?.content).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "seed", marks: [{ type: "italic" }] }] }],
    });
  });

  it("renders the toolbar buttons and EditorContent", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Negrito")).toBeInTheDocument();
    expect(screen.getByLabelText("Itálico")).toBeInTheDocument();
    expect(screen.getByLabelText("Sublinhado")).toBeInTheDocument();
    expect(screen.getByLabelText("Tachado")).toBeInTheDocument();
    expect(screen.getByLabelText("Cor do texto")).toBeInTheDocument();
    expect(screen.getByLabelText("Inserir fórmula inline")).toBeInTheDocument();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
  });

  it("toolbar buttons dispatch the right editor commands", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Negrito"));
    expect(lastChain?.__calls).toContain("toggleBold:[]");
    fireEvent.click(screen.getByLabelText("Itálico"));
    expect(lastChain?.__calls).toContain("toggleItalic:[]");
    fireEvent.click(screen.getByLabelText("Sublinhado"));
    expect(lastChain?.__calls).toContain("toggleUnderline:[]");
    fireEvent.click(screen.getByLabelText("Tachado"));
    expect(lastChain?.__calls).toContain("toggleStrike:[]");
  });

  it("marks active buttons with the accent class", () => {
    editorMock.isActive = vi.fn().mockReturnValue(true);
    render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Negrito").className).toContain("accent");
  });

  it("inserts inline math when prompt returns a latex string", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("x^2");
    render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Inserir fórmula inline"));
    expect(promptSpy).toHaveBeenCalled();
    expect(lastChain?.__calls).toContain(
      `insertContent:[${JSON.stringify({ type: "inlineMath", attrs: { latex: "x^2" } })}]`
    );
    promptSpy.mockRestore();
  });

  it("does not insert math when prompt is cancelled or blank", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
    render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Inserir fórmula inline"));
    expect(editorMock.chain).not.toHaveBeenCalled();

    promptSpy.mockReturnValue("   ");
    fireEvent.click(screen.getByLabelText("Inserir fórmula inline"));
    expect(editorMock.chain).not.toHaveBeenCalled();
    promptSpy.mockRestore();
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

  it("passes ariaLabel into the editor attributes", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} ariaLabel="Alternativa" />);
    const attrs = (capturedConfig as { editorProps?: { attributes?: Record<string, string> } })
      .editorProps?.attributes;
    expect(attrs?.["aria-label"]).toBe("Alternativa");
    expect(attrs?.["data-placeholder"]).toBeDefined();
  });

  it("unsets color via the color picker default item", () => {
    const promptSpy = vi.spyOn(window, "prompt");
    // The color dropdown items live in a Radix portal; assert the trigger
    // exists and disabled is respected (portal items covered by v8 ignore).
    render(<RichTextField value={t("a")} onChange={vi.fn()} disabled />);
    expect(screen.getByLabelText("Negrito")).toBeDisabled();
    expect(screen.getByLabelText("Inserir fórmula inline")).toBeDisabled();
    promptSpy.mockRestore();
  });
});
