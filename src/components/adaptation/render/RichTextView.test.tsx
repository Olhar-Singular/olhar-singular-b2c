import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RichTextView } from "./RichTextView";

describe("RichTextView", () => {
  // Achado 0621: the Export preview collapsed "\n" inside a run into a space,
  // while Revisar, PDF and Word keep one line per item.
  it("renders a line break inside a text run as a visible <br>", () => {
    const { container } = render(
      <p>
        <RichTextView content={[{ type: "text", text: "Tabela:\nMaca\nBanana" }]} />
      </p>,
    );
    const span = container.querySelector("span")!;
    expect(span.querySelectorAll("br")).toHaveLength(2);
    expect(span.textContent).toBe("Tabela:MacaBanana");
  });

  it("keeps a run without line breaks as plain text, preserving marks", () => {
    const { container } = render(
      <RichTextView content={[{ type: "text", text: "a  b ", marks: ["bold"] }]} />,
    );
    const span = container.querySelector("span")!;
    expect(span.querySelector("br")).toBeNull();
    expect(span.textContent).toBe("a  b ");
    expect(span.className).not.toBe("");
  });
});
