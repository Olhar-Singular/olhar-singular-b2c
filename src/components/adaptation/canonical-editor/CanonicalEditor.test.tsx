import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { safeParseDocument } from "@/lib/adaptation/canonical/validate";
import { CanonicalEditor } from "./CanonicalEditor";

vi.mock("@tiptap/react", () => ({
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content">{String(editor !== null)}</div>
  ),
}));

const useCanonicalEditor = vi.fn();
vi.mock("./useCanonicalEditor", () => ({
  useCanonicalEditor: (opts: unknown) => useCanonicalEditor(opts),
}));

vi.mock("./CanonicalToolbar", () => ({
  CanonicalToolbar: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="toolbar">{disabled ? "disabled" : "enabled"}</div>
  ),
}));

const doc: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [{ id: "11111111-1111-4111-8111-111111111111", type: "paragraph", content: [{ type: "text", text: "hi" }] }],
};

beforeEach(() => vi.clearAllMocks());

describe("CanonicalEditor", () => {
  it("returns null while the editor is not ready", () => {
    useCanonicalEditor.mockReturnValue({ editor: null });
    const { container } = render(<CanonicalEditor value={doc} onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the toolbar and EditorContent when ready", () => {
    useCanonicalEditor.mockReturnValue({ editor: {} });
    render(<CanonicalEditor value={doc} onChange={vi.fn()} />);
    expect(screen.getByTestId("toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
  });

  it("forwards value/onChange/disabled to the hook", () => {
    useCanonicalEditor.mockReturnValue({ editor: {} });
    const onChange = vi.fn();
    render(<CanonicalEditor value={doc} onChange={onChange} disabled />);
    expect(useCanonicalEditor).toHaveBeenCalledWith({ value: doc, onChange, disabled: true });
    expect(screen.getByTestId("toolbar")).toHaveTextContent("disabled");
  });

  it("emits a valid canonical document through the hook's onChange", () => {
    let captured: ((d: CanonicalDocument) => void) | undefined;
    useCanonicalEditor.mockImplementation((opts: { onChange: (d: CanonicalDocument) => void }) => {
      captured = opts.onChange;
      return { editor: {} };
    });
    const onChange = vi.fn();
    render(<CanonicalEditor value={doc} onChange={onChange} />);
    captured?.(doc);
    expect(onChange).toHaveBeenCalledWith(doc);
    expect(safeParseDocument(onChange.mock.calls[0][0]).ok).toBe(true);
  });
});
