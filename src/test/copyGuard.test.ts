import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Copy that the payments redesign retired must not creep back into the UI:
// plan credits DO expire and Stripe is gone. "grátis" is allowed only for the
// 7-day trial with card (2026-09-15): on a line that also says teste/testar.
const FORBIDDEN = /gratuit|nunca expiram|Stripe/i;
const FREE = /gr[áa]tis/i;
const TRIAL = /test(e|ar)/i;

function offends(line: string): boolean {
  return FORBIDDEN.test(line) || (FREE.test(line) && !TRIAL.test(line));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") && !full.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

describe("UI copy guard", () => {
  it("has no retired copy (gratuit*, nunca expiram, Stripe, grátis fora do teste) in any component", () => {
    const offenders = walk(join(process.cwd(), "src"))
      .map((file) => ({ file, lines: readFileSync(file, "utf8").split("\n") }))
      .flatMap(({ file, lines }) =>
        lines.map((line, i) => (offends(line) ? `${file}:${i + 1}: ${line.trim()}` : null)).filter(Boolean),
      );
    expect(offenders).toEqual([]);
  });
});
