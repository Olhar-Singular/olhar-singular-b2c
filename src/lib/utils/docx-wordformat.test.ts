import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";

// Same trick as docx-math.test.ts: real mammoth (browser build) + real JSZip, over a
// .docx laid out the way Word writes it (runs with <w:vertAlign>, <m:oMath>,
// <m:oMathPara>, <w:object> for MathType, <w:drawing> for pictures). Only the real
// library reproduces what the teacher's file does to the text (C-02, lote 5).
vi.mock("mammoth", async () => {
  const browser = await import("mammoth/mammoth.browser.js");
  return { default: (browser as { default?: unknown }).default ?? browser };
});

import { extractDocxText, extractDocxWithImages } from "./docx-utils";
import { UNREAD_FORMULA, UNREAD_IMAGE, UNREAD_OBJECT } from "@/lib/domain/unreadMarker";

const NS =
  `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
  `xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ` +
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
  `xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" ` +
  `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
  `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
  `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;

type Media = Record<string, string>; // rId -> "media/file.ext"

async function buildDocx(body: string, media: Media = {}): Promise<File> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="emf" ContentType="image/x-emf"/><Default Extension="wmf" ContentType="image/x-wmf"/><Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.oleObject"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  const rels = Object.entries(media)
    .map(
      ([id, target]) =>
        `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`,
    )
    .join("");
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
  );
  for (const target of Object.values(media)) zip.file(`word/${target}`, new Uint8Array([1, 2, 3, 4]));
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}</w:body></w:document>`,
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new File([bytes], "prova.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

const t = (s: string) => `<w:t xml:space="preserve">${s}</w:t>`;
const r = (s: string) => `<w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="24"/></w:rPr>${t(s)}</w:r>`;
const sup = (s: string) => `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr>${t(s)}</w:r>`;
const sub = (s: string) => `<w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr>${t(s)}</w:r>`;
const p = (...runs: string[]) => `<w:p>${runs.join("")}</w:p>`;
const mr = (s: string) => `<m:r><m:t>${s}</m:t></m:r>`;

/** Both entry points the app uses: the wizard's direct upload and the question bank's. */
async function bothPaths(file: File): Promise<string[]> {
  return [(await extractDocxWithImages(file)).text, await extractDocxText(file)];
}

describe("C-02: sobrescrito e subscrito de run (w:vertAlign)", () => {
  it("x² e 10³ nunca viram x2 e 103", async () => {
    const file = await buildDocx(
      p(r("1) Calcule x"), sup("2"), r(" + 3x + y"), sub("1"), r(" para x = 4 e "), r("10"), sup("3"), r(".")),
    );
    for (const text of await bothPaths(file)) {
      expect(text).toContain("x^2 + 3x + y_1 para x = 4 e 10^3.");
      expect(text).not.toMatch(/x2|103/);
    }
  });

  it("junta runs vizinhos do mesmo expoente e parentetiza o que não é simples", async () => {
    const file = await buildDocx(p(r("a"), sup("n"), sup("+1"), r(" e b"), sup("-2"), r(" e c"), sup("2")));
    const [text] = await bothPaths(file);
    expect(text).toContain("a^(n+1) e b^(-2) e c^2");
  });

  it("parentetiza quando o texto seguinte colaria no expoente (x²y não é x^(2y))", async () => {
    const file = await buildDocx(p(r("x"), sup("2"), r("y e H"), sub("2"), r("O")));
    const [text] = await bothPaths(file);
    expect(text).toContain("x^(2)y e H_(2)O");
  });

  it("sobrescrito no começo do parágrafo, entre parágrafos e em célula de tabela", async () => {
    const file = await buildDocx(
      p(sup("2"), r(" é o expoente")) +
        `<w:tbl><w:tr><w:tc>${p(r("m"), sup("2"))}</w:tc><w:tc>${p(r("cm"), sup("3"))}</w:tc></w:tr></w:tbl>`,
    );
    const [text] = await bothPaths(file);
    expect(text).toContain("^2 é o expoente");
    expect(text).toMatch(/m\^2\s*cm\^3/);
  });

  it("vertAlign baseline e run sem formatação ficam como estão", async () => {
    const file = await buildDocx(
      p(`<w:r><w:rPr><w:vertAlign w:val="baseline"/></w:rPr>${t("normal")}</w:r>`, r(" 10"), r("3")),
    );
    const [text] = await bothPaths(file);
    expect(text.trim()).toBe("normal 103");
  });

  it("mantém o tab dentro do sobrescrito, sem fundir os dois números", async () => {
    const file = await buildDocx(
      p(r("a"), `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr>${t("1")}<w:tab/>${t("2")}</w:r>`),
    );
    const [text] = await bothPaths(file);
    expect(text).toContain("a^(1\t2)");
  });

  it("convive com equação do Word no mesmo parágrafo", async () => {
    const file = await buildDocx(
      p(r("Se x"), sup("2"), r(" = "), `<m:oMath><m:sSup><m:e>${mr("y")}</m:e><m:sup>${mr("3")}</m:sup></m:sSup></m:oMath>`),
    );
    const [text] = await bothPaths(file);
    expect(text).toContain("Se x^2 = y^3");
  });
});

describe("C-02: estruturas de equação do Word que mudariam o valor", () => {
  const eq = (inner: string) => p(`<m:oMathPara><m:oMath>${inner}</m:oMath></m:oMathPara>`);

  it("matriz: as linhas e colunas não se fundem (1 2 / 3 4 não vira 1234)", async () => {
    const file = await buildDocx(
      eq(
        `<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e><m:m><m:mPr/>` +
          `<m:mr><m:e>${mr("1")}</m:e><m:e>${mr("2")}</m:e></m:mr>` +
          `<m:mr><m:e>${mr("3")}</m:e><m:e>${mr("4")}</m:e></m:mr></m:m></m:e></m:d>`,
      ),
    );
    const [text] = await bothPaths(file);
    expect(text).toContain("[matrix(1,2; 3,4)]");
  });

  it("sistema (eqArr dentro de chave): cada equação fica separada", async () => {
    const file = await buildDocx(
      eq(
        `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr><m:eqArrPr/>` +
          `<m:e>${mr("x+y=5")}</m:e><m:e>${mr("x−y=1")}</m:e></m:eqArr></m:e></m:d>`,
      ),
    );
    const [text] = await bothPaths(file);
    expect(text).toContain("system(x+y=5; x−y=1)");
    expect(text).not.toContain("x+y=5x−y=1");
  });

  it("raiz, fração, função, limite e barra de dízima", async () => {
    const file = await buildDocx(
      eq(
        `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${mr("144")}</m:e></m:rad>` +
          mr(" ; ") +
          `<m:f><m:num>${mr("1")}</m:num><m:den><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${mr("3")}</m:e></m:rad></m:den></m:f>` +
          mr(" ; ") +
          `<m:func><m:fName>${mr("sen")}</m:fName><m:e>${mr("30°")}</m:e></m:func>` +
          mr(" ; ") +
          `<m:limLow><m:e>${mr("lim")}</m:e><m:lim>${mr("x→0")}</m:lim></m:limLow>` +
          mr(" ; 0,") +
          `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${mr("3")}</m:e></m:bar>`,
      ),
    );
    const [text] = await bothPaths(file);
    expect(text).toContain("sqrt(144) ; 1/(sqrt(3)) ; sen(30°) ; lim_(x→0) ; 0,overline(3)");
  });

  it("pré-índice (isótopo) e acento (vetor)", async () => {
    const file = await buildDocx(
      eq(
        `<m:sPre><m:sub>${mr("6")}</m:sub><m:sup>${mr("12")}</m:sup><m:e>${mr("C")}</m:e></m:sPre>` +
          mr(" ; ") +
          `<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e>${mr("v")}</m:e></m:acc>`,
      ),
    );
    const [text] = await bothPaths(file);
    expect(text).toContain("_6^12 C ; vec(v)");
  });
});

describe("C-02: equação como objeto antigo ou imagem não pode sumir em silêncio", () => {
  const mathType = (rid: string) =>
    `<w:r><w:object w:dxaOrig="800" w:dyaOrig="300"><v:shape id="_x0000_i1025" type="#_x0000_t75"><v:imagedata r:id="${rid}" o:title=""/></v:shape>` +
    `<o:OLEObject Type="Embed" ProgID="Equation.DSMT4" ShapeID="_x0000_i1025" DrawAspect="Content" ObjectID="_1" r:id="rId9"/></w:object></w:r>`;
  const picture = (rid: string) =>
    `<w:r><w:drawing><wp:inline><wp:docPr id="1" name="Imagem 1"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

  it("objeto MathType/Equation (OLE) vira o marcador de fórmula não lida", async () => {
    const file = await buildDocx(p(r("2) Calcule "), mathType("rId5"), r(".")), { rId5: "media/image1.emf" });
    for (const text of await bothPaths(file)) {
      expect(text).toContain(`2) Calcule ${UNREAD_FORMULA}.`);
      expect(text).not.toContain("Calcule .");
    }
  });

  it("outro objeto embutido (planilha, gráfico) vira o marcador de objeto não lido", async () => {
    const file = await buildDocx(
      p(
        r("Veja "),
        `<w:r><w:object><v:shape><v:imagedata r:id="rId5"/></v:shape><o:OLEObject ProgID="Excel.Sheet.12" r:id="rId9"/></w:object></w:r>`,
      ),
      { rId5: "media/image1.emf" },
    );
    const [text] = await bothPaths(file);
    expect(text).toContain(`Veja ${UNREAD_OBJECT}`);
  });

  it("imagem em formato que a IA não lê (EMF/WMF) vira o marcador de imagem não lida", async () => {
    const file = await buildDocx(p(r("Calcule "), picture("rId5"), r(" e "), picture("rId6")), {
      rId5: "media/image1.emf",
      rId6: "media/image2.wmf",
    });
    const { text, images } = await extractDocxWithImages(file);
    expect(text).toContain(`Calcule ${UNREAD_IMAGE} e ${UNREAD_IMAGE}`);
    expect(images).toEqual([]);
  });

  it("imagem PNG segue para a IA e o texto fica como estava", async () => {
    const file = await buildDocx(p(r("Veja "), picture("rId5")), { rId5: "media/image1.png" });
    const { text, images } = await extractDocxWithImages(file);
    expect(text).toContain("Veja");
    expect(text).not.toContain("não lid");
    expect(images).toHaveLength(1);
  });

  it("figura com relação quebrada ou sem alvo é tratada como não lida", async () => {
    const file = await buildDocx(p(r("Veja "), picture("rIdInexistente")));
    const [text] = await bothPaths(file);
    expect(text).toContain(`Veja ${UNREAD_IMAGE}`);
  });
});

describe("C-02: bordas do que o Word grava", () => {
  const eq = (inner: string) => p(`<m:oMathPara><m:oMath>${inner}</m:oMath></m:oMathPara>`);
  const acc = (chr: string | null, e: string) =>
    `<m:acc>${chr === null ? "" : `<m:accPr><m:chr m:val="${chr}"/></m:accPr>`}<m:e>${mr(e)}</m:e></m:acc>`;

  it("acentos: chapéu (padrão), til, barra, vetor e acento desconhecido", async () => {
    const file = await buildDocx(
      eq(acc(null, "a") + mr(";") + acc("\u0303", "b") + mr(";") + acc("\u0304", "c") + mr(";") + acc("\u20D7", "d") + mr(";") + acc("∘", "e")),
    );
    const [text] = await bothPaths(file);
    expect(text).toContain("hat(a);tilde(b);overline(c);vec(d);acc(e)");
  });

  it("chave sem equação dentro, ou com várias, usa o desenho normal de delimitadores", async () => {
    const file = await buildDocx(
      eq(
        `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e>${mr("a")}</m:e></m:d>` +
          mr(";") +
          `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr><m:e>${mr("p")}</m:e></m:eqArr></m:e><m:e>${mr("q")}</m:e></m:d>` +
          mr(";") +
          `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr></m:d>` +
          mr(";") +
          `<m:limUpp><m:e>${mr("x")}</m:e><m:lim>${mr("n")}</m:lim></m:limUpp>`,
      ),
    );
    const [text] = await bothPaths(file);
    expect(text).toContain("{a;{system(p),q;{;x^n");
  });

  it("sobrescrito só com espaço fica como está; marcadores do corretor entre os runs não separam o grupo", async () => {
    const proof = `<w:proofErr w:type="spellStart"/>`;
    const file = await buildDocx(
      p(r("a"), sup(" "), r(" b"), sup("1"), proof, sup("0"), `<w:bookmarkEnd w:id="1"/>`, r("c"), `<w:bookmarkStart w:id="2" w:name="x"/>`),
    );
    const [text] = await bothPaths(file);
    expect(text).toContain("a  b^(10)c");
  });

  it("run de sobrescrito com campo (fldChar) não é só texto: fica como o Word escreveu", async () => {
    const file = await buildDocx(
      p(r("a"), `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:fldChar w:fldCharType="begin"/>${t("1")}</w:r>`),
    );
    const [text] = await bothPaths(file);
    expect(text).toContain("a1");
  });

  it("sobrescrito seguido de outro elemento (link) fecha o grupo sem texto depois", async () => {
    const file = await buildDocx(p(r("a"), sup("2"), `<w:hyperlink><w:r>${t("link")}</w:r></w:hyperlink>`));
    const [text] = await bothPaths(file);
    expect(text).toContain("a^2link");
  });

  const drawingEmf = `<w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

  it("a versão VML (mc:Fallback) da mesma figura não conta duas vezes", async () => {
    const both =
      `<w:r><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></mc:Choice>` +
      `<mc:Fallback><w:pict><v:shape><v:imagedata r:id="rId5"/></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
    const file = await buildDocx(p(r("Veja "), both), { rId5: "media/image1.emf" });
    const [text] = await bothPaths(file);
    expect(text.match(/\[imagem não lida\]/g)).toHaveLength(1);
  });

  it("figura VML solta (w:pict): EMF vira marcador, PNG segue", async () => {
    const pict = (rid: string) => `<w:r><w:pict><v:shape><v:imagedata r:id="${rid}"/></v:shape></w:pict></w:r>`;
    const file = await buildDocx(p(r("a "), pict("rId5"), r(" b "), pict("rId6")), {
      rId5: "media/image1.emf",
      rId6: "media/image2.png",
    });
    const { text, images } = await extractDocxWithImages(file);
    expect(text).toContain(`a ${UNREAD_IMAGE} b`);
    expect(text.match(/não lid/g)).toHaveLength(1);
    expect(images.length).toBeLessThanOrEqual(1);
  });

  it("sem arquivo de relações, ou com relação incompleta, a figura é não lida (nunca quebra)", async () => {
    const file = await buildDocx(p(r("Veja "), drawingEmf));
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    zip.remove("word/_rels/document.xml.rels");
    const noRels = new File([await zip.generateAsync({ type: "uint8array" })], "x.docx");
    const [text] = await bothPaths(noRels);
    expect(text).toContain(`Veja ${UNREAD_IMAGE}`);

    zip.file(
      "word/_rels/document.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship/></Relationships>`,
    );
    const broken = new File([await zip.generateAsync({ type: "uint8array" })], "y.docx");
    const [text2] = await bothPaths(broken);
    expect(text2).toContain(`Veja ${UNREAD_IMAGE}`);
  });

  it("objeto sem OLEObject ou sem ProgID vira 'objeto não lido'", async () => {
    const file = await buildDocx(
      p(
        r("a "),
        `<w:r><w:object><v:shape/></w:object></w:r>`,
        r(" b "),
        `<w:r><w:object><o:OLEObject Type="Embed"/></w:object></w:r>`,
      ),
    );
    const [text] = await bothPaths(file);
    expect(text).toContain(`a ${UNREAD_OBJECT} b ${UNREAD_OBJECT}`);
  });
});

describe("lote 5b: F1, o texto do mesmo run do objeto ou da figura não some", () => {
  const sameRunDrawing = (text: string, after = "") =>
    `<w:r>${t(text)}<w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>${after}</w:r>`;
  const sameRunOle = (text: string, after = "") =>
    `<w:r>${t(text)}<w:object><v:shape><v:imagedata r:id="rId5"/></v:shape><o:OLEObject ProgID="Equation.DSMT4" r:id="rId9"/></w:object>${after}</w:r>`;

  it("figura EMF no mesmo run do texto: o texto fica e o marcador entra", async () => {
    const file = await buildDocx(p(sameRunDrawing("Calcule o valor de ", t(" para x = 4."))), { rId5: "media/image1.emf" });
    for (const text of await bothPaths(file)) {
      expect(text).toContain("Calcule o valor de");
      expect(text).toContain(UNREAD_IMAGE);
      expect(text).toContain("para x = 4.");
    }
  });

  it("objeto OLE no mesmo run do texto: o texto fica e o marcador entra", async () => {
    const file = await buildDocx(p(sameRunOle("Resolva: ", t(" e confira."))), { rId5: "media/image1.emf" });
    for (const text of await bothPaths(file)) {
      expect(text).toContain("Resolva:");
      expect(text).toContain(UNREAD_FORMULA);
      expect(text).toContain("e confira.");
    }
  });

  it("duas figuras ilegíveis no mesmo run dão dois marcadores, sem quebrar", async () => {
    const two = `<w:r>${t("A ")}<w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId5"/><a:blip r:embed="rId6"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>${t(" B")}</w:r>`;
    const file = await buildDocx(p(two), { rId5: "media/image1.emf", rId6: "media/image2.wmf" });
    const [text] = await bothPaths(file);
    expect(text).toContain("A ");
    expect(text).toContain(" B");
    expect(text).toContain(UNREAD_IMAGE);
  });
});

describe("lote 5b: F4, sobrescrito e subscrito dentro de controle de alterações, link e etiquetas", () => {
  const wrap = (tag: string, ...runs: string[]) => `<w:${tag}>${runs.join("")}</w:${tag}>`;

  it.each([
    ["w:ins (alteração rastreada)", (inner: string) => `<w:ins w:id="1" w:author="a">${inner}</w:ins>`],
    ["w:hyperlink", (inner: string) => `<w:hyperlink w:anchor="x">${inner}</w:hyperlink>`],
    ["w:smartTag", (inner: string) => `<w:smartTag w:uri="u" w:element="e">${inner}</w:smartTag>`],
    ["w:sdt (controle de conteúdo)", (inner: string) => `<w:sdt><w:sdtContent>${inner}</w:sdtContent></w:sdt>`],
  ])("%s: x² e 10³ não viram x2 e 103", async (_name, around) => {
    const file = await buildDocx(p(r("Calcule "), around(r("x") + sup("2") + r(" + ") + r("10") + sup("3"))));
    for (const text of await bothPaths(file)) {
      expect(text).toContain("x^2 + 10^3");
      expect(text).not.toMatch(/x2|103/);
    }
  });

  it("wrappers aninhados (sdt > ins > hyperlink)", async () => {
    const inner = wrap("hyperlink", r("m"), sup("2"));
    const file = await buildDocx(p(`<w:sdt><w:sdtContent><w:ins w:id="2" w:author="a">${inner}</w:ins></w:sdtContent></w:sdt>`));
    const [text] = await bothPaths(file);
    expect(text).toContain("m^2");
  });

  it("texto apagado (w:del) não entra, nem o sobrescrito dele, nem marcador de objeto apagado", async () => {
    const deletedSup = `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:delText xml:space="preserve">9</w:delText></w:r>`;
    const deletedOle = `<w:r><w:object><v:shape><v:imagedata r:id="rId5"/></v:shape><o:OLEObject ProgID="Equation.DSMT4" r:id="rId9"/></w:object></w:r>`;
    const file = await buildDocx(
      p(r("a"), sup("2"), `<w:del w:id="3" w:author="a">${r("ZZ")}${deletedSup}${deletedOle}</w:del>`, r(" fim")),
      { rId5: "media/image1.emf" },
    );
    for (const text of await bothPaths(file)) {
      expect(text).toContain("a^2");
      expect(text).toContain("fim");
      expect(text).not.toContain("9");
      expect(text).not.toContain("ZZ");
      expect(text).not.toContain("não lid");
    }
  });
});
