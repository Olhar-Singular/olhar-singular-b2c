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

  it("auto-numbers questions by document order and renders no points/difficulty", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const numbers = screen.getAllByTestId("question-number");
    expect(numbers[0]).toHaveTextContent("1.");
    expect(numbers[1]).toHaveTextContent("2.");
    expect(numbers[2]).toHaveTextContent("3.");
    expect(screen.queryByTestId("question-points")).toBeNull();
    expect(screen.queryByTestId("question-difficulty")).toBeNull();
    expect(screen.getByTestId("question-instruction")).toHaveTextContent("Escolha a opção correta.");
  });

  it("hides answer key — no correct-marker on multiple-choice alternatives", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const mc = screen.getByTestId("answer-multipleChoice");
    const items = within(mc).getAllByRole("listitem");
    // letter labels still present
    expect(items[0]).toHaveTextContent("a)");
    expect(items[1]).toHaveTextContent("b)");
    // no correct-marker rendered — answer key hidden
    expect(within(mc).queryByTestId("correct-marker")).toBeNull();
    // no data-correct attribute leaking the answer in the DOM
    items.forEach((item) => expect(item).not.toHaveAttribute("data-correct"));
  });

  it("hides answer key — true/false shows blank markers, not V/F values", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const tf = screen.getByTestId("answer-trueFalse");
    const items = within(tf).getAllByRole("listitem");
    // blank markers present — use aria-label to verify, exact text has multiple spaces
    // that testing-library normalises; query by aria-label instead
    expect(within(items[0]).getByLabelText("Marque Verdadeiro ou Falso")).toBeInTheDocument();
    expect(within(items[1]).getByLabelText("Marque Verdadeiro ou Falso")).toBeInTheDocument();
    // answer values not revealed
    expect(within(tf).queryByText("(V)")).toBeNull();
    expect(within(tf).queryByText("(F)")).toBeNull();
    // no data-value attribute leaking the answer
    items.forEach((item) => expect(item).not.toHaveAttribute("data-value"));
  });

  it("hides answer key — checkbox shows empty boxes for all items", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const cb = screen.getByTestId("answer-checkbox");
    const items = within(cb).getAllByRole("listitem");
    // no check-mark rendered for any item
    expect(within(cb).queryByTestId("checked-marker")).toBeNull();
    // no data-checked attribute leaking the answer
    items.forEach((item) => expect(item).not.toHaveAttribute("data-checked"));
  });

  it("renders matching pairs left and right", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const m = screen.getByTestId("answer-matching");
    expect(within(m).getByText("Brasil")).toBeInTheDocument();
    expect(within(m).getByText("Brasília")).toBeInTheDocument();
  });

  it("hides answer key — ordering shows items in array order with blank markers", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    const ord = screen.getByTestId("answer-ordering");
    const items = within(ord).getAllByRole("listitem");
    // fixture array order: Segundo (position 2) first, Primeiro (position 1) second
    // no sort by position — student writes the order
    expect(items[0]).toHaveTextContent("Segundo");
    expect(items[1]).toHaveTextContent("Primeiro");
    // blank order slot present for each item
    expect(within(items[0]).getByText("____")).toBeInTheDocument();
    expect(within(items[1]).getByText("____")).toBeInTheDocument();
  });

  it("hides answer key — fill-blank renders nothing (gaps live inline in stem)", () => {
    render(<CanonicalRenderer document={renderDocument} />);
    // FillBlankView returns null — no answer-fillBlank element
    expect(screen.queryByTestId("answer-fillBlank")).toBeNull();
    expect(screen.queryByTestId("gap-answer")).toBeNull();
    expect(screen.queryByText(/também:/)).toBeNull();
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

  it("question with no instruction renders the auto number but no instruction", () => {
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
    expect(screen.getByTestId("question-number")).toHaveTextContent("1.");
    expect(screen.queryByTestId("question-points")).toBeNull();
    expect(screen.queryByTestId("question-difficulty")).toBeNull();
    expect(screen.queryByTestId("question-instruction")).toBeNull();
    // open default lines = 3
    expect(screen.getByTestId("answer-open").children).toHaveLength(3);
  });

  it("fill-blank renders nothing — answer key hidden (gaps live inline in stem)", () => {
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
    expect(screen.queryByTestId("answer-fillBlank")).toBeNull();
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

  it("highlights only the block whose id matches selectedId", () => {
    const { container } = render(
      <CanonicalRenderer
        document={wrap([
          { id: id(1), type: "heading", level: 1, content: [{ type: "text", text: "H1" }] },
          { id: id(2), type: "paragraph", content: [{ type: "text", text: "p" }] },
        ])}
        selectedId={id(2)}
      />
    );
    const selected = container.querySelectorAll('[data-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("p");
    expect(selected[0]).toHaveClass("ring-2", "ring-primary");
    expect(container.querySelectorAll('[data-selected="false"]')).toHaveLength(1);
  });

  it("highlights a block inside a question stem when selected", () => {
    const { container } = render(
      <CanonicalRenderer
        document={wrap([
          {
            id: id(1),
            type: "question",
            stem: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "stem" }] }],
            answer: { kind: "open" },
          },
        ])}
        selectedId={id(2)}
      />
    );
    const selected = container.querySelectorAll('[data-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("stem");
  });

  it("highlights nothing when selectedId is undefined", () => {
    const { container } = render(
      <CanonicalRenderer
        document={wrap([
          { id: id(1), type: "heading", level: 1, content: [{ type: "text", text: "H1" }] },
        ])}
      />
    );
    expect(container.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
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

  it("question with enunciado=null renders no enunciado node", () => {
    render(
      <CanonicalRenderer
        document={wrap([
          {
            id: id(21),
            type: "question",
            stem: [{ id: id(22), type: "paragraph", content: [{ type: "text", text: "Q" }] }],
            answer: { kind: "open" },
          },
        ])}
      />
    );
    expect(screen.queryByTestId("question-enunciado")).toBeNull();
  });

  it("question with enunciado below stem renders enunciado after stem content", () => {
    render(
      <CanonicalRenderer
        document={wrap([
          {
            id: id(23),
            type: "question",
            stem: [{ id: id(24), type: "paragraph", content: [{ type: "text", text: "Observe a imagem." }] }],
            enunciado: [{ type: "text", text: "Qual é a mensagem?" }],
            enunciadoPosition: "below",
            answer: { kind: "open" },
          },
        ])}
      />
    );
    const enunciadoEl = screen.getByTestId("question-enunciado");
    expect(enunciadoEl).toBeInTheDocument();
    expect(enunciadoEl).toHaveTextContent("Qual é a mensagem?");
    // below: stem comes before enunciado in DOM
    const allNodes = document.body.querySelectorAll("[data-testid]");
    const ids = Array.from(allNodes).map((el) => el.getAttribute("data-testid"));
    expect(ids.indexOf("question")).toBeLessThan(ids.indexOf("question-enunciado"));
  });

  it("question with enunciado above stem renders enunciado before stem content", () => {
    render(
      <CanonicalRenderer
        document={wrap([
          {
            id: id(25),
            type: "question",
            stem: [{ id: id(26), type: "paragraph", content: [{ type: "text", text: "Observe a imagem." }] }],
            enunciado: [{ type: "text", text: "Leia o texto." }],
            enunciadoPosition: "above",
            answer: { kind: "open" },
          },
        ])}
      />
    );
    const enunciadoEl = screen.getByTestId("question-enunciado");
    expect(enunciadoEl).toBeInTheDocument();
    expect(enunciadoEl).toHaveTextContent("Leia o texto.");
    // above: enunciado node comes before the stem content div in DOM
    // (question-number is always first, then enunciado above, then stem div, then answers)
    const body = document.body.innerHTML;
    const enunciadoPos = body.indexOf("Leia o texto.");
    const stemPos = body.indexOf("Observe a imagem.");
    expect(enunciadoPos).toBeLessThan(stemPos);
  });

  it("question with empty enunciado array renders no enunciado node", () => {
    render(
      <CanonicalRenderer
        document={wrap([
          {
            id: id(27),
            type: "question",
            stem: [{ id: id(28), type: "paragraph", content: [{ type: "text", text: "Q" }] }],
            enunciado: [],
            answer: { kind: "open" },
          },
        ])}
      />
    );
    expect(screen.queryByTestId("question-enunciado")).toBeNull();
  });
});
