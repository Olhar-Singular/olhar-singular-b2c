import { describe, it, expect } from "vitest";
import {
  DEFAULT_PANEL_SETTINGS,
  hasHeaderContent,
} from "./panelSettings";

describe("panelSettings", () => {
  it("defaults to an empty header and no page breaks", () => {
    expect(DEFAULT_PANEL_SETTINGS.header).toEqual({});
    expect(DEFAULT_PANEL_SETTINGS.pageBreakPerQuestion).toBe(false);
  });

  it("does not have a fontFamily field (font now comes from pageStyle)", () => {
    // fontFamily was removed from PanelSettings in Fase 4a.
    expect("fontFamily" in DEFAULT_PANEL_SETTINGS).toBe(false);
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
