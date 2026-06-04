import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StylingSurface } from "./StylingSurface";
import { validateDocument } from "@/lib/adaptation/canonical/validate";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

vi.mock("@/components/adaptation/render/CanonicalRenderer", () => ({
  CanonicalRenderer: ({ document }: { document: CanonicalDocument }) => (
    <div data-testid="preview">{document.blocks.length} blocos</div>
  ),
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function baseDoc(): CanonicalDocument {
  return {
    schemaVersion: 1,
    blocks: [
      { id: id(1), type: "heading", level: 1, content: [{ type: "text", text: "Tit" }] },
      { id: id(2), type: "paragraph", content: [{ type: "text", text: "p" }] },
      { id: id(3), type: "blockMath", latex: "a" },
      { id: id(4), type: "image", src: "https://example.com/x.png", alt: "fig" },
      { id: id(5), type: "scaffolding", items: ["a"] },
      { id: id(6), type: "divider" },
      {
        id: id(7),
        type: "question",
        number: 1,
        stem: [{ id: id(8), type: "paragraph", content: [{ type: "text", text: "stem" }] }],
        answer: { kind: "open" },
      },
      {
        id: id(9),
        type: "question",
        stem: [{ id: id(10), type: "paragraph", content: [{ type: "text", text: "s2" }] }],
        answer: { kind: "open" },
      },
    ],
  };
}

describe("StylingSurface", () => {
  it("lists every block type label including stem children and unnumbered questions", () => {
    render(<StylingSurface document={baseDoc()} onChange={vi.fn()} />);
    const select = screen.getByLabelText("Bloco") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Título (H1)",
        "Parágrafo 2",
        "Fórmula",
        "Imagem",
        "Apoio",
        "Divisória",
        "Questão 1",
        "↳ Parágrafo 1",
        "Questão",
      ]),
    );
  });

  it("renders the live preview from the same document", () => {
    render(<StylingSurface document={baseDoc()} onChange={vi.fn()} />);
    expect(screen.getByTestId("preview")).toHaveTextContent("8 blocos");
  });

  it("applies font, size, align, color, spacing and pageBreak to the selected block", () => {
    const onChange = vi.fn();
    render(<StylingSurface document={baseDoc()} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "serif" } });
    fireEvent.change(screen.getByLabelText("Tamanho (px)"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("Alinhamento"), { target: { value: "center" } });
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "#DC2626" } });
    fireEvent.change(screen.getByLabelText("Espaço depois (px)"), { target: { value: "10" } });
    fireEvent.click(screen.getByLabelText("Quebra de página antes"));

    expect(onChange).toHaveBeenCalledTimes(6);
    for (const call of onChange.mock.calls) {
      expect(validateDocument(call[0])).toBeTruthy();
    }
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as CanonicalDocument;
    expect(last.blocks[0].style).toEqual({ pageBreakBefore: true });
  });

  it("clears a style field when set back to default / empty", () => {
    const onChange = vi.fn();
    const doc = baseDoc();
    doc.blocks[0].style = { fontSize: 30, align: "center" };
    render(<StylingSurface document={doc} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Tamanho (px)"), { target: { value: "" } });
    let next = onChange.mock.calls[0][0] as CanonicalDocument;
    expect(next.blocks[0].style).toEqual({ align: "center" });

    fireEvent.change(screen.getByLabelText("Alinhamento"), { target: { value: "" } });
    next = onChange.mock.calls[1][0] as CanonicalDocument;
    expect(next.blocks[0].style).toEqual({ fontSize: 30 });
  });

  it("clears font, color, spacing and pageBreak back to undefined", () => {
    const onChange = vi.fn();
    const doc = baseDoc();
    doc.blocks[0].style = {
      fontFamily: "serif",
      color: "#DC2626",
      spacingAfter: 10,
      pageBreakBefore: true,
    };
    render(<StylingSurface document={doc} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "" } });
    expect((onChange.mock.calls[0][0] as CanonicalDocument).blocks[0].style?.fontFamily).toBeUndefined();

    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "" } });
    expect((onChange.mock.calls[1][0] as CanonicalDocument).blocks[0].style?.color).toBeUndefined();

    fireEvent.change(screen.getByLabelText("Espaço depois (px)"), { target: { value: "" } });
    expect((onChange.mock.calls[2][0] as CanonicalDocument).blocks[0].style?.spacingAfter).toBeUndefined();

    fireEvent.click(screen.getByLabelText("Quebra de página antes"));
    expect((onChange.mock.calls[3][0] as CanonicalDocument).blocks[0].style?.pageBreakBefore).toBeUndefined();
  });

  it("styles a block selected from inside a question stem", () => {
    const onChange = vi.fn();
    render(<StylingSurface document={baseDoc()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Bloco"), { target: { value: id(8) } });
    fireEvent.change(screen.getByLabelText("Alinhamento"), { target: { value: "right" } });
    const next = onChange.mock.calls[0][0] as CanonicalDocument;
    const q = next.blocks[6] as Extract<CanonicalDocument["blocks"][number], { type: "question" }>;
    expect(q.stem[0].style).toEqual({ align: "right" });
  });

  it("finds a stem block in a later question, skipping earlier questions whose stem does not match", () => {
    const onChange = vi.fn();
    render(<StylingSurface document={baseDoc()} onChange={onChange} />);
    // id(10) lives in the SECOND question; the first question's stem is scanned and missed.
    fireEvent.change(screen.getByLabelText("Bloco"), { target: { value: id(10) } });
    fireEvent.change(screen.getByLabelText("Alinhamento"), { target: { value: "center" } });
    const next = onChange.mock.calls[0][0] as CanonicalDocument;
    const q = next.blocks[7] as Extract<CanonicalDocument["blocks"][number], { type: "question" }>;
    expect(q.stem[0].style).toEqual({ align: "center" });
  });

  it("reads the existing style of the selected stem block (style ?? {} fallback)", () => {
    const doc = baseDoc();
    const q = doc.blocks[6] as Extract<CanonicalDocument["blocks"][number], { type: "question" }>;
    q.stem[0].style = { fontSize: 18 };
    render(<StylingSurface document={doc} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Bloco"), { target: { value: id(8) } });
    expect(screen.getByLabelText("Tamanho (px)")).toHaveValue(18);
  });
});
