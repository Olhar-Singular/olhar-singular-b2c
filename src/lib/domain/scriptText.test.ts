import { describe, it, expect } from "vitest";
import { scriptToText, linearizeHtmlScripts } from "./scriptText";

describe("scriptToText (one rule for docx, paste and the manual editor)", () => {
  it("a simple script is bare, anything else is parenthesised", () => {
    expect(scriptToText("sup", "2", "")).toBe("^2");
    expect(scriptToText("sup", "3", " + 1")).toBe("^3");
    expect(scriptToText("sub", "2", "O")).toBe("_(2)"); // H_2O would glue the O to the 2
    expect(scriptToText("sup", "2", "y")).toBe("^(2)");
    expect(scriptToText("sup", "n+1", "")).toBe("^(n+1)");
    expect(scriptToText("sub", "ab", ".")).toBe("_ab");
  });
});

describe("linearizeHtmlScripts (C-11, C-32)", () => {
  it("turns <sup>/<sub> into ^ and _ text", () => {
    expect(linearizeHtmlScripts("<p>x<sup>2</sup> + y<sub>1</sub></p>")).toBe("<p>x^2 + y_1</p>");
  });

  it("reads the Word/Docs inline style, not only the tags", () => {
    expect(linearizeHtmlScripts('<p>10<span style="vertical-align:super">3</span></p>')).toBe("<p>10^3</p>");
    expect(linearizeHtmlScripts('<p>a<span style="font-size:10pt; vertical-align: sub;">i</span></p>')).toBe("<p>a_i</p>");
    expect(linearizeHtmlScripts('<p>x<span style="vertical-align:baseline">2</span></p>')).toBe(
      '<p>x<span style="vertical-align:baseline">2</span></p>',
    );
  });

  it("parenthesises when the next character would glue to the script", () => {
    expect(linearizeHtmlScripts("<p>H<sub>2</sub>O</p>")).toBe("<p>H_(2)O</p>");
    expect(linearizeHtmlScripts("<p>x<sup>2</sup><em>y</em></p>")).toBe("<p>x^(2)<em>y</em></p>");
    expect(linearizeHtmlScripts("<p>3<sup>n+1</sup></p>")).toBe("<p>3^(n+1)</p>");
  });

  it("looks past the end of a paragraph / mark for the following character", () => {
    expect(linearizeHtmlScripts("<p><strong>x<sup>2</sup></strong></p><p>y</p>")).toBe("<p><strong>x^(2)</strong></p><p>y</p>");
  });

  it("skips empty siblings when looking for the character that follows", () => {
    expect(linearizeHtmlScripts("<p>x<sup>2</sup><span></span>y</p>")).toBe("<p>x^(2)<span></span>y</p>");
  });

  it("keeps the text of nested marks and handles several scripts", () => {
    expect(linearizeHtmlScripts("<p>a<sup><strong>2</strong></sup> b<sup>3</sup></p>")).toBe("<p>a^2 b^3</p>");
  });

  it("leaves an empty script and html without scripts untouched", () => {
    expect(linearizeHtmlScripts("<p>a<sup> </sup>b</p>")).toBe("<p>a b</p>");
    expect(linearizeHtmlScripts("<p>plain <strong>bold</strong></p>")).toBe("<p>plain <strong>bold</strong></p>");
    expect(linearizeHtmlScripts("just text")).toBe("just text");
  });
});
