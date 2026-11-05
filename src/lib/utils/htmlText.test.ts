import { describe, it, expect } from "vitest";
import { isHtmlContent, textToHtml, htmlToText } from "./htmlText";

describe("isHtmlContent", () => {
  it("recognizes <p>, <strong>, <em> as HTML", () => {
    expect(isHtmlContent("<p>foo</p>")).toBe(true);
    expect(isHtmlContent("<strong>bold</strong>")).toBe(true);
    expect(isHtmlContent("<em>it</em>")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(isHtmlContent("plain text without tags")).toBe(false);
  });

  it("returns false for unrelated tags like <div>", () => {
    expect(isHtmlContent("<div>foo</div>")).toBe(false);
  });

  it("recognizes <br>, <ul>, <li>", () => {
    expect(isHtmlContent("a<br>b")).toBe(true);
    expect(isHtmlContent("<ul><li>x</li></ul>")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isHtmlContent("<P>foo</P>")).toBe(true);
  });
});

describe("textToHtml", () => {
  it("returns input as-is when already HTML", () => {
    expect(textToHtml("<p>kept</p>")).toBe("<p>kept</p>");
  });

  it("wraps single line in <p>", () => {
    expect(textToHtml("hello")).toBe("<p>hello</p>");
  });

  it("wraps each line in its own <p>", () => {
    expect(textToHtml("a\nb")).toBe("<p>a</p><p>b</p>");
  });

  it("renders empty lines as <p><br></p>", () => {
    expect(textToHtml("a\n\nb")).toBe("<p>a</p><p><br></p><p>b</p>");
  });
});

describe("htmlToText", () => {
  it("returns input as-is when not HTML", () => {
    expect(htmlToText("plain")).toBe("plain");
  });

  it("converts <br> to a newline", () => {
    expect(htmlToText("a<br>b")).toBe("a\nb");
  });

  it("converts </p><p> boundary into a newline", () => {
    expect(htmlToText("<p>a</p><p>b</p>")).toBe("a\nb");
  });

  it("strips inline tags but keeps text content", () => {
    expect(htmlToText("<p><strong>hi</strong> <em>there</em></p>")).toBe("hi there");
  });

  it("decodes &nbsp; to space and &lt; &gt; &amp; to literal characters", () => {
    expect(htmlToText("<p>&lt;tag&gt;&nbsp;&amp;&nbsp;ok</p>")).toBe("<tag> & ok");
  });

  it("trims leading and trailing whitespace", () => {
    expect(htmlToText("<p>  hi  </p>")).toBe("hi");
  });
});

describe("htmlToText with superscript and subscript (C-32)", () => {
  it("keeps the exponent as ^ instead of gluing it to the base", () => {
    expect(htmlToText("<p>Calcule x<sup>2</sup> + 10<sup>3</sup></p>")).toBe("Calcule x^2 + 10^3");
  });

  it("subscripts become _ and glued text is parenthesised", () => {
    expect(htmlToText("<p>H<sub>2</sub>O e a<sub>n</sub></p>")).toBe("H_(2)O e a_n");
  });

  it("reads the inline-style form too", () => {
    expect(htmlToText('<p>2<span style="vertical-align:super">5</span></p>')).toBe("2^5");
  });
});
