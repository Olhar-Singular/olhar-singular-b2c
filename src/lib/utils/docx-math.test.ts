import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";

// The app bundles mammoth's browser build (reads `arrayBuffer`); Node resolves the
// fs-based build, so point the tests at the same browser build the app ships.
vi.mock("mammoth", async () => {
  const browser = await import("mammoth/mammoth.browser.js");
  return { default: (browser as { default?: unknown }).default ?? browser };
});

import { extractDocxWithImages } from "./docx-utils";
import { linearizeOmml, linearizeDocumentMath } from "./docx-math";

// Real mammoth (browser build) + real JSZip: the bug (0276) is mammoth.extractRawText
// silently dropping Word equations (OMML), so only the real library reproduces it.

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";

function documentXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:m="${M}"><w:body>${body}</w:body></w:document>`;
}

async function buildDocx(body: string): Promise<File> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file("word/document.xml", documentXml(body));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new File([bytes], "prova.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

const run = (t: string) => `<m:r><m:t>${t}</m:t></m:r>`;
const math = (inner: string) => `<m:oMath>${inner}</m:oMath>`;
const parse = (inner: string) =>
  new DOMParser().parseFromString(
    `<m:oMath xmlns:m="${M}" xmlns:w="${W}">${inner}</m:oMath>`,
    "application/xml",
  ).documentElement;

describe("extractDocxWithImages with Word equations (0276)", () => {
  it("keeps inline and display equations in the extracted text", async () => {
    const file = await buildDocx(
      `<w:p><w:r><w:t xml:space="preserve">Resolva: </w:t></w:r>${math(
        `<m:f><m:num>${run("x")}</m:num><m:den>${run("2")}</m:den></m:f>${run("+3=7")}`,
      )}</w:p>` +
        `<w:p><m:oMathPara>${math(
          `<m:sSup><m:e>${run("a")}</m:e><m:sup>${run("2")}</m:sup></m:sSup>${run("+")}` +
            `<m:sSup><m:e>${run("b")}</m:e><m:sup>${run("2")}</m:sup></m:sSup>${run("=")}` +
            `<m:sSup><m:e>${run("c")}</m:e><m:sup>${run("2")}</m:sup></m:sSup>`,
        )}</m:oMathPara></w:p>`,
    );

    const { text } = await extractDocxWithImages(file);

    expect(text).toContain("Resolva: x/2+3=7");
    expect(text).toContain("a^2+b^2=c^2");
  });

  it("leaves a document without equations untouched", async () => {
    const file = await buildDocx(`<w:p><w:r><w:t>Questão 1</w:t></w:r></w:p>`);
    const { text } = await extractDocxWithImages(file);
    expect(text.trim()).toBe("Questão 1");
  });

  it("falls back to the original bytes when the file is not a zip", async () => {
    const buf = new TextEncoder().encode(documentXml("")).buffer as ArrayBuffer;
    expect(await linearizeDocumentMath(buf)).toBe(buf);
  });

  it("returns the original bytes when the zip has no document part", async () => {
    const zip = new JSZip();
    zip.file("other.xml", "<a/>");
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    expect(await linearizeDocumentMath(buf)).toBe(buf);
  });
});

describe("linearizeOmml", () => {
  it("parenthesizes compound fractions, sub/superscripts", () => {
    expect(
      linearizeOmml(
        parse(
          `<m:f><m:fPr/><m:num>${run("x+1")}</m:num><m:den>${run("2")}</m:den></m:f>` +
            `<m:sSub><m:e>${run("a")}</m:e><m:sub>${run("n-1")}</m:sub></m:sSub>` +
            `<m:sSubSup><m:e>${run("x")}</m:e><m:sub>${run("i")}</m:sub><m:sup>${run("2")}</m:sup></m:sSubSup>`,
        ),
      ),
    ).toBe("(x+1)/2a_(n-1)x_i^2");
  });

  it("renders radicals with and without degree", () => {
    expect(
      linearizeOmml(
        parse(
          `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${run("16")}</m:e></m:rad>` +
            run(" ") +
            `<m:rad><m:deg>${run("3")}</m:deg><m:e>${run("8")}</m:e></m:rad>`,
        ),
      ),
    ).toBe("sqrt(16) root(3)(8)");
  });

  it("renders delimiters with default and custom characters", () => {
    expect(
      linearizeOmml(
        parse(
          `<m:d><m:e>${run("a")}</m:e><m:e>${run("b")}</m:e></m:d>` +
            `<m:d><m:dPr><m:begChr m:val="["/><m:sepChr m:val=";"/><m:endChr m:val="]"/></m:dPr><m:e>${run("1")}</m:e><m:e>${run("2")}</m:e></m:d>`,
        ),
      ),
    ).toBe("(a,b)[1;2]");
  });

  it("renders n-ary operators with default and custom symbols", () => {
    expect(
      linearizeOmml(
        parse(
          `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${run("i=1")}</m:sub><m:sup>${run("n")}</m:sup><m:e>${run("i")}</m:e></m:nary>` +
            run(" ") +
            `<m:nary><m:sub/><m:sup/><m:e>${run("f")}</m:e></m:nary>`,
        ),
      ),
    ).toBe("∑_(i=1)^n i ∫f");
  });

  it("tolerates a structure with a missing part", () => {
    expect(linearizeOmml(parse(`<m:f><m:num>${run("x")}</m:num></m:f>`))).toBe("x/");
  });

  it("ignores formatting properties and unknown wrappers", () => {
    expect(
      linearizeOmml(parse(`<m:oMathParaPr/><m:box><m:e><m:r><w:rPr/><m:rPr/><m:t>y</m:t></m:r></m:e></m:box>`)),
    ).toBe("y");
  });
});
