import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExamIssuesNotice } from "./ExamIssuesNotice";

describe("ExamIssuesNotice", () => {
  it("renders nothing without lines", () => {
    const { container } = render(<ExamIssuesNotice title="T" lines={[]} hint="H" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is a named status region with the lines and the hint, and informs without alerting", () => {
    render(<ExamIssuesNotice title="Confira" lines={["Questão 1: a", "Questão 2: b"]} hint="Corrija." />);
    const region = screen.getByRole("status", { name: "Confira" });
    expect(region).toHaveTextContent("Questão 1: a");
    expect(region).toHaveTextContent("Questão 2: b");
    expect(region).toHaveTextContent("Corrija.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("caps a long list and says how many are left", () => {
    const lines = Array.from({ length: 11 }, (_, i) => `Questão ${i + 1}: x`);
    render(<ExamIssuesNotice title="Confira" lines={lines} hint="H" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(9);
    expect(screen.getByText("e mais 3.")).toBeInTheDocument();
  });
});
