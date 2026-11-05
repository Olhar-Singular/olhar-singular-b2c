import JSZip from "jszip";
import { UNREAD_FORMULA, UNREAD_IMAGE, UNREAD_OBJECT } from "@/lib/domain/unreadMarker";
import { scriptToText } from "@/lib/domain/scriptText";

/**
 * Everything mammoth's `extractRawText` silently loses or flattens, fixed in the
 * .docx before mammoth reads it:
 *
 * - Word equations (OMML, `<m:oMath>` / `<m:oMathPara>`) are dropped, leaving an empty
 *   hole where the formula was, and the AI invents another one (0276). Each equation
 *   becomes a plain text run with a linear rendering (`x/2+3=7`, `a^2+b^2=c^2`).
 * - Run superscript/subscript (`<w:vertAlign>`) is flattened: x² and 10³ read as x2 and
 *   103, a wrong value with no signal (C-02). They become `x^2`, `10^3`, `H_(2)O`.
 * - Old equation objects (MathType/OLE) and pictures in a format the AI cannot read
 *   (EMF, WMF, GIF...) vanish, leaving "Calcule ." (C-02/C-03). They become an explicit
 *   "[fórmula não lida]" / "[imagem não lida]" marker, never a hole.
 */

const M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_PKG_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const VML_NS = "urn:schemas-microsoft-com:vml";
const OFFICE_NS = "urn:schemas-microsoft-com:office:office";
const DML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const DOCUMENT_PART = "word/document.xml";
const DOCUMENT_RELS_PART = "word/_rels/document.xml.rels";
/** The picture types the AI extraction accepts (mirrors docx-utils EXTRACTABLE_IMAGE_TYPES). */
const READABLE_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

const mChild = (el: Element, name: string): Element | undefined =>
  Array.from(el.children).find((c) => c.namespaceURI === M_NS && c.localName === name);

const mChildren = (el: Element, name: string): Element[] =>
  Array.from(el.children).filter((c) => c.namespaceURI === M_NS && c.localName === name);

/** `m:val` of a property such as `<m:dPr><m:begChr m:val="["/></m:dPr>`. */
const propVal = (el: Element, pr: string, prop: string): string | null => {
  const node = mChild(el, pr) && mChild(mChild(el, pr)!, prop);
  return node ? node.getAttributeNS(M_NS, "val") : null;
};

/** Wraps a compound operand so `x+1` over `2` reads `(x+1)/2`, not `x+1/2`. */
const group = (s: string): string => (/^[\p{L}\p{N}.,]*$/u.test(s) ? s : `(${s})`);

const part = (el: Element, name: string): string => {
  const child = mChild(el, name);
  return child ? linearizeOmml(child) : "";
};

/** Combining accent -> the word the AI reads (`m:acc`'s default accent is the hat). */
const ACCENTS: Record<string, string> = {
  "\u20D7": "vec",
  "\u0302": "hat",
  "\u0303": "tilde",
  "\u0304": "overline",
};

export function linearizeOmml(el: Element): string {
  // Equation markup has no name clashes with WordprocessingML (a stray w:t is text too).
  switch (el.localName) {
    case "t":
      return `${el.textContent}`;
    case "f":
      return `${group(part(el, "num"))}/${group(part(el, "den"))}`;
    case "sSup":
      return `${part(el, "e")}^${group(part(el, "sup"))}`;
    case "sSub":
      return `${part(el, "e")}_${group(part(el, "sub"))}`;
    case "sSubSup":
      return `${part(el, "e")}_${group(part(el, "sub"))}^${group(part(el, "sup"))}`;
    case "rad": {
      const deg = part(el, "deg");
      return deg ? `root(${deg})(${part(el, "e")})` : `sqrt(${part(el, "e")})`;
    }
    case "d": {
      const [only, ...others] = mChildren(el, "e");
      // A system: Word draws the brace with an empty closing character around the rows.
      if (propVal(el, "dPr", "begChr") === "{" && propVal(el, "dPr", "endChr") === "" && !others.length) {
        const rows = only && mChild(only, "eqArr");
        if (rows) return linearizeOmml(rows);
      }
      const items = mChildren(el, "e").map(linearizeOmml);
      return (
        (propVal(el, "dPr", "begChr") ?? "(") +
        items.join(propVal(el, "dPr", "sepChr") ?? ",") +
        (propVal(el, "dPr", "endChr") ?? ")")
      );
    }
    case "m": {
      const rows = mChildren(el, "mr").map((row) => mChildren(row, "e").map(linearizeOmml).join(","));
      return `matrix(${rows.join("; ")})`;
    }
    case "eqArr":
      return `system(${mChildren(el, "e").map(linearizeOmml).join("; ")})`;
    case "func":
      return `${part(el, "fName")}(${part(el, "e")})`;
    case "limLow":
      return `${part(el, "e")}_${group(part(el, "lim"))}`;
    case "limUpp":
      return `${part(el, "e")}^${group(part(el, "lim"))}`;
    case "bar":
      return `overline(${part(el, "e")})`;
    case "acc":
      return `${ACCENTS[propVal(el, "accPr", "chr") ?? "\u0302"] ?? "acc"}(${part(el, "e")})`;
    case "sPre":
      return `_${group(part(el, "sub"))}^${group(part(el, "sup"))} ${part(el, "e")}`;
    case "nary": {
      const sub = part(el, "sub");
      const sup = part(el, "sup");
      return (
        (propVal(el, "naryPr", "chr") ?? "∫") +
        (sub ? `_${group(sub)}` : "") +
        (sup ? `^${group(sup)}` : "") +
        (sub || sup ? " " : "") +
        part(el, "e")
      );
    }
  }
  // Property blocks (m:rPr, m:fPr, w:rPr...) carry formatting only.
  return Array.from(el.children)
    .filter((c) => !c.localName.endsWith("Pr"))
    .map(linearizeOmml)
    .join("");
}

/** A fresh `<w:r><w:t xml:space="preserve">text</w:t></w:r>` in the document's own tree. */
function textRun(doc: Document, text: string, rPr?: Element | null): Element {
  const run = doc.createElementNS(W_NS, "w:r");
  if (rPr) run.appendChild(rPr);
  const node = doc.createElementNS(W_NS, "w:t");
  node.setAttribute("xml:space", "preserve");
  node.textContent = text;
  run.appendChild(node);
  return run;
}

const byNs = (doc: Document, ns: string, local: string): Element[] => Array.from(doc.getElementsByTagNameNS(ns, local));

function hasAncestor(el: Element, local: string): boolean {
  for (let n = el.parentElement; n; n = n.parentElement) if (n.localName === local) return true;
  return false;
}

/**
 * The direct child of the run (`w:r`) an element sits in (a picture or object always sits in
 * one), or null when it is already gone (the same child held two pictures) or the run was
 * deleted by a tracked change (`w:del`: deleted text and objects never enter the extraction).
 */
function runChild(el: Element): Element | null {
  if (hasAncestor(el, "del")) return null;
  let node: Element = el;
  while (!(node.parentElement?.namespaceURI === W_NS && node.parentElement.localName === "r")) {
    if (!node.parentElement) return null;
    node = node.parentElement;
  }
  return node;
}

/** Swaps ONLY the picture/object for the marker text: siblings in the same run stay. */
function replaceWithMarker(doc: Document, el: Element, marker: string): void {
  const child = runChild(el);
  if (!child) return;
  const node = doc.createElementNS(W_NS, "w:t");
  node.setAttribute("xml:space", "preserve");
  node.textContent = marker;
  child.replaceWith(node);
}

/** Replaces every top-level equation in the document part with a text run. */
function replaceMath(doc: Document): void {
  const outer = Array.from(doc.getElementsByTagNameNS(M_NS, "*")).filter(
    (el) =>
      (el.localName === "oMathPara" || el.localName === "oMath") &&
      !(el.parentElement?.namespaceURI === M_NS && el.parentElement.localName === "oMathPara"),
  );
  for (const el of outer) {
    const maths = el.localName === "oMathPara" ? mChildren(el, "oMath") : [el];
    el.replaceWith(textRun(doc, maths.map(linearizeOmml).join(" ")));
  }
}

/** `rId5` -> `emf`, from `word/_rels/document.xml.rels`. */
function parseRelationshipExtensions(xml: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!xml) return map;
  const rels = new DOMParser().parseFromString(xml, "application/xml");
  for (const rel of Array.from(rels.getElementsByTagNameNS(REL_PKG_NS, "Relationship"))) {
    map.set(`${rel.getAttribute("Id")}`, `${rel.getAttribute("Target")}`.split(".").pop()!.toLowerCase());
  }
  return map;
}

/**
 * Old equation objects (MathType/OLE) and pictures the AI cannot read are dropped by
 * mammoth without a trace. Each becomes an explicit marker so the gap is visible to
 * the extraction and to the teacher (C-02/C-03).
 */
function markUnreadable(doc: Document, extensions: Map<string, string>): void {
  for (const object of byNs(doc, W_NS, "object")) {
    const progId = byNs(doc, OFFICE_NS, "OLEObject").find((o) => object.contains(o))?.getAttribute("ProgID") ?? "";
    const marker = /equation|mathtype|dsmt/i.test(progId) ? UNREAD_FORMULA : UNREAD_OBJECT;
    replaceWithMarker(doc, object, marker);
  }

  const unreadable = (rid: string | null): boolean => !READABLE_IMAGE_EXTENSIONS.has(`${extensions.get(`${rid}`)}`);
  const pictures: [Element, string | null][] = [
    ...byNs(doc, DML_NS, "blip").map((blip): [Element, string | null] => [blip, blip.getAttributeNS(REL_NS, "embed")]),
    ...byNs(doc, VML_NS, "imagedata")
      // The VML twin of a drawing inside mc:Fallback would count the picture twice.
      .filter((img) => !hasAncestor(img, "Fallback"))
      .map((img): [Element, string | null] => [img, img.getAttributeNS(REL_NS, "id")]),
  ];
  for (const [element, rid] of pictures) {
    if (unreadable(rid)) replaceWithMarker(doc, element, UNREAD_IMAGE);
  }
}

const isW = (el: Element | null | undefined, local: string): boolean =>
  !!el && el.namespaceURI === W_NS && el.localName === local;

/** Markers Word drops between split runs (spell-check, bookmarks): they carry no text. */
const TRANSPARENT = new Set(["proofErr", "bookmarkStart", "bookmarkEnd"]);

const TEXT_CHILDREN: Record<string, string> = { t: "", tab: "\t", br: "\n", noBreakHyphen: "-" };

/** "superscript" | "subscript" for a plain-text run with that alignment, else null. */
function scriptKind(run: Element): "superscript" | "subscript" | null {
  const rPr = Array.from(run.children).find((c) => isW(c, "rPr"));
  const align = rPr && Array.from(rPr.children).find((c) => isW(c, "vertAlign"));
  const val = align?.getAttributeNS(W_NS, "val");
  if (val !== "superscript" && val !== "subscript") return null;
  // A run carrying a picture, field or footnote mark is not just text: leave it alone.
  const onlyText = Array.from(run.children).every((c) => c === rPr || (isW(c, c.localName) && c.localName in TEXT_CHILDREN));
  return onlyText ? val : null;
}

function runText(run: Element): string {
  return Array.from(run.children)
    .filter((c) => c.localName in TEXT_CHILDREN)
    .map((c) => (c.localName === "t" ? `${c.textContent}` : TEXT_CHILDREN[c.localName]))
    .join("");
}

/** The first character of the text that comes after `from`, skipping transparent markers. */
function nextChar(from: Element): string {
  for (let n = from.nextElementSibling; n; n = n.nextElementSibling) {
    if (isW(n, "r")) return runText(n).charAt(0);
    if (!(n.namespaceURI === W_NS && TRANSPARENT.has(n.localName))) return "";
  }
  return "";
}

/**
 * Elements whose direct children are runs: the paragraph and the wrappers Word puts around
 * runs (tracked insertions, links, smart tags, content controls). Deleted
 * text (`w:del`) is skipped: it never reaches the extraction.
 */
const RUN_CONTAINERS = new Set(["p", "ins", "moveTo", "hyperlink", "smartTag", "sdtContent", "customXml"]);

/**
 * Turns the superscript/subscript runs of a paragraph into `^` / `_` text, so the value
 * survives raw-text extraction: x² -> `x^2`, 10³ -> `10^3`, x²y -> `x^(2)y`.
 * Neighbouring runs of the same alignment (Word splits them freely) are one group.
 */
function linearizeScripts(doc: Document): void {
  for (const paragraph of byNs(doc, W_NS, "*").filter((el) => RUN_CONTAINERS.has(el.localName) && !hasAncestor(el, "del"))) {
    let node = paragraph.firstElementChild;
    while (node) {
      const kind = isW(node, "r") ? scriptKind(node) : null;
      if (!kind) {
        node = node.nextElementSibling;
        continue;
      }
      const first: Element = node;
      let text = runText(first);
      let last: Element = first;
      for (let n = first.nextElementSibling; n; n = n.nextElementSibling) {
        if (isW(n, "r") && scriptKind(n) === kind) {
          text += runText(n);
          last = n;
        } else if (!(n.namespaceURI === W_NS && TRANSPARENT.has(n.localName))) break;
      }
      const next = last.nextElementSibling;
      const rest = nextChar(last);
      if (!text.trim()) {
        node = next;
        continue;
      }
      const rPr = Array.from(first.children).find((c) => isW(c, "rPr"))?.cloneNode(true) as Element;
      for (const align of Array.from(rPr.children).filter((c) => isW(c, "vertAlign"))) align.remove();
      const replacement = textRun(doc, scriptToText(kind === "superscript" ? "sup" : "sub", text, rest), rPr);
      const group: Element[] = [first];
      while (group[group.length - 1] !== last) group.push(group[group.length - 1].nextElementSibling as Element);
      first.replaceWith(replacement);
      for (const old of group.slice(1)) old.remove();
      node = replacement.nextElementSibling;
    }
  }
}

/**
 * Returns a copy of the .docx with equations, superscripts/subscripts and unreadable
 * objects turned into text. Anything that is not a readable docx comes back untouched
 * so mammoth reports its own error.
 */
export async function linearizeDocumentMath(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return buffer;
  }
  const entry = zip.file(DOCUMENT_PART);
  if (!entry) return buffer;
  const xml = await entry.async("string");
  if (!/oMath|vertAlign|<w:object|<w:drawing|<w:pict/.test(xml)) return buffer;

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const rels = await zip.file(DOCUMENT_RELS_PART)?.async("string");
  replaceMath(doc);
  markUnreadable(doc, parseRelationshipExtensions(rels ?? null));
  linearizeScripts(doc);
  zip.file(DOCUMENT_PART, new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({ type: "arraybuffer" });
}
