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

  it("applies cursor-default to editor attributes when readOnly", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} readOnly />);
    const attrs = (capturedConfig as { editorProps?: { attributes?: Record<string, string> } })
      .editorProps?.attributes;
    expect(attrs?.class).toContain("cursor-default");
  });

  it("hides the BubbleMenu when readOnly (formatting disabled on read-only fields)", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} readOnly />);
    expect(screen.queryByTestId("selection-bubble")).not.toBeInTheDocument();
  });

  /**
   * Regressão: o popover "Formato" move o tamanho da fonte via page tokens
   * (`--doc-fs-*` / font-size da folha), que são propriedades HERDADAS. Um
   * `text-sm` fixo no elemento .ProseMirror do campo aninhado vence a herança e
   * trava as alternativas em 14px — o professor tinha de aumentar uma a uma.
   * No modo `plain` (a folha impressa) o campo precisa herdar.
   */
  it("plain mode inherits the page font size so Formato scales alternatives", () => {
    render(<RichTextField plain value={t("a")} onChange={vi.fn()} />);
    const attrs = (capturedConfig as { editorProps?: { attributes?: Record<string, string> } })
      .editorProps?.attributes;
    const cls = attrs?.class ?? "";
    expect(cls).not.toContain("text-sm");
    expect(cls).toContain("text-[length:inherit]");
    expect(cls).toContain("leading-[inherit]");
  });

  /**
   * Regressão (achado 0102): a folha do Revisar media 62% a mais de altura que a
   * mesma folha no Exportar/PDF. O campo `plain` é o texto IMPRESSO, e carregava
   * chrome de input (`min-h-[2rem]` + `py-1`), o que empurrava cada alternativa
   * de 30px para 40px. Chrome de edição não pode entrar no fluxo vertical.
   */
  it("plain mode carries no input chrome (no min-height, no vertical padding)", () => {
    render(<RichTextField plain value={t("a")} onChange={vi.fn()} />);
    const attrs = (capturedConfig as { editorProps?: { attributes?: Record<string, string> } })
      .editorProps?.attributes;
    const cls = attrs?.class ?? "";
    expect(cls).not.toContain("min-h-");
    expect(cls).not.toContain("py-1");
    expect(cls).not.toContain("px-2");
  });

  it("non-plain (card) keeps the input chrome — it is a real form field", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    const attrs = (capturedConfig as { editorProps?: { attributes?: Record<string, string> } })
      .editorProps?.attributes;
    const cls = attrs?.class ?? "";
    expect(cls).toContain("min-h-[2rem]");
    expect(cls).toContain("py-1");
    expect(cls).toContain("px-2");
  });

  it("non-plain (card) keeps the compact text-sm — structural editor, not the folha", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} />);
    const attrs = (capturedConfig as { editorProps?: { attributes?: Record<string, string> } })
      .editorProps?.attributes;
    const cls = attrs?.class ?? "";
    expect(cls).toContain("text-sm");
    expect(cls).not.toContain("text-[length:inherit]");
  });

  /**
   * Regressão (achado 0209): `focus:outline-none` do Tailwind 3 NÃO remove o
   * outline — compila para `outline: 2px solid transparent` e, com
   * especificidade 0,2,0, vence a regra global `:focus-visible` de `index.css`.
   * Resultado: todo campo da folha ficava sem indicador de foco (WCAG 2.4.7).
   * O indicador tem de ser `outline`/`ring` com offset, que desenha FORA do
   * fluxo — `border`/`padding` reabririam o achado 0102 (folha mais alta que o PDF).
   */
  it("shows a visible focus ring on keyboard focus (no transparent focus:outline-none)", () => {
    render(<RichTextField plain value={t("a")} onChange={vi.fn()} />);
    const attrs = (capturedConfig as { editorProps?: { attributes?: Record<string, string> } })
      .editorProps?.attributes;
    const cls = attrs?.class ?? "";
    expect(cls).not.toContain("focus:outline-none");
    expect(cls).toContain("focus-visible:outline-2");
    expect(cls).toContain("focus-visible:outline-offset-2");
    expect(cls).toContain("focus-visible:outline-ring");
    // O indicador não pode entrar no fluxo vertical (achado 0102).
    expect(cls).not.toContain("focus-visible:border");
    expect(cls).not.toContain("focus-visible:p");
  });

  it("passes ariaLabel into the editor attributes", () => {
    render(<RichTextField value={t("a")} onChange={vi.fn()} ariaLabel="Alternativa" />);
    const attrs = (capturedConfig as { editorProps?: { attributes?: Record<string, string> } })
      .editorProps?.attributes;
    expect(attrs?.["aria-label"]).toBe("Alternativa");
    expect(attrs?.["data-placeholder"]).toBeDefined();
  });

  /**
   * Regressão (B8, mesma classe): este campo edita `answer.*`, `caption`,
   * `enunciado` e `instruction` — tudo que entra no documento canônico. O
   * `@tiptap/extension-color` cru aceita QUALQUER cor CSS, e o canônico só
   * aceita a allowlist. Uma cor colada do Word (ou a nossa própria, que o DOM
   * serializa como `rgb(...)`) chegava verbatim ao modelo, o
   * `tryProseMirrorToCanonical` reprovava o documento INTEIRO e o autosave
   * congelava em silêncio. A folha já usa `AllowlistedColor`; o campo aninhado
   * tem de usar a mesma coerção.
   */
  describe("color allowlist", () => {
    type AttrSpec = { parseHTML: (el: HTMLElement) => string | null };
    type GlobalAttrEntry = { types: string[]; attributes: Record<string, AttrSpec> };
    type ColorExt = {
      name: string;
      config: { addGlobalAttributes?: () => GlobalAttrEntry[] };
      options?: unknown;
    };

    /** The `color` attribute spec of whatever color extension the field wires up. */
    function colorAttr(): AttrSpec {
      render(<RichTextField value={t("a")} onChange={vi.fn()} />);
      const extensions = (capturedConfig as { extensions?: ColorExt[] }).extensions ?? [];
      const ext = extensions.find((e) => e?.name === "color");
      expect(ext).toBeDefined();
      const entries = ext!.config.addGlobalAttributes!.call({ options: ext!.options });
      const entry = entries.find((e) => e.types.includes("textStyle"));
      expect(entry).toBeDefined();
      return entry!.attributes.color;
    }

    function styled(color: string): HTMLElement {
      const el = document.createElement("span");
      el.style.color = color;
      return el;
    }

    it("coerces a pasted foreign color to the nearest allowlisted one", () => {
      // Word's default red is not our red; the emphasis survives, the value is
      // clamped to the palette instead of freezing the document.
      expect(colorAttr().parseHTML(styled("#EF4444"))).toBe("#DC2626");
    });

    it("round-trips our own clipboard, which serializes #DC2626 as rgb()", () => {
      expect(colorAttr().parseHTML(styled("rgb(220, 38, 38)"))).toBe("#DC2626");
    });

    it("drops an unparseable color instead of carrying it into the model", () => {
      expect(colorAttr().parseHTML(styled("inherit"))).toBeNull();
    });
  });
});
