import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guards the edge-function bug class that Vitest-in-Vite CANNOT catch — and that
 * `supabase functions serve` ALSO misses (its esbuild compile step resolves
 * extensionless imports and caches the bundle): a Deno import graph reaching a
 * relative import WITHOUT an explicit `.ts` extension, or a `@/` alias. Vite
 * resolves both; the real Deno deploy rejects them ("Module not found").
 *
 * Strategy: walk the STATIC import graph from each function `index.ts`, following
 * every relative import, and assert that within the ACTUAL reachable set every
 * relative specifier carries an explicit extension and no `@/` alias appears.
 * Only truly-reached files are checked, so browser-only siblings that use `@/`
 * (e.g. src/lib/adaptation/canonical/plainText.ts) are correctly ignored — they
 * are not part of the Deno bundle.
 *
 * Sibling guards: src/lib/adaptation/tiptap/domSerialization.test.ts (schema DOM)
 * and .../CanonicalEditor.realdom.test.tsx (real editor mount).
 */

const FUNCTIONS_DIR = dirname(fileURLToPath(import.meta.url)); // supabase/functions
const ROOT = resolve(FUNCTIONS_DIR, "..", ".."); // repo root
const OK_EXT = /\.(tsx?|jsx?|mjs|json)$/;

/** Static import/export/dynamic-import specifiers in a source file. */
function specifiersOf(src: string): string[] {
  const specs = new Set<string>();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g, // import/export … from "X"
    /\bimport\s*\(\s*["']([^"']+)["']/g, // dynamic import("X")
    /(?:^|[\n;])\s*import\s+["']([^"']+)["']/g, // side-effect import "X"
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) specs.add(m[1]);
  }
  return [...specs];
}

/** Walk the import graph from `entry`, collecting Deno-resolution violations. */
function walk(entry: string): string[] {
  const violations: string[] = [];
  const visited = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (visited.has(file) || !existsSync(file)) continue;
    visited.add(file);
    const rel = relative(ROOT, file);
    for (const spec of specifiersOf(readFileSync(file, "utf8"))) {
      if (/^https?:\/\//.test(spec)) continue; // remote URL — Deno-native
      if (spec.startsWith("@/")) {
        violations.push(`${rel} → "${spec}" (alias @/ não resolve no Deno)`);
        continue;
      }
      if (!spec.startsWith("./") && !spec.startsWith("../")) continue; // bare → import map/builtin
      if (!OK_EXT.test(spec)) {
        violations.push(`${rel} → "${spec}" (import relativo sem extensão explícita)`);
        continue;
      }
      const target = resolve(dirname(file), spec);
      if (!existsSync(target)) {
        violations.push(`${rel} → "${spec}" (arquivo relativo inexistente)`);
        continue;
      }
      stack.push(target);
    }
  }
  return violations;
}

/** Every `supabase/functions/<name>/index.ts` (the deployable entrypoints). */
function functionEntries(): string[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "_shared")
    .map((d) => join(FUNCTIONS_DIR, d.name, "index.ts"))
    .filter((p) => existsSync(p));
}

describe("edge functions — grafo de imports Deno (extensões explícitas, sem @/)", () => {
  it("todo import relativo alcançável de um index.ts de function tem extensão explícita e nenhum @/", () => {
    const entries = functionEntries();
    expect(entries.length).toBeGreaterThan(0); // sanity: achou as functions

    const violations = [...new Set(entries.flatMap(walk))].sort();
    expect(violations).toEqual([]);
  });
});

/**
 * supabase-js is pinned ONCE, in the deno.json import map, to the exact version
 * the frontend resolves (package-lock.json), so edge and browser run the same
 * client. A remote `https://esm.sh/@supabase/supabase-js@2` would float to
 * whatever major-2 release esm.sh serves on the next deploy.
 */
describe("edge functions — supabase-js fixado", () => {
  const SUPABASE_JS_URL = /https?:\/\/[^"'\s]*@supabase\/supabase-js/;

  function lockedVersion(): string {
    const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
    return lock.packages["node_modules/@supabase/supabase-js"].version;
  }

  function edgeSources(): string[] {
    const files: string[] = [];
    const visit = (dir: string) => {
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, d.name);
        if (d.isDirectory()) visit(p);
        else if (/\.ts$/.test(d.name) && !/\.test\.ts$/.test(d.name)) files.push(p);
      }
    };
    visit(FUNCTIONS_DIR);
    return files;
  }

  it("o import map aponta @supabase/supabase-js para a versão exata do package-lock", () => {
    const denoJson = JSON.parse(readFileSync(join(FUNCTIONS_DIR, "deno.json"), "utf8"));
    expect(denoJson.imports["@supabase/supabase-js"]).toBe(
      `https://esm.sh/@supabase/supabase-js@${lockedVersion()}`,
    );
  });

  it("nenhuma function importa supabase-js por URL remota (só pelo import map)", () => {
    const offenders = edgeSources()
      .map((file) => relative(ROOT, file))
      .filter((rel) => SUPABASE_JS_URL.test(readFileSync(join(ROOT, rel), "utf8")))
      .sort();
    expect(offenders).toEqual([]);
  });
});
