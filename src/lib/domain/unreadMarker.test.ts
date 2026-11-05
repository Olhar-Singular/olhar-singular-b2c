import { describe, it, expect } from "vitest";
import {
  UNREAD_FORMULA,
  UNREAD_IMAGE,
  UNREAD_OBJECT,
  findBareCommandLines,
  hasUnreadMarker,
} from "./unreadMarker";

describe("hasUnreadMarker", () => {
  it("recognises the three markers and the model's own 'trecho' variant, and nothing else", () => {
    for (const marker of [UNREAD_FORMULA, UNREAD_IMAGE, UNREAD_OBJECT, "[trecho não lido]"]) {
      expect(hasUnreadMarker(`Calcule ${marker}.`)).toBe(true);
    }
    expect(hasUnreadMarker("Calcule x.")).toBe(false);
    expect(hasUnreadMarker("[fórmula]")).toBe(false);
  });

  it("gives the same answer when called twice in a row (global regex state)", () => {
    expect(hasUnreadMarker(UNREAD_FORMULA)).toBe(true);
    expect(hasUnreadMarker(UNREAD_FORMULA)).toBe(true);
  });
});

describe("findBareCommandLines", () => {
  it("finds a command with nothing after it", () => {
    expect(findBareCommandLines("1) Calcule .\n2) Qual é?\n3) Quanto vale!")).toEqual([
      "1) Calcule .",
      "2) Qual é?",
      "3) Quanto vale!",
    ]);
  });

  it("leaves complete statements, lists and marked lines alone", () => {
    const text = `Calcule o valor de x.\nResolva:\na) 2 + 2\nCalcule ${UNREAD_FORMULA}.\n\nQuanto é 2 + 2?`;
    expect(findBareCommandLines(text)).toEqual([]);
  });
});
