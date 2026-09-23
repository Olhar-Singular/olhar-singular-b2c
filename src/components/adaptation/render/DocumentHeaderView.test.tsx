import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocumentHeaderView } from "./DocumentHeaderView";
import { HEADER_SPACING_PT } from "./headerSpacing";

describe("DocumentHeaderView", () => {
  it("renders nothing when every header field is empty", () => {
    const { container } = render(<DocumentHeaderView header={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the header only has blank strings", () => {
    const { container } = render(
      <DocumentHeaderView header={{ title: "", school: "  ", teacher: "", date: "" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title, school, teacher and date like the PDF header does", () => {
    render(
      <DocumentHeaderView
        header={{ title: "Prova", school: "Escola X", teacher: "Ana", date: "2026-06-04" }}
      />,
    );
    const block = screen.getByTestId("preview-header");
    expect(block).toHaveTextContent("Prova");
    expect(block).toHaveTextContent("Escola X");
    expect(block).toHaveTextContent("Professor(a): Ana");
    // ISO no dado, DD/MM/AAAA na folha — mesma conversão do PDF.
    expect(block).toHaveTextContent("Data: 04/06/2026");
  });

  it("renders a non-ISO date string as-is", () => {
    render(<DocumentHeaderView header={{ title: "X", date: "sem data" }} />);
    expect(screen.getByTestId("preview-header")).toHaveTextContent("Data: sem data");
  });

  it("drops the meta row entirely when teacher and date are blank (achado 0243)", () => {
    // Paridade com Word/Copiar: campo vazio nao desenha `" "` nem a linha que o
    // envolve, senao a regua (e o corpo) descem uma linha a toa.
    render(<DocumentHeaderView header={{ title: "Prova", school: "Escola X" }} />);
    const block = screen.getByTestId("preview-header") as HTMLElement;
    expect(block.querySelectorAll("span")).toHaveLength(0);
    expect(
      Array.from(block.children).some(
        (child) => (child as HTMLElement).style.justifyContent === "space-between",
      ),
    ).toBe(false);
  });

  it("keeps a single cell when only the teacher is filled (achado 0243)", () => {
    render(<DocumentHeaderView header={{ teacher: "Ana" }} />);
    const block = screen.getByTestId("preview-header") as HTMLElement;
    const spans = Array.from(block.querySelectorAll("span"));
    expect(spans).toHaveLength(1);
    expect(spans[0]).toHaveTextContent("Professor(a): Ana");
  });

  it("omits title and school when blank but keeps the block for the teacher row", () => {
    render(<DocumentHeaderView header={{ teacher: "Ana" }} />);
    const block = screen.getByTestId("preview-header");
    expect(block).toHaveTextContent("Professor(a): Ana");
    expect(block).not.toHaveTextContent("Data:");
  });

  it("separates school from the title with the same explicit spacing as the PDF", () => {
    // Achado 0117: o par título -> escola precisa de margem explícita nos dois
    // lados; entrelinha sozinha não dá o mesmo respiro nas duas engines.
    render(<DocumentHeaderView header={{ title: "Prova", school: "Escola X" }} />);
    const school = screen.getByText("Escola X") as HTMLElement;
    expect(parseFloat(school.style.marginTop)).toBeCloseTo(HEADER_SPACING_PT.schoolTop * (96 / 72), 2);
  });

  it("converts the PDF point measures to pixels on screen", () => {
    render(<DocumentHeaderView header={{ title: "Prova" }} />);
    // 16pt de margem inferior -> 21.33px; 18pt de título -> 24px.
    const block = screen.getByTestId("preview-header") as HTMLElement;
    expect(parseFloat(block.style.marginBottom)).toBeCloseTo(21.33, 1);
    expect(screen.getByText("Prova")).toHaveStyle({ fontSize: "24px" });
  });
});
