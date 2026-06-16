import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { RichTextField } from "./RichTextField";

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

describe("RichTextField — component", () => {
  it("returns null when editor is not ready", () => {
    vi.mocked(useEditor).mockReturnValueOnce(null as never);
    const { container } = render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("plain mode renders the editor with no toolbar and no border (worksheet-faithful)", () => {
    const { container } = render(<RichTextField plain value={t("a")} onChange={vi.fn()} />);
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
    // no chrome: neither the inline-math button nor the bordered wrapper
    expect(screen.queryByLabelText("Inserir fórmula inline")).not.toBeInTheDocument();
    expect(container.querySelector(".border-input")).toBeNull();
  });

  it("seeds editor content from value", () => {
    render(<RichTextField value={[{ type: "text", text: "seed", marks: ["italic"] }]} onChange={vi.fn()} />);
    expect(capturedConfig?.content).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "seed", marks: [{ type: "italic" }] }] }],
    });
  });

  it("shows only the math button — no format buttons (formatting lives in the BubbleMenu)", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Negrito")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Itálico")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sublinhado")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tachado")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cor do texto")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Inserir fórmula inline")).toBeInTheDocument();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
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

  it("passes ariaLabel into the editor attributes", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} ariaLabel="Alternativa" />);
    const attrs = (capturedConfig as { editorProps?: { attributes?: Record<string, string> } })
      .editorProps?.attributes;
    expect(attrs?.["aria-label"]).toBe("Alternativa");
    expect(attrs?.["data-placeholder"]).toBeDefined();
  });

  it("disables the math button when disabled", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} disabled />);
    expect(screen.getByLabelText("Inserir fórmula inline")).toBeDisabled();
  });
});
