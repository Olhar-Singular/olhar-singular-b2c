import { describe, it, expect } from "vitest";
import { indexToLetter } from "./letters";

describe("indexToLetter", () => {
  it("maps 0 to 'a'", () => {
    expect(indexToLetter(0)).toBe("a");
  });
  it("maps 1 to 'b'", () => {
    expect(indexToLetter(1)).toBe("b");
  });
  it("maps 25 to 'z'", () => {
    expect(indexToLetter(25)).toBe("z");
  });
  it("wraps past 'z' to 'aa'", () => {
    expect(indexToLetter(26)).toBe("aa");
  });
  it("maps 27 to 'ab'", () => {
    expect(indexToLetter(27)).toBe("ab");
  });
  it("maps 51 to 'az'", () => {
    expect(indexToLetter(51)).toBe("az");
  });
  it("maps 52 to 'ba'", () => {
    expect(indexToLetter(52)).toBe("ba");
  });
});
