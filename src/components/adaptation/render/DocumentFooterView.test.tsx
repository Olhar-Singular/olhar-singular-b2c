import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocumentFooterView } from "./DocumentFooterView";
import { pdfFooterLabel } from "./footerLabel";

describe("pdfFooterLabel", () => {
  it("keeps only the page counter when the header is empty", () => {
    // Estado padrão do Passo 6: o PDF sai com o rodapé mesmo assim (achado 0242).
    expect(pdfFooterLabel({}, 1, 1)).toBe("Página 1 de 1");
  });

  it("drops blank title and school so no separator dangles", () => {
    expect(pdfFooterLabel({ title: "  ", school: "" }, 2, 3)).toBe("Página 2 de 3");
  });

  it("joins title, school and counter with the middle dot", () => {
    expect(pdfFooterLabel({ title: "Prova", school: "Escola X" }, 1, 2)).toBe(
      "Prova · Escola X · Página 1 de 2",
    );
  });
});

describe("DocumentFooterView", () => {
  it("prints the same label the PDF footer renders", () => {
    render(<DocumentFooterView header={{ title: "Prova" }} pageNumber={2} totalPages={4} />);
    expect(screen.getByTestId("preview-footer-2")).toHaveTextContent("Prova · Página 2 de 4");
  });

  it("converts the PDF point measures to pixels on screen", () => {
    render(<DocumentFooterView header={{}} pageNumber={1} totalPages={1} />);
    // 8pt -> 10.67px, e a mesma tinta cinza do `PdfPageFooter`.
    const footer = screen.getByTestId("preview-footer-1") as HTMLElement;
    expect(parseFloat(footer.style.fontSize)).toBeCloseTo(10.67, 1);
    expect(footer.style.color).toBe("rgb(85, 85, 85)");
  });
});
