import { describe, it, expect } from "vitest";
import { formatInline, renderKatexBlock } from "./activityFormatter";

describe("formatInline", () => {
  it("escapes raw HTML entities", () => {
    const html = formatInline("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders **bold** as a span with font-weight 700", () => {
    const html = formatInline("**hi**");
    expect(html).toContain("font-weight:700");
    expect(html).toContain("hi");
  });

  it("renders *italic* as a span with font-style italic", () => {
    const html = formatInline("a *foo* b");
    expect(html).toContain("font-style:italic");
    expect(html).toContain("foo");
  });

  it("renders __underline__ as a span with text-decoration underline", () => {
    const html = formatInline("__under__");
    expect(html).toContain("text-decoration:underline");
  });

  it("renders ~~strike~~ as a span with text-decoration line-through", () => {
    const html = formatInline("~~old~~");
    expect(html).toContain("line-through");
  });

  it("renders @cor[#f00]{red} as a colored inline span", () => {
    const html = formatInline("@cor[#f00]{red}");
    expect(html).toContain('style="color:#f00"');
    expect(html).toContain(">red<");
  });

  it("renders @tam[20]{big} as a sized inline span", () => {
    const html = formatInline("@tam[20]{big}");
    expect(html).toContain("font-size:20px");
    expect(html).toContain(">big<");
  });

  it("converts long underscore runs into a fill-in-the-blank line", () => {
    const html = formatInline("complete: _______");
    expect(html).toContain("border-bottom");
    expect(html).toContain("display:inline-block");
    expect(html).not.toContain("_______");
  });

  it("does not turn fewer-than-3 underscores into a blank line", () => {
    const html = formatInline("foo_bar __");
    expect(html).not.toContain("border-bottom");
  });

  it("renders inline math via $...$ as KaTeX HTML", () => {
    const html = formatInline("calc: $x^2$");
    expect(html).toContain("katex");
  });

  it("renders block math via $$...$$ as a centered KaTeX block", () => {
    const html = formatInline("$$x+1$$");
    expect(html).toContain("text-align:center");
    expect(html).toContain("katex");
  });

  it("strips form-feed (0x0C) characters from the source", () => {
    const html = formatInline("page\fbreak");
    expect(html).toBe("pagebreak");
  });

  it("does not collide bold and italic on adjacent markers", () => {
    const html = formatInline("**bold** *it*");
    expect(html).toContain("font-weight:700");
    expect(html).toContain("font-style:italic");
  });
});

describe("renderKatexBlock", () => {
  it("returns KaTeX-rendered HTML for valid expressions", () => {
    expect(renderKatexBlock("a+b")).toContain("katex");
  });

  it("returns the expression in a <pre> wrapper as a fallback when KaTeX throws", async () => {
    const katex = (await import("katex")).default;
    const original = katex.renderToString;
    katex.renderToString = (() => {
      throw new Error("forced");
    }) as typeof katex.renderToString;
    try {
      const html = renderKatexBlock("forced-fail");
      expect(html).toContain("<pre>");
      expect(html).toContain("forced-fail");
    } finally {
      katex.renderToString = original;
    }
  });
});

describe("formatInline — preprocess + inline math fallback", () => {
  it("translates \\text{__} placeholders inside $...$ math into \\underline blocks", () => {
    const html = formatInline("preencha: $\\text{___}$");
    expect(html).toContain("katex");
  });

  it("falls back to <code>...</code> for inline math when KaTeX throws", async () => {
    const katex = (await import("katex")).default;
    const original = katex.renderToString;
    katex.renderToString = (() => {
      throw new Error("forced");
    }) as typeof katex.renderToString;
    try {
      const html = formatInline("um $forcefail$ aqui");
      expect(html).toContain("<code>");
      expect(html).toContain("forcefail");
    } finally {
      katex.renderToString = original;
    }
  });

  it("uses esc() for fallback content when KaTeX inline throws", async () => {
    const katex = (await import("katex")).default;
    const original = katex.renderToString;
    katex.renderToString = (() => {
      throw new Error("forced");
    }) as typeof katex.renderToString;
    try {
      const html = formatInline("$math&here$");
      expect(html).toContain("<code>");
      expect(html).toContain("math");
    } finally {
      katex.renderToString = original;
    }
  });
});
