import { describe, it, expect } from "vitest";
import { flattenPastedTables, CELL_SEPARATOR } from "./pastedTables";

describe("flattenPastedTables", () => {
  it("keeps the cell boundary of a 1x2 Word table instead of gluing the text", () => {
    const result = flattenPastedTables("<table><tr><td>A</td><td>B</td></tr></table>");

    expect(result.tables).toBe(1);
    expect(result.html).toContain(`A${CELL_SEPARATOR}B`);
    // O bug original produzia um único parágrafo "AB".
    expect(result.html).not.toContain("AB");
  });

  it("turns each row into its own paragraph and keeps inline marks", () => {
    const result = flattenPastedTables(
      "<table><tbody>" +
        "<tr><th>Coluna</th><th>Valor</th></tr>" +
        "<tr><td><b>x</b></td><td>1</td></tr>" +
        "</tbody></table>",
    );

    expect(result.tables).toBe(1);
    expect(result.html).toBe(
      `<div><p>Coluna${CELL_SEPARATOR}Valor</p><p><b>x</b>${CELL_SEPARATOR}1</p></div>`,
    );
  });

  it("flattens a nested table from the inside out", () => {
    const result = flattenPastedTables(
      "<table><tr><td><table><tr><td>A</td><td>B</td></tr></table></td><td>C</td></tr></table>",
    );

    expect(result.tables).toBe(2);
    expect(result.html).toContain(`A${CELL_SEPARATOR}B`);
    expect(result.html).toContain("C");
    expect(result.html).not.toContain("<table");
  });

  it("skips a row that carries no cell", () => {
    const result = flattenPastedTables("<table><tr></tr><tr><td>A</td><td>B</td></tr></table>");

    expect(result.html).toBe(`<div><p>A${CELL_SEPARATOR}B</p></div>`);
  });

  it("drops a table that carries no cell", () => {
    const result = flattenPastedTables("<p>antes</p><table></table><p>depois</p>");

    expect(result.tables).toBe(1);
    expect(result.html).toBe("<p>antes</p><p>depois</p>");
  });

  it("returns the HTML untouched when there is no table", () => {
    const html = "<p class=MsoNormal><b>TEXTO COLADO DO WORD</b></p>";

    expect(flattenPastedTables(html)).toEqual({ html, tables: 0 });
  });
});
