// =============================================================================
// Did a stacked fraction keep its grouping? (N-I-001)
//
// The client writes a stacked fraction of a PDF as `(2 x + 1)/3` (`pdfTextLayout`). The
// extraction and the adaptation are told to keep that grouping, but a model that rewrites it
// as `2x + 1/3` changes the function (f(4) = 8,33 instead of 3) and nothing downstream sees
// it: the skeleton the other checks compare drops the bar and the brackets. Here the grouped
// fractions of the INPUT are compared with the fractions of the OUTPUT (`\frac{a}{b}` or
// `a/b` in text); one that is gone is a fraction the teacher must compare with the original.
//
// Pure, no I/O, INFORMATIONAL. A fraction with a single token on both sides (`1/2`) is never
// at risk, so only the grouped ones are checked.
// =============================================================================

export interface LostFraction {
  /** As the input wrote it, e.g. `(2 x + 1)/3`. */
  fraction: string;
  /** Skeleton of the numerator, to find the question it belongs to. */
  numerator: string;
}

/** Letters, digits and the operators that carry a value; spaces, brackets and `\` go. */
const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

function skeleton(s: string): string {
  return s
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String(SUPERSCRIPT_DIGITS.indexOf(c)))
    .toLowerCase()
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/sqrt|√/g, "#")
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/\\(?:left|right|,|;|!|quad|text|mathrm|displaystyle)\b/g, "")
    .replace(/[^\p{L}\p{N}#+\-*=<>≤≥%±]/gu, "");
}

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", theta: "θ", lambda: "λ", mu: "μ", pi: "π", sigma: "σ", phi: "φ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Omega: "Ω",
};

/** The `{...}` group that starts at `from` (spaces allowed before it) and where it ends, or null. */
function braceGroup(s: string, from: number): { content: string; end: number } | null {
  let start = from;
  while (/\s/.test(s[start] ?? "")) start += 1;
  if (s[start] !== "{") return null;
  let depth = 0;
  for (let j = start; j < s.length; j += 1) {
    if (s[j] === "{") depth += 1;
    else if (s[j] === "}" && --depth === 0) return { content: s.slice(start + 1, j), end: j + 1 };
  }
  return null;
}

/**
 * Rewrites `\command{a}{b}` (balanced braces, so `x^{2}` or `\sqrt{b^{2}}` inside is fine) with
 * `render([a, b])`, the arguments already rewritten. A command whose groups are missing or
 * unbalanced is left exactly as the model wrote it (L9A-6).
 */
function rewriteCommand(s: string, command: RegExp, arity: number, render: (args: string[]) => string): string {
  let out = "";
  let cursor = 0;
  for (const match of s.matchAll(command)) {
    const start = match.index as number;
    if (start < cursor) continue;
    const args: string[] = [];
    let at = start + match[0].length;
    for (let k = 0; k < arity; k += 1) {
      const group = braceGroup(s, at);
      if (!group) break;
      args.push(rewriteCommand(group.content, command, arity, render));
      at = group.end;
    }
    if (args.length < arity) continue;
    out += s.slice(cursor, start) + render(args);
    cursor = at;
  }
  return out + s.slice(cursor);
}

/** The commands a model writes inside a fraction, as the characters the PDF text has. */
function delatex(s: string): string {
  if (!s.includes("\\")) return s;
  let out = s.replace(/\\(?:left|right|displaystyle)\b/g, "").replace(/\\pm\b/g, "±").replace(/\\(?:cdot|times)\b/g, "*");
  out = out.replace(/\\([A-Za-z]+)/g, (m, name: string) => GREEK[name] ?? m);
  return rewriteCommand(out, /\\sqrt(?![A-Za-z])/g, 1, ([radicand]) => `√(${radicand})`);
}

/** `\frac{a}{b}` -> `(a)/(b)`, nested fractions flattened too. */
function fracToSlash(s: string): string {
  return rewriteCommand(s, /\\[dt]?frac(?![A-Za-z])/g, 2, ([numerator, denominator]) => `(${numerator})/(${denominator})`);
}

// A bracketed group may hold one level of brackets (`(-b ± √(Δ))`).
const BRACKETED = String.raw`\((?:[^()]|\([^()]*\))*\)`;
const TOKEN = String.raw`[\p{L}\p{N}.,√^_]+`;
// A bracket right after a letter or digit is a call (`f(x)`), not a group: the numerator never starts there.
const SLASH_FRACTION = new RegExp(`((?<![\\p{L}\\p{N}])${BRACKETED}|${TOKEN})\\s*\\/\\s*(${BRACKETED}|${TOKEN})`, "gu");

const unwrap = (operand: string): string => (operand.startsWith("(") ? operand.slice(1, -1) : operand);

/**
 * A bracketed operand the layout step grouped: it holds an operator or a space and is not prose.
 * `(a)`, `(12)` (a label, a date) and `(Fonte: IBGE)` (a note) are not groups of a fraction.
 */
function isGroup(operand: string): boolean {
  if (!operand.startsWith("(")) return false;
  const inner = unwrap(operand);
  return /[\s+\-−–±×·÷*/^√=<>≤≥]/u.test(inner) && !/\p{L}{4,}|:/u.test(inner);
}

interface Found {
  text: string;
  key: string;
  numerator: string;
  grouped: boolean;
}

function fractionsIn(raw: string): Found[] {
  const text = fracToSlash(delatex(raw));
  return Array.from(text.matchAll(SLASH_FRACTION)).map((m) => {
    const numerator = skeleton(unwrap(m[1]));
    return {
      text: `${m[1]}/${m[2]}`.replace(/\s+/g, " "),
      key: `${numerator}|${skeleton(unwrap(m[2]))}`,
      numerator,
      grouped: isGroup(m[1]) || isGroup(m[2]),
    };
  });
}

/** Grouped fractions of `input` that no fraction of `output` matches. */
export function lostFractions(input: string, output: string): LostFraction[] {
  const wanted = fractionsIn(input).filter((f) => f.grouped && f.numerator && !f.key.endsWith("|"));
  if (!wanted.length) return [];
  const present = new Set(fractionsIn(output).map((f) => f.key));
  const seen = new Set<string>();
  const lost: LostFraction[] = [];
  for (const f of wanted) {
    if (present.has(f.key) || seen.has(f.key)) continue;
    seen.add(f.key);
    lost.push({ fraction: f.text, numerator: f.numerator });
  }
  return lost;
}

/** The index of the first text whose skeleton holds `numerator` (to point at a question), or -1. */
export function questionOfFraction(lost: LostFraction, questionTexts: string[]): number {
  return questionTexts.findIndex((t) => skeleton(fracToSlash(delatex(t))).includes(lost.numerator));
}
