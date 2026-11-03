import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/*
 * Achado 0804: copy shown to the teacher must not use the em dash (product rule:
 * use Portuguese punctuation instead: comma, colon, parentheses or a period).
 * This sweeps every string literal, template and JSX text in `src/` (comments are
 * not tokens of those kinds, so they are ignored). A lone "—" is allowed: it is the
 * empty-cell marker of tables, not punctuation inside a sentence.
 */
const SRC = path.resolve(__dirname);
const EM_DASH = "—";

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === path.join(SRC, "components", "ui")) return [];
      if (full === path.join(SRC, "integrations")) return [];
      if (full === path.join(SRC, "test")) return [];
      return sourceFiles(full);
    }
    if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

function emDashCopy(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(EM_DASH)) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      const value = node.text;
      if (value.includes(EM_DASH) && value.trim() !== EM_DASH) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        hits.push(`${path.relative(SRC, file)}:${line + 1}: ${value.trim()}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

describe("UI copy", () => {
  it("never uses the em dash in user-facing strings", () => {
    const hits = sourceFiles(SRC).flatMap(emDashCopy);
    expect(hits).toEqual([]);
  });
});
