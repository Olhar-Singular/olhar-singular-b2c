import { describe, it, expect } from "vitest";
import {
  DEFAULT_PANEL_SETTINGS,
  PDF_FONTS,
  hasHeaderContent,
} from "./panelSettings";

describe("panelSettings", () => {
  it("defaults to an empty header, the first built-in font, and no page breaks", () => {
    expect(DEFAULT_PANEL_SETTINGS.header).toEqual({});
    expect(DEFAULT_PANEL_SETTINGS.fontFamily).toBe("Helvetica");
    expect(DEFAULT_PANEL_SETTINGS.pageBreakPerQuestion).toBe(false);
  });

  it("offers the three built-in react-pdf fonts", () => {
    expect(PDF_FONTS).toEqual(["Helvetica", "Times-Roman", "Courier"]);
  });

  describe("hasHeaderContent", () => {
    it("is false for an empty header", () => {
      expect(hasHeaderContent({})).toBe(false);
    });

    it("is false when all fields are blank/whitespace", () => {
      expect(hasHeaderContent({ title: "", school: "  ", teacher: "", date: "" })).toBe(false);
    });

    it("is true when any field has content", () => {
      expect(hasHeaderContent({ title: "Prova" })).toBe(true);
      expect(hasHeaderContent({ teacher: "Ana" })).toBe(true);
    });
  });
});
