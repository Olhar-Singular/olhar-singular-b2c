/**
 * Regression guard for the production Content-Security-Policy (vercel.json).
 *
 * PDF export (`@react-pdf/renderer`) loads a WASM layout engine and an embedded
 * font as `data:` URIs and spins up a `blob:` worker. A CSP that omits these
 * sources silently breaks export in production while every unit test stays green
 * (the dev server sends no CSP, and jsdom never runs the real WASM/worker). This
 * test locks the directives so a future CSP tightening can't re-break export.
 *
 * See: src/components/adaptation/export/exportPdf.ts (downloadPdf → pdf().toBlob()).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Parse a CSP header value into a directive → sources map. */
function parseCsp(value: string): Record<string, string[]> {
  return Object.fromEntries(
    value
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...sources] = d.split(/\s+/);
        return [name, sources];
      }),
  );
}

function getCsp(): Record<string, string[]> {
  const raw = readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8");
  const json = JSON.parse(raw) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const header = json.headers
    .flatMap((entry) => entry.headers)
    .find((h) => h.key === "Content-Security-Policy");
  if (!header) throw new Error("Content-Security-Policy header not found in vercel.json");
  return parseCsp(header.value);
}

describe("production CSP (vercel.json) — PDF export machinery", () => {
  const csp = getCsp();

  it("allows embedded fonts via data: URIs (font-src)", () => {
    expect(csp["font-src"]).toContain("data:");
  });

  it("allows fetching the WASM layout engine via data: URIs (connect-src)", () => {
    expect(csp["connect-src"]).toContain("data:");
  });

  it("allows the blob: worker react-pdf spawns (worker-src)", () => {
    expect(csp["worker-src"]).toContain("blob:");
  });

  it("keeps the existing Supabase connectivity intact (connect-src)", () => {
    expect(csp["connect-src"]).toContain("https://*.supabase.co");
    expect(csp["connect-src"]).toContain("wss://*.supabase.co");
  });
});
