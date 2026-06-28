import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ChatMarkdown from "./ChatMarkdown";

describe("ChatMarkdown", () => {
  it("renders Markdown headings as heading elements", () => {
    render(<ChatMarkdown content={"### Instruções Claras"} />);
    expect(
      screen.getByRole("heading", { level: 3, name: "Instruções Claras" }),
    ).toBeInTheDocument();
  });

  it("renders bold text as a <strong> element, not literal asterisks", () => {
    render(<ChatMarkdown content={"**Linguagem direta:**"} />);
    const strong = screen.getByText("Linguagem direta:");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("renders italic text as an <em> element", () => {
    render(<ChatMarkdown content={"*mostrar o que sabe*"} />);
    expect(screen.getByText("mostrar o que sabe").tagName).toBe("EM");
  });

  it("renders unordered lists as list items", () => {
    render(<ChatMarkdown content={"- primeiro\n- segundo"} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("primeiro");
    expect(items[1]).toHaveTextContent("segundo");
  });

  it("renders links with their href", () => {
    render(<ChatMarkdown content={"[DUA](https://exemplo.com)"} />);
    expect(screen.getByRole("link", { name: "DUA" })).toHaveAttribute(
      "href",
      "https://exemplo.com",
    );
  });

  it("renders plain paragraph text", () => {
    render(<ChatMarkdown content={"Olá, sou a ISA."} />);
    expect(screen.getByText("Olá, sou a ISA.")).toBeInTheDocument();
  });
});
