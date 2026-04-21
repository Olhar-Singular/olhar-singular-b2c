import katex from "katex";

function renderKatex(latex: string): string {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: false, strict: false });
  } catch {
    return latex;
  }
}

export function renderMathToHtml(text: string): string {
  if (!text) return "";
  let result = text;

  result = result.replace(/\$([^$]+)\$/g, (_m, expr) => renderKatex(expr));
  result = result.replace(/\\[tdf]?frac\{([^{}]+)\}\{([^{}]+)\}/g, (_m, num, den) =>
    renderKatex(`\\frac{${num}}{${den}}`)
  );
  result = result.replace(/\\sqrt(?:\[([^\]]+)\])?\{([^{}]+)\}/g, (_m, n, body) =>
    renderKatex(n ? `\\sqrt[${n}]{${body}}` : `\\sqrt{${body}}`)
  );
  result = result.replace(/([A-Za-z0-9,.]+)\s*\^\s*\{([^{}]+)\}/g, (_m, base, exp) =>
    renderKatex(`${base}^{${exp}}`)
  );
  result = result.replace(/([A-Za-z0-9,.]+)\s*\^\s*\(([^)]+)\)/g, (_m, base, exp) =>
    renderKatex(`${base}^{${exp}}`)
  );
  result = result.replace(/([A-Za-z0-9,.]+)\s*\^\s*(-?\d+)/g, (_m, base, exp) =>
    renderKatex(`${base}^{${exp}}`)
  );
  result = result.replace(/(?<![a-zA-Z)\]])(\?|\d+)\s*\/\s*(\?|\d+)(?![a-zA-Z/(])/g, (_m, num, den) =>
    renderKatex(`\\tfrac{${num}}{${den}}`)
  );
  result = result.replace(/([A-Za-z])\s*_\s*\{([^{}]+)\}/g, (_m, base, sub) =>
    renderKatex(`${base}_{${sub}}`)
  );
  result = result.replace(/([A-Za-z])_(\d+)(?![A-Za-z_])/g, (_m, base, sub) =>
    renderKatex(`${base}_{${sub}}`)
  );
  result = result.replace(/\n/g, "<br/>");
  return result;
}

export function hasMathContent(text: string): boolean {
  if (!text) return false;
  return /\\frac|\\sqrt|\$[^$]+\$|(?<![a-zA-Z)\]])\d+\s*\/\s*\d+(?![a-zA-Z/(])|[A-Za-z0-9]\^|[A-Za-z]_\d/.test(text);
}
