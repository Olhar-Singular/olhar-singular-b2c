import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// The config lives at the repo root, outside src/, so the @/ alias cannot reach it.
// eslint-disable-next-line no-restricted-imports
import tailwindConfig from "../../tailwind.config";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

// Built from char codes so this file never carries the literal glyphs the
// copy acceptance grep looks for.
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

describe("index.html", () => {
  it("does not advertise the stale entry price", () => {
    expect(html).not.toContain("19,90");
  });

  it("states the current entry price in description and og:description", () => {
    expect(html).toMatch(/<meta name="description"[^>]*39,90/);
    expect(html).toMatch(/<meta property="og:description"[^>]*39,90/);
  });

  it("loads Poppins in the existing Google Fonts stylesheet", () => {
    expect(html).toMatch(
      /family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700&display=swap/,
    );
    expect(html.match(/fonts\.googleapis\.com\/css2/g)).toHaveLength(1);
  });

  it("keeps a single stylesheet link to Google Fonts", () => {
    expect(html.match(/<link[^>]*rel="stylesheet"/g)).toHaveLength(1);
  });

  it("has no em dash or en dash", () => {
    expect(html).not.toContain(EM_DASH);
    expect(html).not.toContain(EN_DASH);
  });
});

describe(".landing theme in index.css", () => {
  const block = css.match(/\n {2}\.landing \{([^}]*)\}/);
  const body = block?.[1] ?? "";

  const tokens: Record<string, string> = {
    "--lp-ink": "#16282B",
    "--lp-ink-2": "#3C5457",
    "--lp-muted": "#5A7376",
    "--lp-bg": "#F8FAFA",
    "--lp-surface": "#FFFFFF",
    "--lp-border": "#E2EBEB",
    "--lp-teal": "#0FB5A0",
    "--lp-teal-deep": "#0A7F87",
    "--lp-teal-text": "#0A6F76",
    "--lp-teal-hover": "#085A60",
    "--lp-teal-tint": "#E4F5F3",
    "--lp-dark": "#0F3134",
  };

  it("declares the wrapper inside an @layer base block", () => {
    expect(block).not.toBeNull();
    const before = css.slice(0, block?.index ?? 0);
    const lastLayer = before.lastIndexOf("@layer base {");
    expect(lastLayer).toBeGreaterThan(-1);
    // no other top-level block opened after that @layer (it is still open)
    expect(before.slice(lastLayer)).not.toMatch(/\n\}/);
  });

  it.each(Object.entries(tokens))("defines %s as %s", (name, value) => {
    expect(body).toContain(`${name}: ${value};`);
  });

  it("is a fixed light theme with the design base typography", () => {
    expect(body).toContain("color-scheme: light;");
    expect(body).toContain("background-color: var(--lp-bg);");
    expect(body).toContain("color: var(--lp-ink);");
    expect(body).toContain("font-family: Inter, ui-sans-serif, system-ui, sans-serif;");
    expect(body).toContain("font-size: 17px;");
    expect(body).toContain("line-height: 1.6;");
  });

  it("draws a 3px ink focus ring, white on dark, without forcing a radius", () => {
    expect(css).toContain(
      ".landing :focus-visible { outline: 3px solid var(--lp-ink); outline-offset: 3px; }",
    );
    expect(css).toContain(".landing .lp-on-dark :focus-visible { outline-color: #fff; }");
    const focusLines = css.split("\n").filter((l) => l.includes(".landing") && l.includes(":focus-visible"));
    expect(focusLines.join("\n")).not.toContain("border-radius");
  });

  it("sets headings in Poppins, falling back to the metric-compatible face first", () => {
    expect(css).toMatch(
      /\.landing h1, \.landing h2, \.landing h3, \.landing h4 \{ font-family: Poppins, "Poppins Fallback", ui-sans-serif, system-ui, sans-serif; font-weight: 600; line-height: 1\.2; text-wrap: pretty; \}/,
    );
  });

  // Measured in Chrome (canvas measureText, 600/700 weights): Poppins is ~7% wider than
  // Arial Bold, ascent 105% and descent 35%. Without this face the swap from the system
  // font to Poppins moved the hero by ~27px (CLS 0.139 on a cold load).
  it("ships an Arial-based fallback face sized to Poppins metrics", () => {
    const face = css.match(/@font-face \{[^}]*font-family: "Poppins Fallback";[^}]*\}/)?.[0] ?? "";
    expect(face).not.toBe("");
    expect(face).toContain('local("Arial Bold")');
    expect(face).toContain('local("Arial-BoldMT")');
    expect(face).toContain("font-weight: 600 700;");
    expect(face).toContain("size-adjust: 107%;");
    expect(face).toContain("ascent-override: 98%;");
    expect(face).toContain("descent-override: 33%;");
    expect(face).toContain("line-gap-override: 9%;");
    expect(css.indexOf(face)).toBeLessThan(block?.index ?? 0);
  });

  it("has no em dash or en dash in the landing block", () => {
    // Scoped on purpose: older comments elsewhere in index.css predate this rule.
    const start = block?.index ?? 0;
    const landingCss = css.slice(start, css.indexOf("\n}", start));
    expect(landingCss).toContain(".landing h1");
    expect(landingCss).not.toContain(EM_DASH);
    expect(landingCss).not.toContain(EN_DASH);
  });
});

describe("tailwind theme.extend for the landing", () => {
  const extend = (tailwindConfig.theme?.extend ?? {}) as Record<string, any>;

  it("maps every --lp-* token under colors.lp", () => {
    expect(extend.colors.lp).toEqual({
      ink: "var(--lp-ink)",
      "ink-2": "var(--lp-ink-2)",
      muted: "var(--lp-muted)",
      bg: "var(--lp-bg)",
      surface: "var(--lp-surface)",
      border: "var(--lp-border)",
      teal: "var(--lp-teal)",
      "teal-deep": "var(--lp-teal-deep)",
      "teal-text": "var(--lp-teal-text)",
      "teal-hover": "var(--lp-teal-hover)",
      "teal-tint": "var(--lp-teal-tint)",
      dark: "var(--lp-dark)",
    });
  });

  it("adds font-poppins and font-inter", () => {
    expect(extend.fontFamily.poppins).toEqual(["Poppins", '"Poppins Fallback"', "ui-sans-serif", "system-ui", "sans-serif"]);
    expect(extend.fontFamily.inter).toEqual(["Inter", "ui-sans-serif", "system-ui", "sans-serif"]);
  });

  it("leaves the global sans family, radius and app colors untouched", () => {
    expect(extend.fontFamily.sans).toEqual(['"Plus Jakarta Sans"', "system-ui", "sans-serif"]);
    expect(extend.borderRadius).toEqual({
      lg: "var(--radius)",
      md: "calc(var(--radius) - 2px)",
      sm: "calc(var(--radius) - 4px)",
    });
    expect(extend.colors.border).toBe("hsl(var(--border))");
    expect(extend.colors.primary.DEFAULT).toBe("hsl(var(--primary))");
  });
});


describe("landing palette", () => {
  it("has no orange token left: the CTA is the brand teal (teal-deep on light, bright teal on dark)", () => {
    expect(css).not.toMatch(/--lp-orange/);
    const lp = (tailwindConfig as { theme?: { extend?: { colors?: { lp?: Record<string, string> } } } }).theme?.extend?.colors?.lp ?? {};
    expect(Object.keys(lp).some((key) => /orange/.test(key))).toBe(false);
    expect(lp["teal-deep"]).toBe("var(--lp-teal-deep)");
    expect(lp["teal"]).toBe("var(--lp-teal)");
  });
});
