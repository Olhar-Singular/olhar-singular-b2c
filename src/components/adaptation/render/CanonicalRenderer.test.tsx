import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CanonicalDocumentSchema, type CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { CanonicalRenderer } from "./CanonicalRenderer";
import { renderDocument } from "./__fixtures__/renderDocument";

describe("CanonicalRenderer (rich fixture)", () => {
  it("fixture parses against the schema", () => {
    expect(() => CanonicalDocumentSchema.parse(renderDocument)).not.toThrow();
  });

  it("renders directly from the typed model (no DSL parse)", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    expect(screen.getByTestId("canonical-renderer")).toBeInTheDocument();
  });

  it("renders heading with the authored level and style", () => {
    const { container } = render(<CanonicalRenderer document={renderDocument} />);
    const h2 = container.querySelector("h2");
    expect(h2).toBeInTheDocument();
    expect(h2).toHaveTextContent("Atividade de Frações");
    expect(h2).toHaveStyle({ textAlign: "center", color: "rgb(37, 99, 235)" });
  });

  it("applies per-node style (spacing + page break) on paragraph", () => {
    const { container } = render(<CanonicalRenderer document={renderDocument} />);
    const para = container.querySelector("p");
    expect(para).toHaveStyle({
      marginBottom: "12px",
      breakBefore: "page",
      fontFamily: "Times New Roman, Times, serif",
    });
  });

  it("renders inline math with MathML and aria for accessibility", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const math = screen.getAllByTestId("inline-math")[0];
    expect(math).toHaveAttribute("role", "math");
    expect(math).toHaveAttribute("aria-label", "a sobre b");
    expect(math.querySelector(".katex-mathml")).not.toBeNull();
    expect(math.querySelector("math")).not.toBeNull();
  });

  it("renders block math in display mode with aria-label", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const math = screen.getByTestId("block-math");
    expect(math).toHaveAttribute("aria-label", "teorema de Pitágoras");
    expect(math.querySelector(".katex-display")).not.toBeNull();
  });

  it("renders image with src, alt, width and caption", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const img = screen.getByAltText("Diagrama de frações");
    expect(img).toHaveAttribute("src", "https://example.com/fig.png");
    expect(img).toHaveAttribute("width", "400");
    expect(screen.getByText("Figura 1")).toBeInTheDocument();
  });

  it("renders scaffolding steps", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const scaffold = screen.getByTestId("scaffolding");
    expect(within(scaffold).getByText("Passo 1: leia o enunciado")).toBeInTheDocument();
  });

  it("renders a divider", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    expect(screen.getByTestId("divider")).toBeInTheDocument();
  });

  it("renders question header (number, points, difficulty) and instruction", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    expect(screen.getAllByTestId("question-number")[0]).toHaveTextContent("1.");
    expect(screen.getByTestId("question-points")).toHaveTextContent("2 pts");
    expect(screen.getByTestId("question-difficulty")).toHaveTextContent("Fácil");
    expect(screen.getByTestId("question-instruction")).toHaveTextContent("Escolha a opção correta.");
  });

  it("marks the correct multiple-choice alternative authoritatively", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const mc = screen.getByTestId("answer-multipleChoice");
    const items = within(mc).getAllByRole("listitem");
    expect(items[0]).toHaveAttribute("data-correct", "true");
    expect(items[1]).toHaveAttribute("data-correct", "false");
    expect(within(items[0]).getByTestId("correct-marker")).toBeInTheDocument();
    // letter labels
    expect(items[0]).toHaveTextContent("a)");
    expect(items[1]).toHaveTextContent("b)");
  });

  it("renders true/false markers from authored values", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const tf = screen.getByTestId("answer-trueFalse");
    const items = within(tf).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("(V)");
    expect(items[1]).toHaveTextContent("(F)");
  });

  it("renders checkbox key from authored checked flags", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const cb = screen.getByTestId("answer-checkbox");
    const items = within(cb).getAllByRole("listitem");
    expect(items[0]).toHaveAttribute("data-checked", "true");
    expect(within(items[0]).getByTestId("checked-marker")).toBeInTheDocument();
    expect(within(items[1]).queryByTestId("checked-marker")).toBeNull();
  });

  it("renders matching pairs left and right", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const m = screen.getByTestId("answer-matching");
    expect(within(m).getByText("Brasil")).toBeInTheDocument();
    expect(within(m).getByText("Brasília")).toBeInTheDocument();
  });

  it("renders ordering items sorted by position", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const ord = screen.getByTestId("answer-ordering");
    const items = within(ord).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Primeiro");
    expect(items[1]).toHaveTextContent("Segundo");
  });

  it("renders fill-blank gaps with answer, alternatives and tip", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const fb = screen.getByTestId("answer-fillBlank");
    const gaps = within(fb).getAllByTestId("gap-answer");
    expect(gaps[0]).toHaveTextContent("3/4");
    expect(within(fb).getByText(/também: 0.75/)).toBeInTheDocument();
    expect(within(fb).getByText("some os numeradores")).toBeInTheDocument();
    // second gap has no alternatives/tip
    expect(gaps[1]).toHaveTextContent("1");
  });

  it("renders table with header and body cells", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const table = screen.getByTestId("answer-table");
    expect(within(table).getByText("Termo")).toBeInTheDocument();
    expect(within(table).getByText("a")).toBeInTheDocument();
    expect(table.querySelectorAll("th")).toHaveLength(2);
  });

  it("renders open-answer lines from authored count", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const open = screen.getByTestId("answer-open");
    expect(open.children).toHaveLength(4);
  });
});

describe("CanonicalRenderer (defaults / edge branches)", () => {
  const wrap = (blocks: CanonicalDocument["blocks"]): CanonicalDocument => ({
    schemaVersion: 1,
    blocks,
  });
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  it("falls back to default heading level styling for level 1 and 3", () => {
    const { container } = render(
      <CanonicalRenderer
        document={wrap([
          { id: id(1), type: "heading", level: 1, content: [{ type: "text", text: "H1" }] },
          { id: id(2), type: "heading", level: 3, content: [{ type: "text", text: "H3" }] },
        ])}
      />
    );
    expect(container.querySelector("h1")).toHaveTextContent("H1");
    expect(container.querySelector("h3")).toHaveTextContent("H3");
  });

  it("renders image with no width/alignment/caption (left default)", () => {
    render(
      <CanonicalRenderer
        document={wrap([{ id: id(3), type: "image", src: "/x.png", alt: "x" }])}
      />
    );
    const fig = screen.getByAltText("x").closest("figure");
    expect(fig).toHaveClass("text-left");
    expect(screen.getByAltText("x")).not.toHaveAttribute("width");
  });

  it("renders left/right aligned images", () => {
    render(
      <CanonicalRenderer
        document={wrap([
          { id: id(4), type: "image", src: "/l.png", alt: "l", alignment: "left" },
          { id: id(5), type: "image", src: "/r.png", alt: "r", alignment: "right" },
        ])}
      />
    );
    expect(screen.getByAltText("l").closest("figure")).toHaveClass("text-left");
    expect(screen.getByAltText("r").closest("figure")).toHaveClass("text-right");
  });

  it("block math falls back to latex as aria-label when no alt", () => {
    render(
      <CanonicalRenderer document={wrap([{ id: id(6), type: "blockMath", latex: "a+b" }])} />
    );
    expect(screen.getByTestId("block-math")).toHaveAttribute("aria-label", "a+b");
  });

  it("inline math falls back to latex as aria-label when no alt", () => {
    render(
      <CanonicalRenderer
        document={wrap([
          {
            id: id(7),
            type: "paragraph",
            content: [{ type: "inlineMath", latex: "z+1" }],
          },
        ])}
      />
    );
    expect(screen.getByTestId("inline-math")).toHaveAttribute("aria-label", "z+1");
  });

  it("question with no number/points/difficulty/instruction renders bare", () => {
    render(
      <CanonicalRenderer
        document={wrap([
          {
            id: id(8),
            type: "question",
            stem: [{ id: id(9), type: "paragraph", content: [{ type: "text", text: "Q" }] }],
            answer: { kind: "open" },
          },
        ])}
      />
    );
    expect(screen.queryByTestId("question-number")).toBeNull();
    expect(screen.queryByTestId("question-points")).toBeNull();
    expect(screen.queryByTestId("question-difficulty")).toBeNull();
    expect(screen.queryByTestId("question-instruction")).toBeNull();
    // open default lines = 3
    expect(screen.getByTestId("answer-open").children).toHaveLength(3);
  });

  it("renders medio/dificil difficulty labels", () => {
    render(
      <CanonicalRenderer
        document={wrap([
          {
            id: id(10),
            type: "question",
            difficulty: "medio",
            stem: [{ id: id(11), type: "paragraph", content: [{ type: "text", text: "Q" }] }],
            answer: { kind: "open" },
          },
          {
            id: id(12),
            type: "question",
            difficulty: "dificil",
            stem: [{ id: id(13), type: "paragraph", content: [{ type: "text", text: "Q" }] }],
            answer: { kind: "open" },
          },
        ])}
      />
    );
    expect(screen.getAllByTestId("question-difficulty")[0]).toHaveTextContent("Médio");
    expect(screen.getAllByTestId("question-difficulty")[1]).toHaveTextContent("Difícil");
  });

  it("fill-blank gap with empty alternatives array shows no 'também'", () => {
    render(
      <CanonicalRenderer
        document={wrap([
          {
            id: id(14),
            type: "question",
            stem: [{ id: id(15), type: "paragraph", content: [{ type: "text", text: "Q" }] }],
            answer: { kind: "fillBlank", gaps: [{ id: id(16), answer: "x", alternatives: [] }] },
          },
        ])}
      />
    );
    expect(screen.queryByText(/também:/)).toBeNull();
  });

  it("table with only a header row renders no body cells", () => {
    render(
      <CanonicalRenderer
        document={wrap([
          {
            id: id(17),
            type: "question",
            stem: [{ id: id(18), type: "paragraph", content: [{ type: "text", text: "Q" }] }],
            answer: { kind: "table", rows: [[[{ type: "text", text: "H" }]]] },
          },
        ])}
      />
    );
    const table = screen.getByTestId("answer-table");
    expect(table.querySelectorAll("th")).toHaveLength(1);
    expect(table.querySelectorAll("td")).toHaveLength(0);
  });

  it("table with empty rows renders no header", () => {
    render(
      <CanonicalRenderer
        document={wrap([
          {
            id: id(19),
            type: "question",
            stem: [{ id: id(20), type: "paragraph", content: [{ type: "text", text: "Q" }] }],
            answer: { kind: "table", rows: [] },
          },
        ])}
      />
    );
    const table = screen.getByTestId("answer-table");
    expect(table.querySelector("thead")).toBeNull();
  });
});
