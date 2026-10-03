import JSZip from "jszip";

/**
 * Word equations (OMML, `<m:oMath>` / `<m:oMathPara>`) are dropped by mammoth,
 * which only emits an "unrecognised element" warning. Without this pass the
 * exam reaches the AI with an empty hole where the formula was and the AI
 * invents another one (0276). Here each equation becomes a plain text run
 * with a linear rendering (`x/2+3=7`, `a^2+b^2=c^2`) before mammoth reads it.
 */

const M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DOCUMENT_PART = "word/document.xml";

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
      const items = mChildren(el, "e").map(linearizeOmml);
      return (
        (propVal(el, "dPr", "begChr") ?? "(") +
        items.join(propVal(el, "dPr", "sepChr") ?? ",") +
        (propVal(el, "dPr", "endChr") ?? ")")
      );
    }
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

/** Replaces every top-level equation in the document part with a text run. */
function replaceMath(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const outer = Array.from(doc.getElementsByTagNameNS(M_NS, "*")).filter(
    (el) =>
      (el.localName === "oMathPara" || el.localName === "oMath") &&
      !(el.parentElement?.namespaceURI === M_NS && el.parentElement.localName === "oMathPara"),
  );
  for (const el of outer) {
    const maths = el.localName === "oMathPara" ? mChildren(el, "oMath") : [el];
    const run = doc.createElementNS(W_NS, "w:r");
    const text = doc.createElementNS(W_NS, "w:t");
    text.setAttribute("xml:space", "preserve");
    text.textContent = maths.map(linearizeOmml).join(" ");
    run.appendChild(text);
    el.replaceWith(run);
  }
  return new XMLSerializer().serializeToString(doc);
}

/**
 * Returns a copy of the .docx with equations turned into text. Anything that is
 * not a readable docx comes back untouched so mammoth reports its own error.
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
  if (!xml.includes("oMath")) return buffer;
  zip.file(DOCUMENT_PART, replaceMath(xml));
  return zip.generateAsync({ type: "arraybuffer" });
}
