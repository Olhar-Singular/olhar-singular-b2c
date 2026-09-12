import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Copy that the payments redesign retired must not creep back into the UI:
// there is no free tier, plan credits DO expire, and Stripe is gone.
const FORBIDDEN = /gr[áa]tis|gratuit|nunca expiram|Stripe/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") && !full.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

describe("UI copy guard", () => {
  it("has no retired copy (grátis, nunca expiram, Stripe) in any component", () => {
    const offenders = walk(join(process.cwd(), "src"))
      .map((file) => ({ file, lines: readFileSync(file, "utf8").split("\n") }))
      .flatMap(({ file, lines }) =>
        lines.map((line, i) => (FORBIDDEN.test(line) ? `${file}:${i + 1}: ${line.trim()}` : null)).filter(Boolean),
      );
    expect(offenders).toEqual([]);
  });
});
